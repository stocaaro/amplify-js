import { checkLogLevel, getLogLevel } from '../AdministrateLogger';
import { LogLevel, Logger } from '../types';
export const recorder: Logger = {
	log: (
		namespaces: string[],
		logLevel: LogLevel,
		message: string,
		objects: object[]
	) => {
		const logFcn = getConsoleLogFcn(logLevel);
		const prefix = `[${logLevel}] ${timestamp()} ${namespaces.join(' - ')}`;
		if (checkLogLevel(logLevel)) logFcn(prefix, message, ...objects);
	},
};

const getConsoleLogFcn = (logLevel: LogLevel) => {
	let fcn = console.log.bind(console);
	switch (logLevel) {
		case 'DEBUG': {
			fcn = console.debug?.bind(console) ?? fcn;
			break;
		}
		case 'ERROR': {
			fcn = console.error?.bind(console) ?? fcn;
			break;
		}
		case 'INFO': {
			fcn = console.info?.bind(console) ?? fcn;
			break;
		}
		case 'WARN': {
			fcn = console.warn?.bind(console) ?? fcn;
			break;
		}
	}
	return fcn;
};
const padding = (n: number) => {
	return n < 10 ? '0' + n : '' + n;
};

const timestamp = () => {
	const dt = new Date();
	return (
		[padding(dt.getMinutes()), padding(dt.getSeconds())].join(':') +
		'.' +
		dt.getMilliseconds()
	);
};
