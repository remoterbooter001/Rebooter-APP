
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import mqtt from 'mqtt';
import type { Device } from '../types';

interface MqttClient {
  on(event: string, callback: (...args: any[]) => void): this;
  subscribe(topic: string | string[], options: { qos: number }, callback: (err: Error | null) => void): this;
  publish(topic: string, message: string): this;
  end(force: boolean, cb?: () => void): this;
  connected: boolean;
}

export type MqttStatus = 'online' | 'offline' | 'connecting' | 'error' | 'resetting';

export interface DeviceMqttState {
  status: MqttStatus;
  errorMessage: string | null;
  lastSeen: Date | null;
  healthStatus?: string | null;
  otaStatus?: string;
  otaProgress?: number;
  deviceVersion?: string;
  ping?: number | null;
  isPoweredOff?: boolean;
  lastAction?: string;
  lastActionTime?: Date | null;
}

interface UseMqttManagerProps {
    devices: Device[];
    onDeviceEvent: (deviceId: string, eventType: string, timestamp: Date) => void;
    onSchedulesCleared: (deviceId: string) => void;
    onDeviceSeen: (deviceId: string, timestamp: Date) => void;
    onDeviceAction: (deviceId: string, action: string, timestamp: Date) => void;
}

export const useMqttManager = ({ devices, onDeviceEvent, onSchedulesCleared, onDeviceSeen, onDeviceAction }: UseMqttManagerProps) => {
  const [statuses, setStatuses] = useState<{ [deviceId: string]: DeviceMqttState }>({});
  const clientsRef = useRef<{ [deviceId: string]: MqttClient }>({});
  const watchdogTimersRef = useRef<{ [deviceId: string]: number }>({});

  const onDeviceEventRef = useRef(onDeviceEvent);
  const onSchedulesClearedRef = useRef(onSchedulesCleared);
  const onDeviceSeenRef = useRef(onDeviceSeen);
  const onDeviceActionRef = useRef(onDeviceAction);

  // Keep refs current to avoid effect dependency loops
  useEffect(() => {
    onDeviceEventRef.current = onDeviceEvent;
    onSchedulesClearedRef.current = onSchedulesCleared;
    onDeviceSeenRef.current = onDeviceSeen;
    onDeviceActionRef.current = onDeviceAction;
  }, [onDeviceEvent, onSchedulesCleared, onDeviceSeen, onDeviceAction]);

  // Create a stable key for device connections
  const connectionKey = useMemo(() => {
    return devices.map(d => `${d.device_id}|${d.broker}|${d.user}|${d.pass}`).sort().join('||');
  }, [devices]);

  const devicesRef = useRef(devices);
  useEffect(() => {
    devicesRef.current = devices;
  }, [devices]);
  
  const setDeviceStatus = (deviceId: string, newStatus: Partial<DeviceMqttState>) => {
    setStatuses(prev => ({
      ...prev,
      [deviceId]: {
        ...(prev[deviceId] || { status: 'connecting', errorMessage: null, lastSeen: null, ping: null, isPoweredOff: undefined, lastAction: undefined, lastActionTime: undefined }),
        ...newStatus,
      },
    }));
  };

  useEffect(() => {
    const currentDevices = devicesRef.current;

    const stopWatchdog = (deviceId: string) => {
      if (watchdogTimersRef.current[deviceId]) {
        clearTimeout(watchdogTimersRef.current[deviceId]);
        delete watchdogTimersRef.current[deviceId];
      }
    };

    const startWatchdog = (deviceId: string) => {
      stopWatchdog(deviceId);
      watchdogTimersRef.current[deviceId] = window.setTimeout(() => {
        setDeviceStatus(deviceId, { 
            status: 'offline', 
            errorMessage: 'Device timed out (no heartbeat).',
            ping: null, 
            healthStatus: null
        });
      }, 70000); // 70s timeout
    };

    currentDevices.forEach(device => {
      const { device_id, broker, user, pass } = device;

      if (!clientsRef.current[device_id]) {
        const brokerUrl = `wss://${broker}:8884/mqtt`;
        const options = {
          username: user,
          password: pass,
          clientId: `webapp_${device_id}_${Math.random().toString(16).substr(2, 8)}`,
          reconnectPeriod: 5000,
          connectTimeout: 10000,
          keepalive: 60,
        };

        setDeviceStatus(device_id, { status: 'connecting' });
        
        try {
          const client: any = mqtt.connect(brokerUrl, options);
          clientsRef.current[device_id] = client;
          
          const topics = [
            `${device_id}/online`,
            `${device_id}/heartbeat`,
            `${device_id}/status`,
            `${device_id}/health/status`,
            `${device_id}/ota/status`,
            `${device_id}/ota/progress`,
            `${device_id}/version`,
            `${device_id}/last_reset`,
            `${device_id}/last_reboot`,
            `${device_id}/events`,
            `${device_id}/log`
          ];

          client.on('connect', () => {
            setDeviceStatus(device_id, { status: 'connecting', errorMessage: 'Connected, waiting for data...' });
            client.subscribe(topics, { qos: 0 }, (err: Error | null) => {
              if (err) {
                setDeviceStatus(device_id, { status: 'error', errorMessage: `Subscription failed: ${err.message}`});
              }
            });
          });

          client.on('message', (topic: string, message: any, packet: any) => {
            const rawString = message.toString();
            // 1. Basic cleaning - keep control chars out
            let cleanString = rawString.replace(/[\x00-\x1F\x7F-\x9F]/g, "").replace(/^"|"$/g, '').trim(); 
            const isRetained = packet.retain;
            
            let timestampVal: number | null = null;
            let eventTime: Date | null = null;
            let payloadStr = cleanString;
            let uptimeVal: number | null = null;
            
            // --- TIMESTAMP EXTRACTION (Aggressive) ---
            
            // 1. Try to find any sequence of 10-13 digits (seconds or ms)
            // This handles "reset_done|1764448611", "online 1764448611", "1764448611", etc.
            const allDigitMatches = cleanString.match(/(\d{10,14})/g);
            
            if (allDigitMatches && allDigitMatches.length > 0) {
                // Use the last match found (often the appended timestamp)
                const tsString = allDigitMatches[allDigitMatches.length - 1];
                timestampVal = parseInt(tsString, 10);
                
                // Remove the found timestamp from the payload string for text analysis
                // We use replace to remove just that instance
                payloadStr = cleanString.replace(tsString, '').replace(/[|:\-\s]+$/, '').trim();
            }

            // 2. JSON Parsing Fallback (if payload looks like JSON)
            if (cleanString.startsWith('{') && cleanString.endsWith('}')) {
                 try {
                     const json = JSON.parse(cleanString);
                     
                     const ts = json.ts || json.timestamp || json.time || json.last_seen || json.boot_time || json.last_reset || json.last_reboot;
                     if (ts) timestampVal = isNaN(Number(ts)) ? Date.parse(ts) : Number(ts);
                     
                     if (json.uptime && !isNaN(Number(json.uptime))) {
                         uptimeVal = Number(json.uptime);
                     }
                     
                     if (json.status) payloadStr = json.status;
                     else if (json.action) payloadStr = json.action;
                     else if (json.msg) payloadStr = json.msg;
                 } catch (e) { /* ignore */ }
            }

            // --- TIME OBJECT CREATION ---
            if (timestampVal !== null && !isNaN(timestampVal)) {
                // Heuristic for Seconds vs Milliseconds (Year 2000 cutoff)
                if (timestampVal > 946684800000) { 
                     eventTime = new Date(timestampVal);
                } else {
                     eventTime = new Date(timestampVal * 1000);
                }
            } else if (uptimeVal !== null) {
                eventTime = new Date(Date.now() - (uptimeVal * 1000));
            }

            // If no timestamp found, ONLY use current time if NOT retained.
            if (!eventTime && !isRetained) {
                eventTime = new Date();
            }

            // Normalize Payload for keyword matching
            let payload = payloadStr.replace(/^[|:\-\s]+|[|:\-\s]+$/g, '').toLowerCase();

            // --- TOPIC & PAYLOAD ANALYSIS ---
            const isHeartbeatTopic = topic.endsWith('/online') || topic.endsWith('/heartbeat') || topic.endsWith('/status');
            const isResetTopic = topic.endsWith('/last_reset') || topic.endsWith('/last_reboot');
            
            // Critical Keywords
            const hasResetDone = payload.includes('reset_done') || payload.includes('boot') || payload.includes('start') || (payload.includes('reset') && payload.includes('done'));
            const hasResetting = payload.includes('resetting');
            const hasOnline = payload === 'online' || payload === '1' || payload === 'true' || payload === 'on' || payload === 'connected' || payload === 'idle';

            const isOnlineSignal = hasOnline || hasResetDone || hasResetting;

            let detectedActionType = '';
            let detectedEventType = '';
            let isRebootEvent = false;
            let isPowerEvent = false;
            let poweredOffState = false;

            // --- ACTION DETECTION ---
            
            // Priority 1: Reboot Detection
            if (isResetTopic || hasResetDone || hasResetting || payload.includes('reset_manual') || payload.includes('reset_schedule') || payload.includes('reboot')) {
                 detectedActionType = 'Reboot';
                 detectedEventType = hasResetDone ? 'Reboot Completed' : 'Rebooting';
                 isRebootEvent = true;
            } 
            // Priority 2: Power Detection
            else if (payload === 'power_off' || payload === 'turn_off' || payload === 'off' || payload === '0') {
                 detectedActionType = 'Power Off';
                 detectedEventType = 'Powered off';
                 isPowerEvent = true;
                 poweredOffState = true;
            } else if (payload.includes('power_on') || payload.includes('turn_on')) {
                 detectedActionType = 'Power On';
                 detectedEventType = 'Powered ON';
                 isPowerEvent = true;
                 poweredOffState = false;
            }
            
            // --- STATE UPDATES ---
            const statusUpdate: Partial<DeviceMqttState> = {};

            if (topic.endsWith('/health/status') && !isRetained) {
                const match = rawString.match(/(\d+)/);
                if (match) statusUpdate.ping = parseInt(match[1], 10);
                
                statusUpdate.healthStatus = rawString;
                statusUpdate.status = 'online';
                statusUpdate.errorMessage = null;
                const pingTime = new Date();
                statusUpdate.lastSeen = pingTime;
                
                onDeviceSeenRef.current(device_id, pingTime);
                startWatchdog(device_id);

            } else if (topic.endsWith('/ota/status')) {
                statusUpdate.otaStatus = rawString;
            } else if (topic.endsWith('/ota/progress')) {
                const progress = parseInt(rawString, 10);
                if (!isNaN(progress)) statusUpdate.otaProgress = progress;
            } else if (topic.endsWith('/version')) {
                statusUpdate.deviceVersion = rawString;
            } else if (isHeartbeatTopic) {
                
                if (isOnlineSignal || isRebootEvent) {
                    if (hasResetting) {
                         statusUpdate.status = 'resetting';
                    } else {
                         statusUpdate.status = 'online';
                    }
                    statusUpdate.errorMessage = null;
                    startWatchdog(device_id);
                    
                    if (eventTime) {
                        statusUpdate.lastSeen = eventTime;
                        onDeviceSeenRef.current(device_id, eventTime);
                    }
                } else if (payload.includes('offline') || payload === 'disconnected') {
                    stopWatchdog(device_id);
                    statusUpdate.status = 'offline';
                    statusUpdate.errorMessage = "Device disconnected.";
                    statusUpdate.ping = null;
                    
                    if (eventTime) {
                        statusUpdate.lastSeen = eventTime;
                        onDeviceSeenRef.current(device_id, eventTime);
                    }
                }
                
                if (topic.endsWith('/status')) {
                     if (payload.includes('schedules_cleared')) {
                        onSchedulesClearedRef.current(device_id);
                    }
                }
            } 

            // Apply Detected Actions
            if (detectedActionType && eventTime) {
                 // Trigger global event callbacks (populates History)
                 onDeviceEventRef.current(device_id, detectedEventType, eventTime);
                 
                 // Update Local Storage
                 onDeviceActionRef.current(device_id, detectedActionType, eventTime);
                 
                 // Update Live State
                 statusUpdate.lastAction = detectedActionType;
                 statusUpdate.lastActionTime = eventTime;

                 if (isRebootEvent) {
                     // For reboots, also update lastSeen if it's from a status topic
                     if (isHeartbeatTopic) {
                         statusUpdate.lastSeen = eventTime;
                         onDeviceSeenRef.current(device_id, eventTime);
                     }
                 }

                 if (isPowerEvent) {
                     statusUpdate.isPoweredOff = poweredOffState;
                 }
            }

            if (Object.keys(statusUpdate).length > 0) {
                setDeviceStatus(device_id, statusUpdate);
            }

          });

          client.on('error', (err: Error) => {
            setDeviceStatus(device_id, { status: 'error', errorMessage: err.message });
            stopWatchdog(device_id);
          });
          
          client.on('reconnect', () => {
              setDeviceStatus(device_id, { status: 'connecting' });
              stopWatchdog(device_id);
          });

          client.on('close', () => {
            setDeviceStatus(device_id, { status: 'offline', errorMessage: 'Connection closed.' });
            stopWatchdog(device_id);
          });

        } catch (error: any) {
            setDeviceStatus(device_id, { status: 'error', errorMessage: error.message || 'Failed to initiate connection.'});
        }
      }
    });

    const currentDeviceIds = new Set(currentDevices.map(d => d.device_id));
    Object.entries(clientsRef.current).forEach(([deviceId, client]: [string, MqttClient]) => {
      if (!currentDeviceIds.has(deviceId)) {
        client.end(true);
        stopWatchdog(deviceId);
        delete clientsRef.current[deviceId];
        setStatuses(prev => {
            const newStatuses = {...prev};
            delete newStatuses[deviceId];
            return newStatuses;
        });
      }
    });
  }, [connectionKey]); 

  useEffect(() => {
    return () => {
      Object.values(clientsRef.current).forEach((client: MqttClient) => client.end(true));
      Object.keys(watchdogTimersRef.current).forEach(deviceId => {
        clearTimeout(watchdogTimersRef.current[deviceId]);
      });
    };
  }, []);

  const publish = useCallback((deviceId: string, topic: string, message: string) => {
    const client = clientsRef.current[deviceId];
    if (client && client.connected) {
      client.publish(topic, message);
    } else {
      alert("Cannot send command: device is not connected.");
    }
  }, []);

  return { statuses, publish };
};
