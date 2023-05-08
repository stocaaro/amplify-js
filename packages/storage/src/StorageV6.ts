import {  StorageCopyDestination, StorageCopyTarget, StorageProvider, UploadTask } from './types'

type PluggableType<T> = {
    addPluggable: (provider: T) => void;
    usePluggable: (provider: T) => void;
    configure: (config: ConfigType) => void;
};

type ConfigType = { [key: string | symbol]: string | number | ConfigType };

export class StorageInterface implements StorageProvider, PluggableType<StorageProvider> {
	_pluggable: StorageProvider;
    _config?: ConfigType;
	cancel: StorageProvider['cancel'];
	copy: StorageProvider['copy'];
	get: StorageProvider['get'];
	put: StorageProvider['put'];
	remove: StorageProvider['remove'];
	list: StorageProvider['list'];

	constructor(provider: StorageProvider, configuration?: ConfigType) {
		this._config = configuration;
		this._pluggable = provider;
		this.cancel = this._pluggable?.cancel;
		this.copy = this._pluggable?.copy;
		this.get = this._pluggable.get;
		this.put = this._pluggable.put;
		this.remove = this._pluggable.remove;
		this.list = this._pluggable.list;
	}

	configure(config: object): object {
		throw new Error('Method not implemented.');
	}

	getCategory(): string {
		return 'Storage'
	}

	getProviderName(): string {
		throw new Error('Method not implemented.');
	}

	addPluggable(provider: StorageProvider) {
		throw new Error('Only one Storage provider may be configured per interface, use "usePluggable" to replace the current provider.');
	}

	usePluggable(provider: StorageProvider) {
		this._pluggable = provider;
	}
}