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
import Observable, { ZenObservable } from 'zen-observable-ts';
import { PubSubProvider, ProviderOptions } from '../types';
import {
	ConsoleLogger as Logger,
	SocketConnectivity,
	SocketStatus,
} from '@aws-amplify/core';

const logger = new Logger('AbstractPubSubProvider');

export type SubscriptionWithSocketState<T = any> = {
	socketStatusObservable: Observable<SocketStatus>;
	dataObservable: Observable<T>;
};

export abstract class AbstractPubSubProvider implements PubSubProvider {
	private _config: ProviderOptions;

	constructor(options: ProviderOptions = {}) {
		this._config = options;
	}

	configure(config: ProviderOptions = {}): ProviderOptions {
		this._config = { ...config, ...this._config };

		logger.debug(`configure ${this.getProviderName()}`, this._config);

		return this.options;
	}

	getCategory() {
		return 'PubSub';
	}

	abstract getProviderName(): string;

	protected get options(): ProviderOptions {
		return { ...this._config };
	}

	public abstract newClient(clientOptions: ProviderOptions): Promise<any>;

	public abstract publish(
		topics: string[] | string,
		msg: any,
		options?: ProviderOptions
	): void;

	public abstract subscribe(
		topics: string[] | string,
		options?: ProviderOptions & { includeSocketState?: false }
	): Observable<any>;
	public abstract subscribe(
		topics: string[] | string,
		options?: ProviderOptions & { includeSocketState: true }
	): SubscriptionWithSocketState;
}
