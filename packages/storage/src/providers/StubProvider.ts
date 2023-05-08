import { StorageCopyDestination, StorageCopyTarget, UploadTask } from "../types";

export function cancel(request: Promise<any>): void {
	throw new Error('Method not implemented.');
}
export function copy(src: StorageCopyTarget, dest: StorageCopyDestination, config?: any): Promise<any> {
	throw new Error('Method not implemented.');
}
export function configure(config: object): object {
	throw new Error('Method not implemented.');
}
export function get(key: string, options?: any): Promise<string | Object> {
	throw new Error('Method not implemented.');
}
export function put(key: string, object: any, options?: any): Promise<Object> | UploadTask {
	throw new Error('Method not implemented.');
}
export function remove(key: string, options?: any): Promise<any> {
	throw new Error('Method not implemented.');
}
export function list(path: any, options?: any): Promise<any> {
	throw new Error('Method not implemented.');
}

// TODO, re-export shared method? Do we need this at all when we're not doing centralized registration?
export function getCategory(): string {
	throw new Error('Method not implemented.');
}

// TODO - This function is an internal detail about how providers are managed - recommend requiring it via tests for all providers, but not exposing it in the category surface directly (multi-provider incompatible)
export function getProviderName(): string {
	throw new Error('Method not implemented.');
}