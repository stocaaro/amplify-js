// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
	AuthConfig,
	Identity,
	KeyValueStorageInterface,
} from '@aws-amplify/core';
import { assertIdentityPooIdConfig } from '@aws-amplify/core/internals/utils';
import { IdentityIdStorageKeys, IdentityIdStore } from './types';
import { AuthError } from '../../../errors/AuthError';
import { getAuthStorageKeys } from '../tokenProvider/TokenStore';
import { AuthKeys } from '../tokenProvider/types';

export class DefaultIdentityIdStore implements IdentityIdStore {
	keyValueStorage: KeyValueStorageInterface;
	authConfig?: AuthConfig;

	// Used as in-memory storage
	_primaryIdentityId: string | undefined;
	_authKeys: AuthKeys<string> = {};
	setAuthConfig(authConfigParam: AuthConfig) {
		assertIdentityPooIdConfig(authConfigParam.Cognito);
		this.authConfig = authConfigParam;
		this._authKeys = createKeysForAuthStorage(
			'Cognito',
			authConfigParam.Cognito.identityPoolId
		);
		return;
	}

	constructor(keyValueStorage: KeyValueStorageInterface) {
		this.keyValueStorage = keyValueStorage;
	}

	async loadIdentityId(): Promise<Identity | undefined> {
		assertIdentityPooIdConfig(this.authConfig?.Cognito);
		if (this.keyValueStorage === undefined) {
			throw new AuthError({
				message: 'No KeyValueStorage available',
				name: 'KeyValueStorageNotFound',
				recoverySuggestion:
					'Make sure to set the keyValueStorage before using this method',
			});
		}
		// TODO(v6): migration logic should be here
		// Reading V5 tokens old format
		try {
			if (!!this._primaryIdentityId) {
				return {
					id: this._primaryIdentityId,
					type: 'primary',
				};
			} else {
				const storedIdentityId = await this.keyValueStorage.getItem(
					this._authKeys.identityId
				);
				if (!!storedIdentityId) {
					return {
						id: storedIdentityId,
						type: 'guest',
					};
				}
			}
		} catch (err) {
			// TODO(v6): validate partial results with mobile implementation
			throw new Error(`Error loading identityId from storage: ${err}`);
		}
	}

	async storeIdentityId(identity: Identity): Promise<void> {
		assertIdentityPooIdConfig(this.authConfig?.Cognito);
		if (identity === undefined) {
			throw new AuthError({
				message: 'Invalid Identity parameter',
				name: 'InvalidAuthIdentity',
				recoverySuggestion: 'Make sure a valid Identity object is passed',
			});
		}
		if (this.keyValueStorage === undefined) {
			throw new AuthError({
				message: 'No KeyValueStorage available',
				name: 'KeyValueStorageNotFound',
				recoverySuggestion:
					'Make sure to set the keyValueStorage before using this method',
			});
		}

		if (identity.type === 'guest') {
			this.keyValueStorage.setItem(this._authKeys.identityId, identity.id);
			// Clear in-memory storage of primary identityId
			this._primaryIdentityId = undefined;
		} else {
			this._primaryIdentityId = identity.id;
			// Clear locally stored guest id
			this.keyValueStorage.removeItem(this._authKeys.identityId);
		}
	}

	async clearIdentityId(): Promise<void> {
		this._primaryIdentityId = undefined;
		await Promise.all([
			this.keyValueStorage.removeItem(this._authKeys.identityId),
		]);
	}
}

const createKeysForAuthStorage = (provider: string, identifier: string) => {
	return getAuthStorageKeys(IdentityIdStorageKeys)(
		`com.amplify.${provider}`,
		identifier
	);
};