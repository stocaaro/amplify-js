// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { LogCallInputs, LogLevel, Logger } from './types';
import { recorder as consoleLogRecorder } from './LogRecorder/Console';
const loggers: Logger[] = [];
let logLevel: LogLevel = 'INFO';
const logLevelIndex = ['VERBOSE', 'DEBUG', 'INFO', 'WARN', 'ERROR'];
export const addLogger = (logger: Logger) => {
	loggers.push(logger);
};

export const initializeLogger = () => {
	addLogger(consoleLogRecorder);
};

export const log = (...params: LogCallInputs) => {
	loggers.forEach(logger => logger.log(...params));
};

export const setLogLevel = (level: LogLevel) => {
	logLevel = level;
};

export const getLogLevel = (): LogLevel => {
	if (typeof (<any>window) !== 'undefined' && (<any>window).LOG_LEVEL) {
		const windowLog = (<any>window).LOG_LEVEL;
		if (logLevelIndex.includes(windowLog)) return windowLog;
	}
	return logLevel;
};

export const checkLogLevel = (
	level: LogLevel,
	setLevel: LogLevel | undefined = undefined
): boolean => {
	const targetLevel = setLevel ?? getLogLevel();
	return logLevelIndex.indexOf(level) >= logLevelIndex.indexOf(targetLevel);
};
