import Observable, { ZenObservable } from 'zen-observable-ts';
import { ConsoleLogger as Logger } from '@aws-amplify/core';
import { ReachabilityMonitor } from './ReachabilityMonitor';

const logger = new Logger('DataStore');

const RECONNECTING_IN = 5000; // 5s this may be configurable in the future

type ConnectionStatus = {
	// Might add other params in the future
	online: boolean;
};

type ConnectivityStatus = 'connected' | 'disconnected';

export type SocketStatus = {
	networkStatus: ConnectivityStatus;
	socketStatus: ConnectivityStatus | 'connecting';
	intendedSocketStatus: ConnectivityStatus;
};

export class SocketConnectivity {
	// Connection status is network Status alone
	private connectionStatus: ConnectionStatus;
	private observer: ZenObservable.SubscriptionObserver<ConnectionStatus>;

	// Socket Status is status information about the network, socket and intended socket Status
	socketStatus: SocketStatus;
	socketStatusObservable: Observable<SocketStatus>;
	private socketStatusObserver: ZenObservable.SubscriptionObserver<SocketStatus>;

	private subscription: ZenObservable.Subscription;
	private timeout: ReturnType<typeof setTimeout>;
	constructor() {
		this.connectionStatus = {
			online: false,
		};

		this.socketStatus = {
			networkStatus: 'disconnected',
			socketStatus: 'disconnected',
			intendedSocketStatus: 'disconnected',
		};

		this.socketStatusObservable = new Observable(
			(
				socketStatusObserver: ZenObservable.SubscriptionObserver<SocketStatus>
			) => {
				console.log('Setting the observer');
				this.socketStatusObserver = socketStatusObserver;
			}
		);
	}

	status(): Observable<ConnectionStatus> {
		if (this.observer) {
			throw new Error('Subscriber already exists');
		}
		return new Observable(observer => {
			this.observer = observer;
			// Will be used to forward socket connection changes, enhancing Reachability
			this.subscription = ReachabilityMonitor.subscribe(({ online }) => {
				// Maintain the connection status
				this.connectionStatus.online = online;
				const observerResult = { ...this.connectionStatus }; // copyOf status
				this.observer.next(observerResult);

				// Maintain the socket status
				console.log('Usering the observer');
				this.updateSocketStatus({
					networkStatus: online ? 'connected' : 'disconnected',
				});
			});

			return () => {
				clearTimeout(this.timeout);
				this.unsubscribe();
			};
		});
	}

	unsubscribe() {
		if (this.subscription) {
			clearTimeout(this.timeout);
			this.subscription.unsubscribe();
		}
	}

	disconnected() {
		this.updateSocketStatus({ socketStatus: 'disconnected' });

		if (this.observer && typeof this.observer.next === 'function') {
			this.observer.next({ online: false }); // Notify network issue from the socket

			this.timeout = setTimeout(() => {
				// Maintain the connection status
				const observerResult = { ...this.connectionStatus }; // copyOf status
				this.observer.next(observerResult);
			}, RECONNECTING_IN); // giving time for socket cleanup and network status stabilization
		}
	}

	openingSocket() {
		this.updateSocketStatus({
			intendedSocketStatus: 'connected',
			socketStatus: 'connecting',
		});
	}

	closingSocket() {
		this.updateSocketStatus({
			intendedSocketStatus: 'disconnected',
		});
	}

	connectionEstablished() {
		this.updateSocketStatus({
			socketStatus: 'connected',
		});
	}

	private updateSocketStatus(statusUpdates: Partial<SocketStatus>) {
		// Maintain the socket status
		const newSocketStatus = { ...this.socketStatus, ...statusUpdates };
		this.socketStatus = { ...this.socketStatus, ...statusUpdates };
		if (newSocketStatus !== this.socketStatus && this.socketStatusObserver) {
			this.socketStatusObserver.next({ ...this.socketStatus });
		}
	}
}
