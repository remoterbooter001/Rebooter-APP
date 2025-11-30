import React, { useContext, useState, useEffect } from 'react';
import type { Device, Schedule } from '../types';
import { PowerIcon, ClockIcon, CloudIcon, DownloadIcon, CheckCircleIcon, SettingsIcon } from './icons';
import ScheduleManager from './ScheduleManager';
import MqttContext from '../contexts/MqttContext';
import { MqttStatus } from '../hooks/useMqttManager';

interface DevicePanelProps {
  device: Device;
  onUpdateSchedules: (deviceId: string, newSchedules: Schedule[]) => void;
  onUpdateConfig: (deviceId: string, config: Partial<Device>) => void;
}

const FIRMWARE_REPO = "remoterbooter001/auto_update";

const dayNameToNumber: { [key: string]: number } = {
    'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6
};

const transformSchedulesForDevice = (schedules: Schedule[]) => {
    return schedules
        .filter(s => s.enabled)
        .map(s => {
            const [hour, minute] = s.time.split(':').map(Number);
            const deviceDays = s.days.map(day => dayNameToNumber[day]);
            const type = s.days.length === 7 ? "daily" : "weekly";
            
            let action = "RESET";
            let duration = 0;

            if (s.action === 'OFF' && s.endTime) {
                action = "OFF";
                const [endH, endM] = s.endTime.split(':').map(Number);
                
                const startMins = hour * 60 + minute;
                let endMins = endH * 60 + endM;
                
                if (endMins <= startMins) {
                    endMins += 1440;
                }
                
                duration = endMins - startMins;
            }

            return {
                id: s.id,
                type: type,
                hour: hour,
                minute: minute,
                day_of_month: 0,
                action: action,
                duration: duration,
                days: deviceDays
            };
        });
};

const CircularProgress = ({ percentage, status }: { percentage: number, status: string | null }) => {
    const radius = 20;
    const circumference = 2 * Math.PI * radius;
    // Ensure percentage is clamped between 0 and 100
    const validPercentage = Math.min(100, Math.max(0, percentage));
    const strokeDashoffset = circumference - (validPercentage / 100) * circumference;
    
    const isSuccess = validPercentage >= 100 || (status && status.toLowerCase().includes('success'));
    const isError = status && (status.toLowerCase().includes('fail') || status.toLowerCase().includes('error'));
  
    return (
      <div className="flex flex-col items-center">
        <div className="relative w-16 h-16 flex items-center justify-center">
            <svg className="transform -rotate-90 w-16 h-16">
            <circle
                className="text-gray-200 dark:text-gray-700"
                strokeWidth="4"
                stroke="currentColor"
                fill="transparent"
                r={radius}
                cx="32"
                cy="32"
            />
            {!isError && (
                 <circle
                    className={`transition-all duration-300 ease-in-out ${isSuccess ? 'text-green-500' : 'text-blue-600'}`}
                    strokeWidth="4"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="transparent"
                    r={radius}
                    cx="32"
                    cy="32"
                />
            )}
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
                {isSuccess ? (
                    <CheckCircleIcon className="w-6 h-6 text-green-500" />
                ) : isError ? (
                    <span className="text-red-500 font-bold text-lg">!</span>
                ) : (
                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{Math.round(validPercentage)}%</span>
                )}
            </div>
        </div>
        {status && <p className="text-xs text-gray-500 mt-2 max-w-[150px] text-center truncate">{status}</p>}
      </div>
    );
};

interface StatusDisplayProps {
    status: MqttStatus;
    lastSeen: Date | null;
    errorMessage: string | null;
    lastAction?: string;
    lastActionTime?: Date | string | null;
}

const StatusDisplay: React.FC<StatusDisplayProps> = ({ status, lastSeen, errorMessage, lastAction, lastActionTime }) => {
    const statusInfo = {
        online: { text: "ONLINE", color: "text-green-400" },
        offline: { text: "OFFLINE", color: "text-gray-500 dark:text-gray-400" },
        connecting: { text: "CONNECTING...", color: "text-yellow-400" },
        error: { text: "ERROR", color: "text-red-400" },
        resetting: { text: "REBOOTING...", color: "text-blue-400 animate-pulse" },
    };
    
    // Safety check: if status is invalid/unknown, default to offline
    const info = statusInfo[status] || statusInfo.offline;
    const { text, color } = info;
    
    let actionLabel = 'Last Reboot';
    if (lastAction === 'Power Off') actionLabel = 'Last Switch Off';
    else if (lastAction === 'Power On') actionLabel = 'Last Switch On';

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">Status</p>
            <p className={`text-2xl font-bold ${color}`}>{text}</p>
            {status === 'error' && errorMessage && (
                <p className="text-xs text-red-400 mt-1">{errorMessage}</p>
            )}
            {lastSeen && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Last seen: {new Date(lastSeen).toLocaleString('en-GB', { 
                        year: 'numeric', 
                        month: '2-digit', 
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                    })}
                </p>
            )}
            {lastActionTime && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    {actionLabel}: {new Date(lastActionTime).toLocaleString('en-GB', { 
                        year: 'numeric', 
                        month: '2-digit', 
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                    })}
                </p>
            )}
        </div>
    );
}

