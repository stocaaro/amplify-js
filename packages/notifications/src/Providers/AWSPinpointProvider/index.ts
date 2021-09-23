/*
 * Copyright 2017-2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance with
 * the License. A copy of the License is located at
 *
 *     http://aws.amazon.com/apache2.0/
 *
 * or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
 * CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions
 * and limitations under the License.
 */

import { Credentials, StorageHelper } from '@aws-amplify/core';
import { getCachedUuid as getEndpointId } from '@aws-amplify/cache';
import {
	GetInAppMessagesCommand,
	GetInAppMessagesCommandInput,
	UpdateEndpointCommand,
	UpdateEndpointCommandInput,
	PinpointClient,
} from '@aws-sdk/client-pinpoint';
import { v1 as uuid } from 'uuid';

import SessionTracker, {
	SessionState,
	SessionStateChangeHandler,
} from '../../SessionTracker';
import {
	InAppMessage,
	NotificationsCategory,
	NotificationEvent,
	NotificationsProvider,
} from '../../types';
import {
	DailyInAppMessageCounter,
	InAppMessageCountMap,
	InAppMessageCounts,
} from './types';
import {
	clearMemo,
	dispatchNotificationEvent,
	getStartOfDay,
	isBeforeEndDate,
	logger,
	matchesAttributes,
	matchesEventType,
	matchesMetrics,
} from './utils';

const MESSAGE_DAILY_COUNT_KEY = 'pinpointProvider_inAppMessages_dailyCount';
const MESSAGE_TOTAL_COUNT_KEY = 'pinpointProvider_inAppMessages_totalCount';

export default class AWSPinpointProvider implements NotificationsProvider {
	static category: NotificationsCategory = 'Notifications';
	static providerName = 'AWSPinpoint';

	private config: Record<string, any> = {};
	private endpointUpdated = false;
	private initialized = false;
	private sessionMessageCountMap: InAppMessageCountMap;
	private sessionTracker: SessionTracker;

	constructor() {
		this.sessionMessageCountMap = {};
		this.config = {
			storage: new StorageHelper().getStorage(),
		};
	}

	/**
	 * get the category of the plugin
	 */
	getCategory() {
		return AWSPinpointProvider.category;
	}

	/**
	 * get provider name of the plugin
	 */
	getProviderName(): string {
		return AWSPinpointProvider.providerName;
	}

	configure = (config = {}): object => {
		logger.debug('configure', config);
		this.config = Object.assign({}, this.config, config);

		this.sessionTracker = new SessionTracker(this.sessionStateChangeHandler);
		this.sessionTracker.start();
		dispatchNotificationEvent('pinpointProvider_configured', null);
		return this.config;
	}

	syncInAppMessages = async () => {
		if (!this.initialized) {
			await this.init();
		}
		// There is no way to granuarly reconcile the filter memoization as the keys are composited from a message id and
		// event properties thus opting to just clear them out when syncing messages rather than leave potentially
		// obsolete entries that will no longer serve any purpose.
		clearMemo();
		const { appId, endpointId, pinpointClient } = this.config;
		try {
			if (!pinpointClient) {
				await this.initPinpointClient();
			}
			if (!this.endpointUpdated) {
				await this.updateEndpoint();
			}
			const input: GetInAppMessagesCommandInput = {
				ApplicationId: appId,
				EndpointId: endpointId,
			};
			const command: GetInAppMessagesCommand = new GetInAppMessagesCommand(
				input
			);
			logger.debug('getting in-app messages', input);
			const response = await this.config.pinpointClient.send(command);
			const { InAppMessageCampaigns } = response.InAppMessagesResponse;

			// Create a lookup of ids to avoid nesting .includes() inside of .reduce() when updating total counts
			const idMap = InAppMessageCampaigns.reduce((acc, item) => {
				acc[item.CampaignId] = true;
				return acc;
			}, {});
			// Clear out stored total counts for messages that are no longer active (i.e. not returned from service)
			this.setTotalCountMap(
				Object.entries(this.getTotalCountMap()).reduce((acc, [key, val]) => {
					if (idMap[key]) {
						acc[key] = val;
					}
					return acc;
				}, {})
			);

			dispatchNotificationEvent('syncInAppMessages', InAppMessageCampaigns);
			return InAppMessageCampaigns;
		} catch (err) {
			logger.error('Error syncing in-app messages', err);
		}
	}

	filterMessages = async (
		messages: InAppMessage[] = [],
		event: NotificationEvent
	): Promise<InAppMessage[]> => {
		if (!this.initialized) {
			await this.init();
		}
		return messages.filter(message => {
			const { CampaignId } = message;
			return (
				// The match utils have built in memoization but having the event type matcher first is important as the
				// memoization strategy there is more efficient as it does not rely on JSON.stringify to create its key. Having
				// this matcher first will allow this function to short-circuit on the more efficient memoization.
				matchesEventType(message, event) &&
				matchesAttributes(message, event) &&
				matchesMetrics(message, event) &&
				isBeforeEndDate(message) &&
				this.isBelowCap(message, CampaignId)
			);
		});
	}

	recordInAppMessageDisplayed = async (messageId: string): Promise<void> => {
		if (!this.initialized) {
			await this.init();
		}
		await this.incrementCounts(messageId);
	}

