// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

export { ConsoleLogger } from './ConsoleLogger';
export { generateExternalLogger, generateInternalLogger } from './logger';
import { addLogger, initializeLogger, log } from './AdministrateLogger';
export { addLogger, log };
initializeLogger();
