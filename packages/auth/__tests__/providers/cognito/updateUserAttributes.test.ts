// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { AuthError } from '../../../src/errors/AuthError';
import { updateUserAttributes } from '../../../src/providers/cognito';
import { UpdateUserAttributesException } from '../../../src/providers/cognito/types/errors';
import * as updateUserAttributesClient from '../../../src/providers/cognito/utils/clients/CognitoIdentityProvider';
import { Amplify } from 'aws-amplify';
import { decodeJWT } from '@aws-amplify/core/internals/utils';
import * as authUtils from '../../../src';
import { fetchTransferHandler } from '@aws-amplify/core/internals/aws-client-utils';
import { buildMockErrorResponse, mockJsonResponse } from './testUtils/data';
import { UpdateUserAttributesCommandOutput } from '../../../src/providers/cognito/utils/clients/CognitoIdentityProvider/types';
import { toAttributeType } from '../../../src/providers/cognito/utils/apiHelpers';
import { AuthUpdateAttributeStep } from '../../../src/types/enums';
jest.mock('@aws-amplify/core/lib/clients/handlers/fetch');

Amplify.configure({
	Auth: {
		Cognito: {
			userPoolClientId: '111111-aaaaa-42d8-891d-ee81a1549398',
			userPoolId: 'us-west-2_zzzzz',
			identityPoolId: 'us-west-2:xxxxxx',
		},
	},
});
const mockedAccessToken =
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