	private init = async () => {
		const { appId, disabled, storage } = this.config;
		const providerName = this.getProviderName();
		if (disabled) {
			logger.debug(`${providerName} is disabled`);
			return;
		}
		const cacheKey = `${providerName}_${appId}`;
		try {
			// Only run sync() if it's available (i.e. React Native)
			if (typeof storage.sync === 'function') {
				await storage.sync();
			}
			this.config.endpointId = await getEndpointId(cacheKey);
			this.initialized = true;
		} catch (err) {
			logger.error(`Failed to initialize ${providerName}`, err);
		}
	}

	private initPinpointClient = async () => {
		const { appId, region } = this.config;

		const credentials = await this.getCredentials();

		if (!appId || !credentials || !region) {
			throw new Error(
				'One or more of credentials, appId or region is not configured'
			);
		}

		this.config.pinpointClient = new PinpointClient({
			region,
			credentials,
		});
	}

	private getCredentials = async () => {
		try {
			const credentials = await Credentials.get();
			if (!credentials) {
				logger.debug('no credentials found');
				return null;
			}
			return Credentials.shear(credentials);
		} catch (err) {
			logger.error('Error getting credentials:', err);
			return null;
		}
	}

	private updateEndpoint = async (): Promise<void> => {
		const { appId, endpointId, pinpointClient } = this.config;
		const input: UpdateEndpointCommandInput = {
			ApplicationId: appId,
			EndpointId: endpointId,
			EndpointRequest: {
				RequestId: uuid(),
				EffectiveDate: new Date().toISOString(),
			},
		};
		const command: UpdateEndpointCommand = new UpdateEndpointCommand(input);
		try {
			logger.debug('updating endpoint', input);
			await pinpointClient.send(command);
			this.endpointUpdated = true;
		} catch (err) {
			throw err;
		}
	}

	private sessionStateChangeHandler: SessionStateChangeHandler = (
		state: SessionState
	) => {
		if (state === 'started') {
			// reset all session counts
			this.sessionMessageCountMap = {};
		}
	}

	private isBelowCap = (
		{ SessionCap, DailyCap, TotalCap }: InAppMessage,
		messageId: string
	): boolean => {
		const { sessionCount, dailyCount, totalCount } = this.getMessageCounts(
			messageId
		);
		if (
			!(sessionCount && SessionCap) &&
			!(dailyCount && DailyCap) &&
			!(totalCount && TotalCap)
		) {
			return true;
		}
		return (
			sessionCount < SessionCap &&
			dailyCount < DailyCap &&
			totalCount < TotalCap
		);
	}

	// Use the current session count in memory or initialize as empty count
	private getSessionCount = (messageId: string): number =>
		this.sessionMessageCountMap[messageId] || 0

	private getDailyCount = (): number => {
		const { storage } = this.config;
		const today = getStartOfDay();
		const item = storage.getItem(MESSAGE_DAILY_COUNT_KEY);
		// Parse stored count or initialize as empty count
		const counter: DailyInAppMessageCounter = item
			? JSON.parse(item)
			: { count: 0, lastCountTimestamp: today };
		// If the stored counter timestamp is today, use it as the count, otherwise reset to 0
		return counter.lastCountTimestamp === today ? counter.count : 0;
	}

	private getTotalCountMap = (): InAppMessageCountMap => {
		const { storage } = this.config;
		const item = storage.getItem(MESSAGE_TOTAL_COUNT_KEY);
		// Parse stored count map or initialize as empty
		return item ? JSON.parse(item) : {};
	}

	private getTotalCount = (messageId: string): number => {
		const countMap = this.getTotalCountMap();
		// Return stored count or initialize as empty count
		return countMap[messageId] || 0;
	}

	private getMessageCounts = (messageId: string): InAppMessageCounts => {
		try {
			return {
				sessionCount: this.getSessionCount(messageId),
				dailyCount: this.getDailyCount(),
				totalCount: this.getTotalCount(messageId),
			};
		} catch (err) {
			logger.error('Failed to get message counts from storage', err);
		}
	}

	private setSessionCount = (messageId: string, count: number): void => {
		this.sessionMessageCountMap[messageId] = count;
	}

	private setDailyCount = (count: number): void => {
		const { storage } = this.config;
		const dailyCount: DailyInAppMessageCounter = {
			count,
			lastCountTimestamp: getStartOfDay(),
		};
		try {
			storage.setItem(MESSAGE_DAILY_COUNT_KEY, JSON.stringify(dailyCount));
		} catch (err) {
			logger.error('Failed to save daily message count to storage', err);
		}
	}

	private setTotalCountMap = (countMap: InAppMessageCountMap): void => {
		const { storage } = this.config;
		try {
			storage.setItem(MESSAGE_TOTAL_COUNT_KEY, JSON.stringify(countMap));
		} catch (err) {
			logger.error('Failed to save total count to storage', err);
		}
	}

	private setTotalCount = (messageId: string, count: number): void => {
		const updatedMap = {
			...this.getTotalCountMap(),
			[messageId]: count,
		};
		this.setTotalCountMap(updatedMap);
	}

	private incrementCounts = async (messageId: string): Promise<void> => {
		const { sessionCount, dailyCount, totalCount } = this.getMessageCounts(
			messageId
		);
		this.setSessionCount(messageId, sessionCount + 1);
		this.setDailyCount(dailyCount + 1);
		this.setTotalCount(messageId, totalCount + 1);
	}
}