// Semver comparison helper
const compareVersions = (v1: string, v2: string) => {
    // Remove 'v' prefix if present
    const cleanV1 = v1.replace(/^v/, '').trim();
    const cleanV2 = v2.replace(/^v/, '').trim();
    
    // Handle exact string match
    if (cleanV1 === cleanV2) return 0;
    
    const parts1 = cleanV1.split('.').map(Number);
    const parts2 = cleanV2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const p1 = parts1[i] || 0;
        const p2 = parts2[i] || 0;
        if (p1 > p2) return 1;
        if (p1 < p2) return -1;
    }
    return 0;
};

const DevicePanel: React.FC<DevicePanelProps> = ({ device, onUpdateSchedules, onUpdateConfig }) => {
  const { statuses, publish } = useContext(MqttContext);
  const { status, lastSeen, errorMessage, otaStatus, otaProgress, deviceVersion, isPoweredOff, lastAction, lastActionTime } = statuses[device.device_id] || { status: 'offline', lastSeen: null, errorMessage: null, otaStatus: null, otaProgress: 0, deviceVersion: null, isPoweredOff: false };

  const [autoRebootEnabled, setAutoRebootEnabled] = useState(device.autoPingReboot || false);
  const [pingThreshold, setPingThreshold] = useState(device.pingThreshold || 200);
  const [isEditingThreshold, setIsEditingThreshold] = useState(false);
  
  // Firmware Update State
  const [availableReleases, setAvailableReleases] = useState<any[]>([]);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateStep, setUpdateStep] = useState<'idle' | 'checking' | 'list' | 'updating'>('idle');

  useEffect(() => {
      setAutoRebootEnabled(device.autoPingReboot || false);
      setPingThreshold(device.pingThreshold || 200);
      // Reset update state on device change
      setUpdateStep('idle');
      setAvailableReleases([]);
      setUpdateError(null);
  }, [device.device_id]);

  // Effect to handle OTA status changes from MQTT to switch UI mode
  useEffect(() => {
    if (otaStatus) {
        const s = otaStatus.toLowerCase();
        if (s.includes('start') || s.includes('progress') || s.includes('download') || s.includes('resolving') || s.includes('redirect')) {
             setUpdateStep('updating');
        } else if (s.includes('success')) {
             setUpdateStep('idle');
             // Optionally trigger a refresh of version after reboot
             setTimeout(() => publish(device.device_id, `${device.device_id}/version/get`, "1"), 5000);
        }
    }
  }, [otaStatus, device.device_id, publish]);

  // Prioritize Live MQTT data, fallback to Device stored data
  const displayLastSeen = lastSeen ? lastSeen : (device.lastSeen ? new Date(device.lastSeen) : null);
  const displayLastAction = lastAction || device.lastAction;
  const displayLastActionTime = lastActionTime || device.lastActionTime;

  const isResetting = status === 'resetting';

  const handleReset = () => {
    if (status === 'online') {
        const topic = `${device.device_id}/reset`;
        publish(device.device_id, topic, "1");
    } else {
        alert("Device is offline. Cannot send reset command.");
    }
  };

  const handleSchedulesChange = (newSchedules: Schedule[]) => {
    onUpdateSchedules(device.device_id, newSchedules);
    if (status === 'online') {
        const topic = `${device.device_id}/schedule/set`;
        const transformedSchedules = transformSchedulesForDevice(newSchedules);
        publish(device.device_id, topic, JSON.stringify(transformedSchedules));
    }
  };

  const handleClearAllSchedules = () => {
    if (status === 'online') {
        publish(device.device_id, `${device.device_id}/schedule/clear`, "1");
    } else {
        alert("Device is offline. Cannot clear schedules.");
    }
  };

  // --- Firmware Update Logic ---
  
  const checkForUpdates = async () => {
      setUpdateStep('checking');
      setUpdateError(null);
      setAvailableReleases([]);

      // 1. Request current version from device (in case we missed the retained msg)
      if (status === 'online') {
          publish(device.device_id, `${device.device_id}/version/get`, "1");
      }

      try {
          // Fetch ALL releases, not just 'latest'
          const response = await fetch(`https://api.github.com/repos/${FIRMWARE_REPO}/releases`);
          if (!response.ok) {
              throw new Error(response.status === 404 ? "Repo/Releases not found" : "GitHub API Error");
          }
          const data = await response.json();
          
          if (Array.isArray(data)) {
              setAvailableReleases(data);
          } else {
              setAvailableReleases([data]); // If single object returned
          }
          
          // Wait a moment for device version to arrive if it was requested
          setTimeout(() => {
               setUpdateStep('list'); 
          }, 1000);

      } catch (e: any) {
          setUpdateError(e.message);
          setUpdateStep('idle');
      }
  };

  const startFirmwareUpdate = (downloadUrl: string) => {
      if (status !== 'online') return;
      setUpdateStep('updating');
      publish(device.device_id, `${device.device_id}/ota/start`, downloadUrl);
  };

  // Computed state for update UI
  let updateStatusUI = null;
  
  if (updateStep === 'checking') {
      updateStatusUI = <div className="text-sm text-gray-500 flex items-center justify-center p-4"><ClockIcon className="animate-spin mr-2 h-4 w-4"/>Checking Version...</div>;
  } else if (updateStep === 'list' && availableReleases.length > 0) {
      const current = deviceVersion || "Unknown";
      
      updateStatusUI = (
          <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
              <div className="flex justify-between items-center px-1">
                 <span className="text-sm font-bold text-gray-500 dark:text-gray-400">Available Versions</span>
                 <span className="text-xs text-gray-500">Current: <span className="font-mono font-bold text-gray-800 dark:text-gray-200">{current}</span></span>
              </div>
              <div className="max-h-80 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                  {availableReleases.map((release: any) => {
                      const version = release.tag_name;
                      const comparison = compareVersions(version, current);
                      const asset = release.assets?.find((a: any) => a.name.endsWith('.bin'));
                      const publishedAt = new Date(release.published_at).toLocaleDateString();
                      const body = release.body;

                      if (!asset) return null; // Skip releases without binaries

                      let label = "Reinstall";
                      let colorClass = "bg-gray-100 text-gray-700 dark:bg-gray-600 dark:text-gray-200";
                      
                      if (comparison > 0) {
                          label = "Upgrade";
                          colorClass = "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 border-green-200 dark:border-green-800";
                      } else if (comparison < 0) {
                          label = "Downgrade";
                          colorClass = "bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 border-orange-200 dark:border-orange-800";
                      } else {
                          // Same version
                          label = "Current";
                          colorClass = "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800";
                      }

                      return (
                          <div key={release.id} className={`p-3 rounded-md border flex flex-col ${colorClass}`}>
                              <div className="flex justify-between items-start w-full">
                                  <div>
                                      <div className="flex items-center space-x-2">
                                        <span className="font-mono font-bold">{version}</span>
                                        {comparison === 0 && <span className="text-[10px] bg-blue-200 dark:bg-blue-800 px-1.5 py-0.5 rounded-full">Installed</span>}
                                      </div>
                                      <div className="text-xs opacity-80">{publishedAt}</div>
                                  </div>
                                  <button 
                                      onClick={() => startFirmwareUpdate(asset.browser_download_url)}
                                      className="text-xs font-semibold px-3 py-1.5 bg-white dark:bg-gray-800 rounded shadow-sm hover:shadow-md transition-shadow flex items-center shrink-0 ml-2"
                                  >
                                      <DownloadIcon className="w-3 h-3 mr-1" />
                                      {comparison === 0 ? "Reinstall" : label}
                                  </button>
                              </div>
                              
                              {body && (
                                  <div className="mt-2 w-full text-xs pt-2 border-t border-black/5 dark:border-white/10">
                                      <p className="font-semibold mb-1 opacity-70">Changes:</p>
                                      <pre className="whitespace-pre-wrap font-sans opacity-90">{body}</pre>
                                  </div>
                              )}
                          </div>
                      );
                  })}
              </div>
              {availableReleases.length === 0 && <p className="text-center text-sm text-gray-500">No binary releases found.</p>}
          </div>
      );
  } else if (updateStep === 'list' && availableReleases.length === 0) {
      updateStatusUI = (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-md border border-red-200 dark:border-red-800 text-center">
            <p className="text-sm text-red-600 dark:text-red-400">No releases found in repository.</p>
        </div>
      );
  } else if (updateStep === 'updating') {
      const displayProgress = otaProgress || 0;
      updateStatusUI = (
          <div className="flex flex-col items-center justify-center p-4">
              <CircularProgress percentage={displayProgress} status={otaStatus || "Initializing..."} />
          </div>
      );
  }

  // --- End Firmware Logic ---

  const handleToggleAutoReboot = (e: React.ChangeEvent<HTMLInputElement>) => {
      const isEnabled = e.target.checked;
      setAutoRebootEnabled(isEnabled);
      onUpdateConfig(device.device_id, { autoPingReboot: isEnabled });

      if (status === 'online') {
          publish(device.device_id, `${device.device_id}/config/ping_reboot`, JSON.stringify({
              enabled: isEnabled,
              threshold: pingThreshold
          }));
      }
  };

  const handleSaveThreshold = () => {
      onUpdateConfig(device.device_id, { pingThreshold: pingThreshold });
  };

  return (
    <div className="p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="mb-4">
            <h2 className="text-2xl font-bold">{device.custom_name}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">{device.device_id}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <StatusDisplay 
                status={status} 
                lastSeen={displayLastSeen} 
                errorMessage={errorMessage} 
                lastAction={displayLastAction}
                lastActionTime={displayLastActionTime}
            />
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 flex flex-col justify-center">
                 <button 
                    onClick={handleReset} 
                    disabled={status !== 'online' || isResetting || isPoweredOff}
                    className={`w-full font-bold py-3 px-4 rounded-lg flex items-center justify-center transition-colors duration-200 text-white ${
                        isResetting 
                        ? 'bg-blue-600 cursor-wait'
                        : 'bg-red-600 hover:bg-red-500 disabled:bg-gray-500 dark:disabled:bg-gray-600 disabled:cursor-not-allowed disabled:text-gray-300 dark:disabled:text-gray-400'
                    }`}
                >
                    {isResetting ? (
                        <>
                            <ClockIcon className="mr-2 animate-spin"/>
                            Rebooting...
                        </>
                    ) : (
                        <>
                            <PowerIcon className="mr-2"/>
                            Reboot Router Now
                        </>
                    )}
                </button>
            </div>
        </div>

        {/* Maintenance Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-bold flex items-center mb-4 text-gray-800 dark:text-white">
                <CloudIcon className="mr-2" /> Maintenance & Diagnostics
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* OTA Update */}
                <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-md col-span-2">
                    <h4 className="font-semibold text-sm text-gray-600 dark:text-gray-300 mb-2">Firmware Update</h4>

                    <div className="mb-2">
                         {updateStep === 'idle' && (
                            <div className="flex justify-between items-center">
                                <div className="text-sm">
                                    <span className="text-gray-500 dark:text-gray-400">Version: </span>
                                    <span className="font-mono font-bold">{deviceVersion || "Unknown"}</span>
                                </div>
                                <button 
                                    onClick={checkForUpdates}
                                    disabled={status !== 'online'}
                                    className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 px-3 py-1.5 rounded-md transition-colors disabled:opacity-50 text-sm font-medium"
                                >
                                    Check Versions
                                </button>
                            </div>
                         )}
                    </div>
                    
                    {updateError && (
                        <div className="mb-3 p-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs rounded">
                            Error: {updateError}
                        </div>
                    )}

                    {updateStatusUI}
                </div>
            </div>
        </div>

        {/* Auto-Reboot by Ping Configuration */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-bold flex items-center mb-4 text-gray-800 dark:text-white">
                <SettingsIcon className="mr-2" /> Auto-Reboot by Ping configuration
            </h3>
            <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-md">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <p className="font-semibold text-sm text-gray-700 dark:text-gray-200">Reboot on High Ping</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Automatically reboot if ping exceeds threshold.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                            type="checkbox" 
                            checked={autoRebootEnabled} 
                            onChange={handleToggleAutoReboot} 
                            className="sr-only peer" 
                        />
                        <div className="w-11 h-6 bg-gray-200 dark:bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                </div>
                
                <div className="mb-2">
                    <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Ping Threshold (ms)</label>
                    {!isEditingThreshold ? (
                        <div 
                            onClick={() => setIsEditingThreshold(true)}
                            className={`w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md px-3 py-2 text-gray-900 dark:text-white cursor-pointer flex justify-between items-center transition-all hover:border-blue-400 ${!autoRebootEnabled ? 'opacity-50' : ''}`}
                            title="Click to edit threshold"
                        >
                            <span className="font-mono">{pingThreshold} ms</span>
                            <span className="text-xs text-gray-500 dark:text-gray-400 italic">Click to edit</span>
                        </div>
                    ) : (
                        <div className="flex gap-2 animate-in fade-in zoom-in duration-200">
                            <input 
                                type="number" 
                                value={pingThreshold} 
                                onChange={e => setPingThreshold(parseInt(e.target.value) || 0)}
                                className="flex-1 bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        handleSaveThreshold();
                                        setIsEditingThreshold(false);
                                    }
                                }}
                            />
                            <button 
                                onClick={() => {
                                    handleSaveThreshold();
                                    setIsEditingThreshold(false);
                                }}
                                className="px-4 py-2 rounded-md text-sm font-semibold bg-blue-600 text-white hover:bg-blue-500 shadow-sm transition-colors"
                            >
                                Save
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>

        <ScheduleManager 
          schedules={device.schedules} 
          onSchedulesChange={handleSchedulesChange}
          onClearAll={handleClearAllSchedules}
        />
      </div>
    </div>
  );
};

export default DevicePanel;