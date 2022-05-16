import { SocketConnectivity } from '@aws-amplify/core';

export default class DataStoreConnectivity extends SocketConnectivity {
	socketDisconnected() {
		this.disconnected();
	}
}
