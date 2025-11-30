
export interface Schedule {
  id: string;
  time: string; // e.g., "14:30"
  days: string[]; // e.g., ["Mon", "Wed", "Fri"]
  enabled: boolean;
  action?: 'REBOOT' | 'OFF';
  endTime?: string; // e.g., "18:30", required if action is OFF
}

export interface DeviceCredentials {
  device_id: string;
  broker: string;
  port: number;
  user: string;
  pass: string;
  pair_token: string;
}

export interface Device extends DeviceCredentials {
  custom_name: string;
  schedules: Schedule[];
  lastSeen?: string;
  autoPingReboot?: boolean;
  pingThreshold?: number;
  isPoweredOff?: boolean;
  lastAction?: string; // 'Reboot', 'Power Off', 'Power On'
  lastActionTime?: string;
  firmwareRepo?: string; // e.g. "username/project-name"
}

export interface ResetHistoryEntry {
  id: string;
  deviceId: string;
  deviceName: string;
  timestamp: string;
  eventType: string;
}
