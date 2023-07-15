// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { toBase64 } from '../../../src/AwsClients/S3/runtime/base64/index.browser';

import { TextEncoder, TextDecoder } from 'util';
import { toBase64TestCases } from './cases';

Object.assign(global, { TextDecoder, TextEncoder });

describe('base64 until for browser', () => {
	describe('toBase64()', () => {
		for (let { input, expected } of toBase64TestCases) {
			it(`it should base64 encode ${input}`, () => {
				expect(toBase64(input)).toStrictEqual(expected);
			});
		}
	});
});