describe('updateUserAttributes  API happy path cases', () => {
	let fetchAuthSessionsSpy;
	beforeEach(() => {
		fetchAuthSessionsSpy = jest
			.spyOn(authUtils, 'fetchAuthSession')
			.mockImplementationOnce(
				async (): Promise<{ tokens: { accessToken: any } }> => {
					return {
						tokens: {
							accessToken: decodeJWT(mockedAccessToken),
						},
					};
				}
			);
	});

	afterEach(() => {
		fetchAuthSessionsSpy.mockClear();
	});

	test('updateUserAttributes API should return a map with updated and not updated attributes', async () => {
		const updateUserAttributesClientSpy = jest
			.spyOn(updateUserAttributesClient, 'updateUserAttributes')
			.mockImplementationOnce(
				async (): Promise<UpdateUserAttributesCommandOutput> => {
					return {
						CodeDeliveryDetailsList: [
							{
								AttributeName: 'email',
								DeliveryMedium: 'EMAIL',
								Destination: 'mockedEmail',
							},
							{
								AttributeName: 'phone_number',
								DeliveryMedium: 'SMS',
								Destination: 'mockedPhoneNumber',
							},
						],
					} as UpdateUserAttributesCommandOutput;
				}
			);
		const userAttributes = {
			address: 'mockedAddress',
			name: 'mockedName',
			email: 'mockedEmail',
			phone_number: 'mockedPhoneNumber',
		};
		const result = await updateUserAttributes({
			userAttributes,
			options: {
				serviceOptions: {
					clientMetadata: { foo: 'bar' },
				},
			},
		});

		expect(result.address).toEqual({
			isUpdated: true,
			nextStep: {
				updateAttributeStep: AuthUpdateAttributeStep.DONE,
			},
		});

		expect(result.name).toEqual({
			isUpdated: true,
			nextStep: {
				updateAttributeStep: AuthUpdateAttributeStep.DONE,
			},
		});

		expect(result.email).toEqual({
			isUpdated: false,
			nextStep: {
				updateAttributeStep:
					AuthUpdateAttributeStep.CONFIRM_ATTRIBUTE_WITH_CODE,
				codeDeliveryDetails: {
					attributeName: 'email',
					deliveryMedium: 'EMAIL',
					destination: 'mockedEmail',
				},
			},
		});

		expect(result.phone_number).toEqual({
			isUpdated: false,
			nextStep: {
				updateAttributeStep:
					AuthUpdateAttributeStep.CONFIRM_ATTRIBUTE_WITH_CODE,
				codeDeliveryDetails: {
					attributeName: 'phone_number',
					deliveryMedium: 'SMS',
					destination: 'mockedPhoneNumber',
				},
			},
		});

		expect(updateUserAttributesClientSpy).toHaveBeenCalledWith(
			expect.objectContaining({ region: 'us-west-2' }),
			expect.objectContaining({
				AccessToken: mockedAccessToken,
				UserAttributes: toAttributeType(userAttributes),
				ClientMetadata: { foo: 'bar' },
			})
		);
	});

	test('updateUserAttributes API should return a map with updated attributes only', async () => {
		const updateUserAttributesClientSpy = jest
			.spyOn(updateUserAttributesClient, 'updateUserAttributes')
			.mockImplementationOnce(
				async (): Promise<UpdateUserAttributesCommandOutput> => {
					return {} as UpdateUserAttributesCommandOutput;
				}
			);
		const userAttributes = {
			address: 'mockedAddress',
			name: 'mockedName',
		};
		const result = await updateUserAttributes({
			userAttributes,
			options: {
				serviceOptions: {
					clientMetadata: { foo: 'bar' },
				},
			},
		});

		expect(result.address).toEqual({
			isUpdated: true,
			nextStep: {
				updateAttributeStep: AuthUpdateAttributeStep.DONE,
			},
		});

		expect(result.name).toEqual({
			isUpdated: true,
			nextStep: {
				updateAttributeStep: AuthUpdateAttributeStep.DONE,
			},
		});

		expect(updateUserAttributesClientSpy).toHaveBeenCalledWith(
			expect.objectContaining({ region: 'us-west-2' }),
			expect.objectContaining({
				AccessToken: mockedAccessToken,
				UserAttributes: toAttributeType(userAttributes),
				ClientMetadata: { foo: 'bar' },
			})
		);
	});

	test('updateUserAttributes API should return a map with not updated attributes only', async () => {
		const updateUserAttributesClientSpy = jest
			.spyOn(updateUserAttributesClient, 'updateUserAttributes')
			.mockImplementationOnce(
				async (): Promise<UpdateUserAttributesCommandOutput> => {
					return {
						CodeDeliveryDetailsList: [
							{
								AttributeName: 'email',
								DeliveryMedium: 'EMAIL',
								Destination: 'mockedEmail',
							},
							{
								AttributeName: 'phone_number',
								DeliveryMedium: 'SMS',
								Destination: 'mockedPhoneNumber',
							},
						],
					} as UpdateUserAttributesCommandOutput;
				}
			);
		const userAttributes = {
			email: 'mockedEmail',
			phone_number: 'mockedPhoneNumber',
		};
		const result = await updateUserAttributes({
			userAttributes,
			options: {
				serviceOptions: {
					clientMetadata: { foo: 'bar' },
				},
			},
		});

		expect(result.email).toEqual({
			isUpdated: false,
			nextStep: {
				updateAttributeStep:
					AuthUpdateAttributeStep.CONFIRM_ATTRIBUTE_WITH_CODE,
				codeDeliveryDetails: {
					attributeName: 'email',
					deliveryMedium: 'EMAIL',
					destination: 'mockedEmail',
				},
			},
		});

		expect(result.phone_number).toEqual({
			isUpdated: false,
			nextStep: {
				updateAttributeStep:
					AuthUpdateAttributeStep.CONFIRM_ATTRIBUTE_WITH_CODE,
				codeDeliveryDetails: {
					attributeName: 'phone_number',
					deliveryMedium: 'SMS',
					destination: 'mockedPhoneNumber',
				},
			},
		});

		expect(updateUserAttributesClientSpy).toHaveBeenCalledWith(
			expect.objectContaining({ region: 'us-west-2' }),
			expect.objectContaining({
				AccessToken: mockedAccessToken,
				UserAttributes: toAttributeType(userAttributes),
				ClientMetadata: { foo: 'bar' },
			})
		);
	});
});

describe('updateUserAttributes  API error path cases:', () => {
	test('updateUserAttributes API should raise service error', async () => {
		expect.assertions(2);
		jest
			.spyOn(authUtils, 'fetchAuthSession')
			.mockImplementationOnce(
				async (): Promise<{ tokens: { accessToken: any } }> => {
					return {
						tokens: {
							accessToken: decodeJWT(mockedAccessToken),
						},
					};
				}
			);
		(fetchTransferHandler as jest.Mock).mockResolvedValue(
			mockJsonResponse(
				buildMockErrorResponse(
					UpdateUserAttributesException.InvalidParameterException
				)
			)
		);
		try {
			await updateUserAttributes({
				userAttributes: {
					email: 'mockedEmail',
				},
				options: {
					serviceOptions: {
						clientMetadata: { foo: 'bar' },
					},
				},
			});
		} catch (error) {
			expect(error).toBeInstanceOf(AuthError);
			expect(error.name).toBe(
				UpdateUserAttributesException.InvalidParameterException
			);
		}
	});
});