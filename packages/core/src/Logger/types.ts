// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

export type LogContext = {
	namespaces: string[];
};

export type LogLevel = 'DEBUG' | 'ERROR' | 'INFO' | 'WARN' | 'VERBOSE';

export type Logger = {
	log: (
		namespaces: string[],
		logLevel: LogLevel,
		message: string,
		objects: object[]
	) => void;
};

export type LogCallInputs = Parameters<Logger['log']>;
