import { default as Reachability } from '../Reachability';
import { default as NetInfo } from '@react-native-community/netinfo';

export const ReachabilityMonitor = new Reachability().networkMonitor(NetInfo);
