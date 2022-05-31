/*
 * Copyright 2017-2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import * as Paho from 'paho-mqtt';
import { v4 as uuid } from 'uuid';
import Observable, { ZenObservable } from 'zen-observable-ts';

import {
	AbstractPubSubProvider,
	SubscriptionWithSocketState,
} from './PubSubProvider';
import { ProviderOptions, SubscriptionObserver } from '../types';
import { ConsoleLogger as Logger, SocketConnectivity } from '@aws-amplify/core';

const logger = new Logger('MqttOverWSProvider');

export function mqttTopicMatch(filter: string, topic: string) {
	const filterArray = filter.split('/');
	const length = filterArray.length;
	const topicArray = topic.split('/');

	for (let i = 0; i < length; ++i) {
		const left = filterArray[i];
		const right = topicArray[i];
		if (left === '#') return topicArray.length >= length;
		if (left !== '+' && left !== right) return false;
	}
	return length === topicArray.length;
}

export interface MqttProviderOptions extends ProviderOptions {
	clientId?: string;
	url?: string;
	reconnect?: boolean;
	includeSocketState?: boolean;
}

/**
 * @deprecated Migrated to MqttProviderOptions
 */
export type MqttProvidertOptions = MqttProviderOptions;

export class ClientsQueue {
	private promises: Map<string, Promise<any>> = new Map();
	private returnCachedFailures: boolean;

	constructor(returnCachedFailures?: boolean) {
		this.returnCachedFailures = returnCachedFailures ?? true;
	}

	async get(clientId: string, clientFactory?: (input: string) => Promise<any>) {
		const cachedPromise = this.promises.get(clientId);
		if (this.returnCachedFailures) {
			if (cachedPromise) return cachedPromise;
		} else {
			try {
				const cachedClient = await cachedPromise;
				if (cachedClient) return cachedClient;
			} catch (error) {
				logger.warn('Client error when attempting to use cached client', error);
			}
		}

		if (clientFactory) {
			const newPromise = clientFactory(clientId);
			this.promises.set(clientId, newPromise);
			return newPromise;
		}
		return undefined;
	}

	get allClients() {
		return Array.from(this.promises.keys());
	}

	remove(clientId: string) {
		this.promises.delete(clientId);
	}
}

const topicSymbol = typeof Symbol !== 'undefined' ? Symbol('topic') : '@@topic';

export class MqttOverWSProvider extends AbstractPubSubProvider {
	protected _clientsQueue;
	private readonly _socketConnectivity: SocketConnectivity;
	private _reconnect: boolean;

	constructor(options: MqttProviderOptions = {}) {
		super({ ...options, clientId: options.clientId || uuid() });
		this._socketConnectivity = new SocketConnectivity();
		this._reconnect = options['reconnect'] ?? false;
		this._clientsQueue = new ClientsQueue(false);
	}

	protected get clientId() {
		return this.options.clientId;
	}

	protected get endpoint() {
		return this.options.aws_pubsub_endpoint;
	}

	protected get clientsQueue() {
		return this._clientsQueue;
	}

	protected get isSSLEnabled() {
		return !this.options
			.aws_appsync_dangerously_connect_to_http_endpoint_for_testing;
	}

	protected getTopicForValue(value: any) {
		return typeof value === 'object' && value[topicSymbol];
	}

	getProviderName() {
		return 'MqttOverWSProvider';
	}

	public onDisconnect({
		clientId,
		errorCode,
		...args
	}: {
		clientId?: string;
		errorCode?: number;
	}) {
		if (errorCode !== 0) {
			logger.warn(clientId, JSON.stringify({ errorCode, ...args }, null, 2));

			const topicsToDelete: string[] = [];
			if (!clientId) {
				return;
			}
			const clientIdObservers = this._clientIdObservers.get(clientId);
			if (!clientIdObservers) {
				return;
			}
			this.disconnect(clientId);
			this._socketConnectivity.disconnected();

			// When the connection is closed with no open topics, there is no need to reconnect
			if (this._topicObservers.size === 0) {
				this._socketConnectivity.closingSocket();
			}

			if (!this._reconnect) {
				clientIdObservers.forEach(observer => {
					observer.error('Disconnected, error code: ' + errorCode);
					// removing observers for disconnected clientId
					this._topicObservers.forEach((observerForTopic, observerTopic) => {
						observerForTopic.delete(observer);
						if (observerForTopic.size === 0) {
							topicsToDelete.push(observerTopic);
						}
					});
				});

				// forgiving any trace of clientId
				this._clientIdObservers.delete(clientId);

				// Removing topics that are not listen by an observer
				topicsToDelete.forEach(topic => {
					this._topicObservers.delete(topic);
				});
			}
		}
	}

	public async newClient({ url, clientId }: MqttProviderOptions): Promise<any> {
		logger.debug('Creating new MQTT client', clientId);
		// @ts-ignore
		const client = new Paho.Client(url, clientId);
		// client.trace = (args) => logger.debug(clientId, JSON.stringify(args, null, 2));
		client.onMessageArrived = ({
			destinationName: topic,
			payloadString: msg,
		}: {
			destinationName: string;
			payloadString: string;
		}) => {
			this._onMessage(topic, msg);
		};
		client.onConnectionLost = ({
			errorCode,
			...args
		}: {
			errorCode: number;
		}) => {
			this.onDisconnect({ clientId, errorCode, ...args });
		};

		await new Promise((resolve, reject) => {
			client.connect({
				useSSL: this.isSSLEnabled,
				mqttVersion: 3,
				onSuccess: () => resolve(client),
				onFailure: reject,
			});
		});

		this._socketConnectivity.connectionEstablished();

		return client;
	}

