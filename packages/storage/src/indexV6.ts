import {StorageInterface} from './StorageV6';
import { StubProvider, AWSS3Provider } from './providers';
// export * as providers from './providers'
const Storage = new StorageInterface(StubProvider);
// const Storage = new StorageInterface(new AWSS3Provider());

export { Storage, StorageInterface };

