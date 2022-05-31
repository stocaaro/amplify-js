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
// import '../Common/Polyfills';
import Observable from 'zen-observable-ts';

import {
	Amplify,
	browserOrNode,
	ConsoleLogger as Logger,
	INTERNAL_AWS_APPSYNC_PUBSUB_PROVIDER,
	INTERNAL_AWS_APPSYNC_REALTIME_PUBSUB_PROVIDER,
	SocketStatus,
} from '@aws-amplify/core';
import { PubSubProvider, PubSubOptions, ProviderOptions } from './types';
import {
	AWSAppSyncProvider,
	AWSAppSyncRealTimeProvider,
	SubscriptionWithSocketState,
} from './Providers';

const { isNode } = browserOrNode();
const logger = new Logger('PubSub');

export class PubSubClass {
	private _options: PubSubOptions;

	private _pluggables: PubSubProvider[];

	/**
	 * Internal instance of AWSAppSyncProvider used by the API category to subscribe to AppSync
	 */
	private _awsAppSyncProvider?: AWSAppSyncProvider;

	/**
	 * Internal instance of AWSAppSyncRealTimeProvider used by the API category to subscribe to AppSync
	 */
	private _awsAppSyncRealTimeProvider?: AWSAppSyncRealTimeProvider;

	/**
	 * Lazy instantiate AWSAppSyncProvider when it is required by the API category
	 */
	private get awsAppSyncProvider() {
		if (!this._awsAppSyncProvider) {
			this._awsAppSyncProvider = new AWSAppSyncProvider(this._options);
		}
		return this._awsAppSyncProvider;
	}

	/**
	 * Lazy instantiate AWSAppSyncRealTimeProvider when it is required by the API category
	 */
	private get awsAppSyncRealTimeProvider() {
		if (!this._awsAppSyncRealTimeProvider) {
			this._awsAppSyncRealTimeProvider = new AWSAppSyncRealTimeProvider(
				this._options
			);
		}
		return this._awsAppSyncRealTimeProvider;
	}

	/**
	 * Initialize PubSub with AWS configurations
	 *
	 * @param {PubSubOptions} options - Configuration object for PubSub
	 */
	constructor(options?: PubSubOptions) {
		this._options = options ?? {};
		logger.debug('PubSub Options', this._options);
		this._pluggables = [];
		this.subscribe = this.subscribe.bind(this);
	}

	public getModuleName() {
		return 'PubSub';
	}

	/**
	 * Configure PubSub part with configurations
	 *
	 * @param {PubSubOptions} config - Configuration for PubSub
	 * @return {Object} - The current configuration
	 */
	configure(options: PubSubOptions) {
		const opt = options ? options.PubSub || options : {};
		logger.debug('configure PubSub', { opt });

		this._options = Object.assign({}, this._options, opt);

		this._pluggables.map(pluggable => pluggable.configure(this._options));

		return this._options;
	}

	/**
	 * add plugin into Analytics category
	 * @param {Object} pluggable - an instance of the plugin
	 */
	public async addPluggable(pluggable: PubSubProvider) {
		if (pluggable && pluggable.getCategory() === 'PubSub') {
			this._pluggables.push(pluggable);

			const config = pluggable.configure(this._options);

			return config;
		}
	}

	/**
	 * remove plugin from PubSub category
	 * @param providerName - the name of the plugin
	 */
	removePluggable(providerName: string): void {
		this._pluggables = this._pluggables.filter(
			pluggable => pluggable.getProviderName() !== providerName
		);
	}

	private getProviderByName(providerName: string | symbol) {
		if (providerName === INTERNAL_AWS_APPSYNC_PUBSUB_PROVIDER) {
			return this.awsAppSyncProvider;
		}
		if (providerName === INTERNAL_AWS_APPSYNC_REALTIME_PUBSUB_PROVIDER) {
			return this.awsAppSyncRealTimeProvider;
		}

		return this._pluggables.find(
			pluggable => pluggable.getProviderName() === providerName
		);
	}

	private getProviders(options: ProviderOptions = {}) {
		const { provider: providerName } = options;
		if (!providerName) {
			return this._pluggables;
		}

		const provider = this.getProviderByName(providerName);
		if (!provider) {
			throw new Error(`Could not find provider named ${providerName}`);
		}

		return [provider];
	}

	async publish(
		topics: string[] | string,
		msg: any,
		options?: ProviderOptions
	) {
		return Promise.all(
			this.getProviders(options).map(provider =>
				provider.publish(topics, msg, options)
			)
		);
	}

	subscribe(
		topics: string[] | string,
		options?: ProviderOptions & { includeSocketState?: false }
	): Observable<any>;
	subscribe(
		topics: string[] | string,
		options?: ProviderOptions & { includeSocketState: true }
	): SubscriptionWithSocketState;
	subscribe(
		topics: string[] | string,
		options?: ProviderOptions
	): Observable<any> | SubscriptionWithSocketState {
		if (isNode && this._options && this._options.ssr) {
			throw new Error(
				'Subscriptions are not supported for Server-Side Rendering (SSR)'
			);
		}

		const includeSocketState = Boolean(options?.includeSocketState).valueOf();

		logger.debug('subscribe options', options);

		const providers = this.getProviders(options);

		if (includeSocketState) {
			const observables = providers.map(provider => ({
				provider,
				subscriptionWithSocketState: provider.subscribe(topics, {
					...options,
					includeSocketState: includeSocketState,
				}),
			}));
			const combinedDataObservable = new CombinedObservable<
				any,
				{ provider: typeof providers[number] }
			>();
			const combinedSocketStateObservable = new CombinedObservable<
				SocketStatus,
				{ provider: typeof providers[number] }
			>();
			const dataObservable = observables.map(
				({ provider, subscriptionWithSocketState }) => {
					combinedDataObservable.add(
						subscriptionWithSocketState.dataObservable,
						{ provider }
					);
					combinedSocketStateObservable.add(
						subscriptionWithSocketState.socketStatusObservable,
						{ provider }
					);
				}
			);

			return {
				dataObservable: combinedDataObservable.build(),
				socketStatusObservable: combinedSocketStateObservable.build(),
			};
		} else {
			const observables = providers.map(provider => ({
				provider,
				dataObservable: provider.subscribe(topics, {
					...options,
				}),
			}));
			const combinedDataObservable = new CombinedObservable<
				any,
				{ provider: typeof providers[number] }
			>();
			const dataObservable = observables.map(({ provider, dataObservable }) => {
				combinedDataObservable.add(dataObservable, { provider });
			});
			return combinedDataObservable.build();
		}
	}
}

class CombinedObservable<T = any, R = {}> {
	private _observables: {
		observable: Observable<T>;
		metadata: R;
	}[];

	constructor() {
		this._observables = [];
	}

	add(observable: Observable<T>, metadata: R): void {
		this._observables.push({ observable, metadata });
	}

	build(): Observable<any> {
		return new Observable(observer => {
			const subscriptions = this._observables.map(({ metadata, observable }) =>
				observable.subscribe({
					start: console.error,
					next: value => observer.next({ ...metadata, value }),
					error: error => observer.error({ ...metadata, error }),
					complete: () => {
						this._observables = this._observables.filter(row => {
							return row.metadata !== metadata || row.observable !== observable;
						});
						if (this._observables.length === 0) observer.complete;
					},
				})
			);

			return () =>
				subscriptions.forEach(subscription => subscription.unsubscribe());
		});
	}
}

export const PubSub = new PubSubClass();
Amplify.register(PubSub);
