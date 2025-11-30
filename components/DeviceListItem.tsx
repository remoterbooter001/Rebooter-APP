
import React, { useRef, useContext, useState, useEffect } from 'react';
import type { Device } from '../types';
import { MoreVerticalIcon, ClockIcon, WifiIcon, SignalHighIcon, SignalLowIcon, SignalXIcon, DownloadIcon } from './icons';
import MqttContext from '../contexts/MqttContext';
import { MqttStatus } from '../hooks/useMqttManager';

interface DeviceListItemProps {
  device: Device;
  onSelect: (deviceId: string) => void;
  onDelete: (deviceId: string) => void;
  onRename: (deviceId: string) => void;
  lastResetTimestamp: string | null;
}

const StatusIndicator: React.FC<{ status: MqttStatus, errorMessage: string | null, otaProgress?: number, otaStatus?: string }> = ({ status, errorMessage, otaProgress, otaStatus }) => {
  const colorMap: Record<MqttStatus, string> = {
    online: 'bg-green-500',
    offline: 'bg-gray-500',
    connecting: 'bg-yellow-500 animate-pulse',
    error: 'bg-red-500',
    resetting: 'bg-blue-500 animate-pulse',
  };
  const textMap: Record<MqttStatus, string> = {
    online: 'Online',
    offline: 'Offline',
    connecting: 'Connecting...',
    error: 'Error',
    resetting: 'Rebooting...',
  };

  // Check if updating
  const isUpdating = otaStatus && (
      otaStatus.toLowerCase().includes('download') || 
      otaStatus.toLowerCase().includes('progress') || 
      otaStatus.toLowerCase().includes('resolving') ||
      otaStatus.toLowerCase().includes('redirect') ||
      otaStatus.toLowerCase().includes('start')
  );

  if (isUpdating) {
      const pct = otaProgress || 0;
      return (
          <div className="w-full">
              <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center">
                      <DownloadIcon className="w-3 h-3 mr-1 animate-bounce" />
                      {otaStatus}
                  </span>
                  <span className="text-xs font-mono text-gray-500">{pct}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                  <div 
                      className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-out" 
                      style={{ width: `${pct}%` }}
                  ></div>
              </div>
          </div>
      );
  }

  return (
    <div>
        <div className="flex items-center">
            <div className={`w-3 h-3 rounded-full mr-2 ${colorMap[status]}`}></div>
            <span className="text-sm text-gray-700 dark:text-gray-300">{textMap[status]}</span>
        </div>
        {status === 'error' && errorMessage && (
            <p className="text-xs text-red-500 dark:text-red-400 mt-1 pl-5">{errorMessage}</p>
        )}
    </div>

  );
};


