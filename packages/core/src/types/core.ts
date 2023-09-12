// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

export interface AmplifyConfig {
	Analytics?: object;
	Auth?: object;
	API?: object;
	Logging?: object;
	Storage?: object;
	Cache?: object;
	Geo?: object;
	Notifications?: {
		InAppMessaging?: object;
	};
	ssr?: boolean;
}

export type UserProfile = {
	attributes?: Record<string, string[]>;
	demographic?: {
		appVersion?: string;
		locale?: string;
		make?: string;
		model?: string;
		modelVersion?: string;
		platform?: string;
		platformVersion?: string;
		timezone?: string;
	};
	location?: {
		city?: string;
		country?: string;
		latitude?: number;
		longitude?: number;
		postalCode?: string;
		region?: string;
	};
	metrics?: Record<string, number>;
};

/**
 * @internal
 */
export type DelayFunction = (
	attempt: number,
	args?: any[],
	error?: unknown
) => number | false;

export type AmplifyLoggingCategories =
	| 'Analytics'
	| 'API'
	| 'Authentication'
	| 'DataStore'
	| 'Geo'
	| 'Hub'
	| 'Logging'
	| 'Predictions'
	| 'PushNotifications'
	| 'Storage';
