// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/*
This file maps top-level exports from `@aws-amplify/core/internals/utils`. These are intended to be internal
utils for use throughout the library.
*/
// JS utilities
export {
	browserOrNode,
	filenameToContentType,
	generateRandomString,
	isEmpty,
	isStrictObject,
	isTextFile,
	isWebWorker,
	makeQuerablePromise,
	objectLessAttributes,
	sortByField,
	transferKeyToLowerCase,
	transferKeyToUpperCase,
} from './Util/JS';

export {
	JWT,
	StrictUnion,
	CognitoIdentityPoolConfig,
} from './singleton/Auth/types';
// Auth utilities
export {
	decodeJWT,
	assertTokenProviderConfig,
	assertIdentityPooIdConfig,
	assertOAuthConfig,
} from './singleton/Auth/utils';
export { isTokenExpired } from './singleton/Auth';
export { Signer } from './Signer';

// Logging utilities
export { ConsoleLogger, ConsoleLogger as Logger } from './Logger';

// Platform & device utils
import { Platform } from './Platform';
export { ClientDevice } from './ClientDevice';
export {
	Platform,
	getAmplifyUserAgentObject,
	getAmplifyUserAgent,
} from './Platform';
export {
	ApiAction,
	AuthAction,
	AnalyticsAction,
	Category,
	CustomUserAgentDetails,
	DataStoreAction,
	Framework,
	GeoAction,
	InteractionsAction,
	InAppMessagingAction,
	PredictionsAction,
	PubSubAction,
	PushNotificationAction,
	StorageAction,
} from './Platform/types';
export const Constants = {
	userAgent: Platform.userAgent,
};

// Service worker
export { ServiceWorker } from './ServiceWorker';

// Other utilities & constants
export {
	AWS_CLOUDWATCH_CATEGORY,
	BackgroundManagerNotOpenError,
	BackgroundProcessManager,
	BackgroundProcessManagerState,
	DateUtils,
	Mutex,
	NO_CREDS_ERROR_STRING,
	NonRetryableError,
	RETRY_ERROR_CODES,
	Reachability,
	isNonRetryableError,
	jitteredBackoff,
	jitteredExponentialRetry,
	retry,
	urlSafeDecode,
	urlSafeEncode,
} from './Util';
export { asserts } from './Util/errors/AssertError';
export {
	invalidParameter,
	missingConfig,
	AmplifyError,
	AmplifyErrorString,
} from './Util/Errors';
export { FacebookOAuth, GoogleOAuth } from './OAuthHelper';
export { AppState, AsyncStorage, Linking } from './RNComponents';
export { ErrorParams, AmplifyErrorMap, ServiceError } from './types';
export {
	INTERNAL_AWS_APPSYNC_REALTIME_PUBSUB_PROVIDER,
	USER_AGENT_HEADER,
} from './Util/Constants';
export { fetchAuthSession } from './singleton/apis/internal/fetchAuthSession';
export { AMPLIFY_SYMBOL } from './Hub';

export { generateInternalLogger as generateLogger } from './Logger';