const DeviceListItem: React.FC<DeviceListItemProps> = ({ device, onSelect, onDelete, onRename, lastResetTimestamp }) => {
  const { statuses } = useContext(MqttContext);
  
  const deviceStatus = statuses[device.device_id];
  const mqttLastAction = deviceStatus?.lastAction;
  const mqttLastActionTime = deviceStatus?.lastActionTime;
  
  // --- SMART STATUS LOGIC ---
  let status: MqttStatus = deviceStatus?.status as MqttStatus;
  
  if (!status || status === 'connecting') {
      if (device.lastSeen) {
          const lastSeenTime = new Date(device.lastSeen).getTime();
          // If less than 2 minutes ago, consider it effectively online (or at least recently seen)
          const secondsSince = (Date.now() - lastSeenTime) / 1000;
          if (secondsSince < 120) {
              status = 'online';
          } else {
              status = 'connecting';
          }
      } else {
          status = 'connecting';
      }
  }
  // --------------------------

  const errorMessage = deviceStatus?.errorMessage || null;
  const ping = deviceStatus?.ping || null;
  const otaProgress = deviceStatus?.otaProgress;
  const otaStatus = deviceStatus?.otaStatus;

  const [isMenuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleToggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(prev => !prev);
  };

  const handleRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    onRename(device.device_id);
  };
  
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    if(window.confirm(`Are you sure you want to delete "${device.custom_name}"?`)) {
        onDelete(device.device_id);
    }
  };
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuRef]);

  // Updated format to dd/mm/yyyy
  const formatTime = (date: Date | string | null | undefined): string => {
    if (!date) return 'Never';
    const d = new Date(date);
    if (isNaN(d.getTime())) return 'Never';
    
    return d.toLocaleString('en-GB', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const isSignalLost = status === 'offline' || status === 'error' || (status === 'online' && ping === null && !deviceStatus);

  // FIX: Robust fallback logic for Last Seen.
  let displayLastSeen: Date | string | null = null;
  
  if (deviceStatus?.lastSeen && !isNaN(new Date(deviceStatus.lastSeen).getTime())) {
      displayLastSeen = deviceStatus.lastSeen;
  } else if (device.lastSeen && !isNaN(new Date(device.lastSeen).getTime())) {
      displayLastSeen = device.lastSeen;
  }

  // FIX: Prioritize MQTT data for Last Action AND compare with History
  const effectiveLastAction = mqttLastAction || device.lastAction;
  const effectiveLastActionTime = mqttLastActionTime || device.lastActionTime;
  
  let actionTime: Date | string | null = null;
  let actionLabel = 'Last Reboot';

  if (effectiveLastAction) {
      if (effectiveLastAction === 'Power Off') actionLabel = 'Last Switch Off';
      else if (effectiveLastAction === 'Power On') actionLabel = 'Last Switch On';
      else actionLabel = 'Last Reboot';
  }

  // 1. Get Live/Stored Action Time
  let liveTime: Date | null = null;
  if (effectiveLastActionTime && !isNaN(new Date(effectiveLastActionTime).getTime())) {
      liveTime = new Date(effectiveLastActionTime);
  }

  // 2. Get History Timestamp
  let historyTime: Date | null = null;
  if (lastResetTimestamp && !isNaN(new Date(lastResetTimestamp).getTime())) {
      historyTime = new Date(lastResetTimestamp);
  }

  // 3. Compare and use the NEWEST valid time
  if (liveTime && historyTime) {
      // If we have both, show the most recent one
      if (historyTime.getTime() > liveTime.getTime()) {
          actionTime = historyTime;
          // If falling back to history reset, assume label is reboot if not specified
          if (!effectiveLastAction) actionLabel = 'Last Reboot';
      } else {
          actionTime = liveTime;
      }
  } else if (liveTime) {
      actionTime = liveTime;
  } else if (historyTime) {
      actionTime = historyTime;
      if (!effectiveLastAction) actionLabel = 'Last Reboot';
  }

  const mqttIsPoweredOff = deviceStatus?.isPoweredOff;
  const displayIsPoweredOff = mqttIsPoweredOff !== undefined ? mqttIsPoweredOff : device.isPoweredOff;

  return (
    <div
      className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-lg flex flex-col justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-200"
      onClick={() => onSelect(device.device_id)}
    >
      <div>
        <div className="flex justify-between items-start">
            <div className="flex-1 min-w-0 mr-2">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate">{device.custom_name}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate">{device.device_id}</p>
            </div>
            <div className="relative flex items-center" ref={menuRef}>
              {displayIsPoweredOff && (
                  <div className="mr-2 flex items-center justify-center px-2 py-1 bg-red-100 dark:bg-red-900/50 rounded border border-red-200 dark:border-red-800 shadow-sm" title="Relay is Powered Off">
                      <span className="text-xs font-bold text-red-600 dark:text-red-400 whitespace-nowrap">POWER OFF</span>
                  </div>
              )}

              {isSignalLost ? (
                  <div className="mr-2 flex items-center justify-center px-2 py-1" title="No Signal">
                      <SignalXIcon className="w-5 h-5 text-red-500" />
                  </div>
              ) : ping !== null ? (
                  <div className="mr-2 flex items-center bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-md border border-gray-200 dark:border-gray-600 shadow-sm" title={`Ping: ${ping}ms`}>
                      <span className={`text-xs font-mono font-bold mr-1.5 ${ping < 30 ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}`}>
                          {ping}ms
                      </span>
                      {ping < 30 ? (
                          <SignalHighIcon className="w-4 h-4 text-green-500" />
                      ) : (
                          <SignalLowIcon className="w-4 h-4 text-orange-500" />
                      )}
                  </div>
              ) : (
                  <div className="mr-2 flex items-center justify-center px-2 py-1" title="Waiting for signal...">
                      <SignalLowIcon className="w-5 h-5 text-gray-400 animate-pulse" />
                  </div>
              )}

              <button onClick={handleToggleMenu} className="p-2 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                  <MoreVerticalIcon className="w-5 h-5" />
              </button>
              {isMenuOpen && (
                <div className="absolute right-0 mt-2 w-36 bg-white dark:bg-gray-900 rounded-md shadow-lg z-10 border border-gray-200 dark:border-gray-700 top-full">
                  <button onClick={handleRename} className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-t-md">Rename</button>
                  <button onClick={handleDelete} className="block w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-b-md">Delete</button>
                </div>
              )}
            </div>
        </div>
        <div className="mt-3">
          <StatusIndicator status={status} errorMessage={errorMessage} otaProgress={otaProgress} otaStatus={otaStatus} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-2 text-xs text-gray-500 dark:text-gray-400">
            <div className="flex items-center truncate" title={`${actionLabel}: ${formatTime(actionTime)}`}>
                <ClockIcon className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" />
                <span className="truncate">{actionLabel}: {formatTime(actionTime)}</span>
            </div>
            <div className="flex items-center truncate" title={`Last Seen: ${formatTime(displayLastSeen)}`}>
                <WifiIcon className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" />
                <span className="truncate">Last Seen: {formatTime(displayLastSeen)}</span>
            </div>
        </div>
      </div>
      <button 
        onClick={(e) => {
            e.stopPropagation();
            onSelect(device.device_id);
        }} 
        className="mt-4 w-full text-center bg-blue-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-blue-500 transition-colors"
      >
        Open Panel
      </button>
    </div>
  );
};

export default DeviceListItem;
