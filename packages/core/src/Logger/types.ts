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
