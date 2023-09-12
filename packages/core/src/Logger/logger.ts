import { LogLevel } from './types';
import { log as centralizedLog } from './index';
import { AmplifyLoggingCategories } from '../types';

class Logger {
	namespaces: string[];

	constructor(namespaces: string[]) {
		this.namespaces = namespaces;
	}

	/**
	 * Write INFO log
	 * @method
	 * @memeberof Logger
	 * @param {string|object} msg - Logging message or object
	 */
	info(message: string, ...objects: any) {
		this._log('INFO', message, objects);
	}

	/**
	 * Write WARN log
	 * @method
	 * @memeberof Logger
	 * @param {string|object} msg - Logging message or object
	 */
	warn(message: string, ...objects: any) {
		this._log('WARN', message, objects);
	}

	/**
	 * Write ERROR log
	 * @method
	 * @memeberof Logger
	 * @param {string|object} msg - Logging message or object
	 */
	error(message: string, ...objects: any) {
		this._log('ERROR', message, objects);
	}

	/**
	 * Write DEBUG log
	 * @method
	 * @memeberof Logger
	 * @param {string|object} msg - Logging message or object
	 */
	debug(message: string, ...objects: any) {
		this._log('DEBUG', message, objects);
	}

	/**
	 * Write VERBOSE log
	 * @method
	 * @memeberof Logger
	 * @param {string|object} msg - Logging message or object
	 */
	verbose(message: string, ...objects: any) {
		this._log('VERBOSE', message, objects);
	}

	_log(logLevel: LogLevel, message: string, ...objects: any) {
		centralizedLog(this.namespaces, logLevel, message, objects);
	}
}

export const internalLogger = (
	forCategory: AmplifyLoggingCategories,
	...forNamespace: string[]
) => {
	return new Logger([forCategory, ...forNamespace]);
};

export const externalLogger = (...forNamespace: string[]) => {
	return new Logger(forNamespace);
};
