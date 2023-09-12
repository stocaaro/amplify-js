// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

export { ConsoleLogger, LOG_TYPE } from './ConsoleLogger';
export { internalLogger, externalLogger } from './logger';
import { addLogger, initializeLogger, log } from './AdministrateLogger';
export { addLogger, log };
initializeLogger();
