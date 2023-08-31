// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { AuthValidationErrorCode } from '../../../errors/types/validation';
import { assertValidationError } from '../../../errors/utils/assertValidationError';
import { UpdatePasswordRequest } from '../../../types/requests';
import { changePassword } from '../utils/clients/CognitoIdentityProvider';
import { ChangePasswordException } from '../../cognito/types/errors';
import { Amplify } from '@aws-amplify/core';
import { assertTokenProviderConfig } from '@aws-amplify/core/internals/utils';
import { fetchAuthSession } from '../../../';
import { getRegion } from '../utils/clients/CognitoIdentityProvider/utils';
import { assertAuthTokens } from '../utils/types';

/**
 * Updates user's password while authenticated.
 *
 * @param updatePasswordRequest - The updatePasswordRequest object.
 *
 * @throws - {@link ChangePasswordException} - Cognito service errors thrown when updating a password.
 *
 * @throws - {@link AuthValidationErrorCode} - Validation errors thrown when oldPassword or newPassword are empty.
 *
 * @throws AuthTokenConfigException - Thrown when the token provider config is invalid.
 */
export async function updatePassword(
	updatePasswordRequest: UpdatePasswordRequest
): Promise<void> {
	const authConfig = Amplify.getConfig().Auth?.Cognito;
	assertTokenProviderConfig(authConfig);
	const { oldPassword, newPassword } = updatePasswordRequest;
	assertValidationError(
		!!oldPassword,
		AuthValidationErrorCode.EmptyUpdatePassword
	);

	assertValidationError(
		!!newPassword,
		AuthValidationErrorCode.EmptyUpdatePassword
	);
	const { tokens } = await fetchAuthSession({ forceRefresh: false });
	assertAuthTokens(tokens);
	await changePassword(
		{ region: getRegion(authConfig.userPoolId) },
		{
			AccessToken: tokens.accessToken.toString(),
			PreviousPassword: oldPassword,
			ProposedPassword: newPassword,
		}
	);
}