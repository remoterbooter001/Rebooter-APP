import { createContext } from 'react';
import type { DeviceMqttState } from '../hooks/useMqttManager';

export interface MqttContextType {
  statuses: { [deviceId: string]: DeviceMqttState };
  publish: (deviceId: string, topic: string, message: string) => void;
}

const MqttContext = createContext<MqttContextType>({
  statuses: {},
  publish: () => console.warn('MqttProvider not found'),
});

export default MqttContext;