	protected async connect(
		clientId: string,
		options: MqttProviderOptions = {}
	): Promise<any> {
		return await this.clientsQueue.get(clientId, async clientId => {
			this._socketConnectivity.openingSocket();

			const client = await this.newClient({ ...options, clientId });
			this._topicObservers.forEach(
				(_value: Set<SubscriptionObserver<any>>, key: string) => {
					logger.debug(client === undefined);
					client.subscribe(key);
				}
			);
			return client;
		});
	}

	protected async disconnect(clientId: string): Promise<void> {
		const client = await this.clientsQueue.get(clientId);

		if (client && client.isConnected()) {
			client.disconnect();
		}
		this.clientsQueue.remove(clientId);
	}

	async publish(topics: string[] | string, msg: any) {
		const targetTopics = ([] as string[]).concat(topics);
		const message = JSON.stringify(msg);

		const url = await this.endpoint;

		const client = await this.connect(this.clientId, { url });
		logger.debug('Publishing to topic(s)', targetTopics.join(','), message);
		targetTopics.forEach(topic => client.send(topic, message));
	}

	protected _topicObservers: Map<string, Set<SubscriptionObserver<any>>> =
		new Map();

	protected _clientIdObservers: Map<string, Set<SubscriptionObserver<any>>> =
		new Map();

	private _onMessage(topic: string, msg: any) {
		try {
			const matchedTopicObservers: Set<SubscriptionObserver<any>>[] = [];
			this._topicObservers.forEach((observerForTopic, observerTopic) => {
				if (mqttTopicMatch(observerTopic, topic)) {
					matchedTopicObservers.push(observerForTopic);
				}
			});
			const parsedMessage = JSON.parse(msg);

			if (typeof parsedMessage === 'object') {
				parsedMessage[topicSymbol] = topic;
			}

			matchedTopicObservers.forEach(observersForTopic => {
				observersForTopic.forEach(observer => observer.next(parsedMessage));
			});
		} catch (error) {
			logger.warn('Error handling message', error, msg);
		}
	}

	subscribe(
		topics: string[] | string,
		options?: MqttProviderOptions & { includeSocketState?: false }
	): Observable<any>;
	subscribe(
		topics: string[] | string,
		options?: MqttProviderOptions & { includeSocketState: true }
	): SubscriptionWithSocketState;
	subscribe(
		topics: string[] | string,
		options?: MqttProviderOptions
	): Observable<any> | SubscriptionWithSocketState {
		options = options ?? {};
		const targetTopics = ([] as string[]).concat(topics);
		const includeSocketState = options?.includeSocketState ?? false;
		logger.debug('Subscribing to topic(s)', targetTopics.join(','));
		const subscriptionObservable = new Observable<any>(observer => {
			targetTopics.forEach(topic => {
				// this._topicObservers is used to notify the observers according to the topic received on the message
				let observersForTopic = this._topicObservers.get(topic);

				if (!observersForTopic) {
					observersForTopic = new Set();

					this._topicObservers.set(topic, observersForTopic);
				}

				observersForTopic.add(observer);
			});

			// @ts-ignore
			let client: Paho.Client;

			const { clientId = this.clientId } = options;

			// this._clientIdObservers is used to close observers when client gets disconnected
			let observersForClientId = this._clientIdObservers.get(clientId);
			if (!observersForClientId) {
				observersForClientId = new Set();
			}
			observersForClientId.add(observer);
			this._clientIdObservers.set(clientId, observersForClientId);
			let reconnectSubscription: ZenObservable.Subscription;
			(async () => {
				const { url = await this.endpoint } = options;

				const getClient = async () => {
					try {
						client = await this.connect(clientId, { url });
					} catch (e) {
						observer.error(e);
					}
				};

				// Establish the initial connection
				await getClient();

				// If reconnect is on, then verify the connection each time socket network is available
				if (includeSocketState) {
					reconnectSubscription = this._socketConnectivity
						.status()
						.subscribe(({ online }) => {
							if (online) getClient();
						});
				}
				if (client) {
					targetTopics.forEach(topic => {
						client.subscribe(topic);
					});
				}
			})();

			return () => {
				logger.debug('Unsubscribing from topic(s)', targetTopics.join(','));

				reconnectSubscription?.unsubscribe();

				if (client) {
					this._clientIdObservers.get(clientId)?.delete(observer);
					// No more observers per client => client not needed anymore
					if (this._clientIdObservers.get(clientId)?.size === 0) {
						this.disconnect(clientId);
						this._clientIdObservers.delete(clientId);
					}

					targetTopics.forEach(topic => {
						const observersForTopic =
							this._topicObservers.get(topic) ||
							(new Set() as Set<SubscriptionObserver<any>>);

						observersForTopic.delete(observer);

						// if no observers exists for the topic, topic should be removed
						if (observersForTopic.size === 0) {
							this._topicObservers.delete(topic);
							if (client.isConnected()) {
								client.unsubscribe(topic);
							}
						}
					});
				}

				return null;
			};
		});
		if (includeSocketState) {
			return {
				socketStatusObservable: this._socketConnectivity.socketStatusObservable,
				dataObservable: subscriptionObservable,
			};
		} else {
			return subscriptionObservable;
		}
	}
}
