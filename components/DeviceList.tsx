
import React, { useState, useContext } from 'react';
import type { Device, ResetHistoryEntry, Schedule } from '../types';
import DeviceListItem from './DeviceListItem';
import { PlusIcon, SearchIcon, DownloadIcon, XIcon, CheckCircleIcon, CloudIcon, PowerIcon, ClockIcon, TrashIcon } from './icons';
import type { DeviceMqttState } from '../hooks/useMqttManager';
import MqttContext from '../contexts/MqttContext';

interface DeviceListProps {
  devices: Device[];
  onSelectDevice: (deviceId: string) => void;
  onDeleteDevice: (deviceId: string) => void;
  onRenameDevice: (deviceId: string) => void;
  onAddDeviceClick: () => void;
  onBulkAddSchedule: (schedule: Omit<Schedule, 'id'>) => void;
  onBulkClearSchedules: () => void;
  totalDevices: number;
  onlineDevices: number;
  history: ResetHistoryEntry[];
  statuses: { [deviceId: string]: DeviceMqttState };
}

const FIRMWARE_REPO = "remoterbooter001/auto_update";

const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Helper to format schedules for ESP32
const dayNameToNumber: { [key: string]: number } = {
    'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6
};

const transformSchedulesForMqtt = (schedules: Schedule[]) => {
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
                if (endMins <= startMins) endMins += 1440;
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

const DeviceList: React.FC<DeviceListProps> = ({ devices, onSelectDevice, onDeleteDevice, onRenameDevice, onAddDeviceClick, onBulkAddSchedule, onBulkClearSchedules, totalDevices, onlineDevices, history, statuses }) => {
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modals
  const [isBulkUpdateModalOpen, setBulkUpdateModalOpen] = useState(false);
  const [isBulkScheduleModalOpen, setBulkScheduleModalOpen] = useState(false);
  
  // Firmware Update State
  const [releases, setReleases] = useState<any[]>([]);
  const [loadingReleases, setLoadingReleases] = useState(false);
  
  // Schedule Form State
  const [newTime, setNewTime] = useState('07:00');
  const [newEndTime, setNewEndTime] = useState('19:00');
  const [newAction, setNewAction] = useState<'REBOOT' | 'OFF'>('REBOOT');
  const [newDays, setNewDays] = useState<string[]>([]);
  
  const { publish } = useContext(MqttContext);

  const filteredDevices = devices.filter(device => 
    device.custom_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    device.device_id.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  const findLastResetTimestamp = (deviceId: string): string | null => {
      const lastEntry = history.find(entry => entry.deviceId === deviceId);
      return lastEntry ? lastEntry.timestamp : null;
  }

  const healthyDevices = Object.values(statuses).filter((s: DeviceMqttState) => 
    typeof s.ping === 'number' && s.ping < 30
  ).length;
  const weakDevices = Object.values(statuses).filter((s: DeviceMqttState) => 
    typeof s.ping === 'number' && s.ping >= 30
  ).length;

  // --- Bulk Firmware Logic ---
  const fetchReleases = async () => {
    setLoadingReleases(true);
    try {
        const response = await fetch(`https://api.github.com/repos/${FIRMWARE_REPO}/releases`);
        if (!response.ok) throw new Error("Failed to fetch releases");
        const data = await response.json();
        setReleases(Array.isArray(data) ? data : [data]);
    } catch (e) {
        console.error(e);
        setReleases([]);
    } finally {
        setLoadingReleases(false);
    }
  };

  const openBulkUpdateModal = () => {
      setBulkUpdateModalOpen(true);
      fetchReleases();
  };

  const handleBulkUpdate = (downloadUrl: string) => {
      if (confirm(`This will update ALL ${onlineDevices} online devices. Are you sure?`)) {
          devices.forEach(device => {
              const status = statuses[device.device_id];
              if (status && status.status === 'online') {
                  publish(device.device_id, `${device.device_id}/ota/start`, downloadUrl);
              }
          });
          setBulkUpdateModalOpen(false);
      }
  };

  // --- Bulk Reboot Logic ---
  const handleBulkReboot = () => {
      if (confirm(`This will trigger a reboot for ALL ${onlineDevices} online devices. This action cannot be stopped. Are you sure?`)) {
          let count = 0;
          devices.forEach(device => {
              const status = statuses[device.device_id];
              if (status && status.status === 'online') {
                  publish(device.device_id, `${device.device_id}/reset`, "1");
                  count++;
              }
          });
          alert(`Reboot command sent to ${count} devices.`);
      }
  };

  // --- Bulk Schedule Logic ---
  const toggleDay = (day: string) => {
    setNewDays(prev => 
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const handleSaveBulkSchedule = () => {
      if (newTime && newDays.length > 0) {
          if (confirm(`This will add this schedule to ALL ${devices.length} devices (and push to ${onlineDevices} online devices). Confirm?`)) {
              
              const scheduleTemplate: Omit<Schedule, 'id'> = {
                  time: newTime,
                  days: newDays,
                  enabled: true,
                  action: newAction,
                  endTime: newAction === 'OFF' ? newEndTime : undefined
              };

              // 1. Send to all online devices immediately
              devices.forEach(device => {
                  const status = statuses[device.device_id];
                  if (status && status.status === 'online') {
                      // We generate a temp ID for MQTT valid JSON, though it won't match app ID perfectly, 
                      // it doesn't matter as device only cares about logic.
                      const newSched = { ...scheduleTemplate, id: Date.now().toString() };
                      const updatedSchedules = [...device.schedules, newSched];
                      const mqttPayload = transformSchedulesForMqtt(updatedSchedules);
                      publish(device.device_id, `${device.device_id}/schedule/set`, JSON.stringify(mqttPayload));
                  }
              });

              // 2. Update local app state
              onBulkAddSchedule(scheduleTemplate);
              
              setBulkScheduleModalOpen(false);
              // Reset form
              setNewTime('07:00');
              setNewDays([]);
              setNewAction('REBOOT');
          }
      } else {
          alert("Please select a time and at least one day.");
      }
  };

  const handleBulkClearSchedules = () => {
      if (confirm(`Are you sure you want to clear ALL schedules from ALL ${devices.length} devices? This cannot be undone.`)) {
          let count = 0;
          // 1. Send to all online devices
          devices.forEach(device => {
              const status = statuses[device.device_id];
              if (status && status.status === 'online') {
                  publish(device.device_id, `${device.device_id}/schedule/clear`, "1");
                  count++;
              }
          });

          // 2. Update local app state
          onBulkClearSchedules();
          
          setBulkScheduleModalOpen(false);
          alert(`Clear command sent to ${count} online devices. All local schedules cleared.`);
      }
  };

  
  return (
    <div className="p-4">
      <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold">Total</p>
          <p className="text-2xl font-bold">{totalDevices}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold">Online</p>
          <p className="text-2xl font-bold text-blue-500">{onlineDevices}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold">Healthy Net</p>
          <p className="text-2xl font-bold text-green-500">{healthyDevices}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold">Weak Net</p>
          <p className="text-2xl font-bold text-orange-500">{weakDevices}</p>
        </div>
      </div>

      {/* Action Bar */}
      <div className="mb-6 flex flex-col xl:flex-row gap-4 justify-between">
          { devices.length > 0 && 
            <div className="relative w-full xl:max-w-md">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                    <SearchIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                </span>
                <input
                    type="text"
                    placeholder="Search devices..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md py-2 pl-10 pr-4 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>
          }
          
          {devices.length > 0 && onlineDevices > 1 && (
            <div className="flex flex-col sm:flex-row gap-2 w-full xl:w-auto">
                <button 
                    onClick={openBulkUpdateModal}
                    className="flex items-center justify-center bg-gray-800 dark:bg-gray-700 hover:bg-gray-700 dark:hover:bg-gray-600 text-white px-4 py-2 rounded-md shadow-sm transition-colors text-sm font-semibold flex-1 sm:flex-initial whitespace-nowrap"
                >
                    <CloudIcon className="w-4 h-4 mr-2" />
                    Bulk Update
                </button>
                <button 
                    onClick={handleBulkReboot}
                    className="flex items-center justify-center bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-md shadow-sm transition-colors text-sm font-semibold flex-1 sm:flex-initial whitespace-nowrap"
                >
                    <PowerIcon className="w-4 h-4 mr-2" />
                    Bulk Reboot
                </button>
                <button 
                    onClick={() => setBulkScheduleModalOpen(true)}
                    className="flex items-center justify-center bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-md shadow-sm transition-colors text-sm font-semibold flex-1 sm:flex-initial whitespace-nowrap"
                >
                    <ClockIcon className="w-4 h-4 mr-2" />
                    Bulk Schedule
                </button>
            </div>
          )}
      </div>

      {/* Empty States */}
      {devices.length === 0 ? (
        <div className="text-center text-gray-500 dark:text-gray-400 mt-20 flex flex-col items-center">
          <h2 className="text-2xl font-semibold">No Devices Yet</h2>
          <p className="mt-2 mb-6 max-w-xs mx-auto">It looks a bit empty here. Let's add your first router resetter to get started.</p>
          <button 
            onClick={onAddDeviceClick}
            className="bg-blue-600 text-white font-semibold py-2 px-6 rounded-md hover:bg-blue-500 transition-colors flex items-center"
          >
            <PlusIcon className="mr-2 h-5 w-5" />
            Add Your First Device
          </button>
        </div>
      ) : filteredDevices.length === 0 ? (
        <div className="text-center text-gray-500 dark:text-gray-400 mt-20">
            <h2 className="text-2xl font-semibold">No Devices Found</h2>
            <p className="mt-2">Your search for "{searchTerm}" did not match any devices.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDevices.map(device => (
              <DeviceListItem 
                  key={device.device_id} 
                  device={device} 
                  onSelect={onSelectDevice} 
                  onDelete={onDeleteDevice}
                  onRename={onRenameDevice}
                  lastResetTimestamp={findLastResetTimestamp(device.device_id)}
              />
          ))}
        </div>
      )}

      {/* Bulk Firmware Modal */}
      {isBulkUpdateModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md flex flex-col max-h-[80vh]">
                  <header className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center">
                          <CloudIcon className="mr-2" /> Bulk Firmware Update
                      </h3>
                      <button onClick={() => setBulkUpdateModalOpen(false)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white">
                          <XIcon />
                      </button>
                  </header>
                  <div className="p-4 overflow-y-auto flex-1">
                      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3 rounded-md mb-4 flex items-center">
                          <CheckCircleIcon className="w-5 h-5 text-blue-600 dark:text-blue-400 mr-2" />
                          <p className="text-sm text-blue-800 dark:text-blue-200">
                              <strong>{onlineDevices}</strong> devices are Online.
                          </p>
                      </div>

                      {loadingReleases ? (
                          <div className="text-center py-8 text-gray-500">Loading versions...</div>
                      ) : releases.length === 0 ? (
                          <div className="text-center py-8 text-red-500">No releases found.</div>
                      ) : (
                          <div className="space-y-2">
                              {releases.map((release: any) => {
                                  const asset = release.assets?.find((a: any) => a.name.endsWith('.bin'));
                                  if (!asset) return null;
                                  
                                  return (
                                      <button 
                                          key={release.id}
                                          onClick={() => handleBulkUpdate(asset.browser_download_url)}
                                          className="w-full text-left p-3 border border-gray-200 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors group"
                                      >
                                          <div className="flex justify-between items-center">
                                              <span className="font-mono font-bold text-gray-900 dark:text-white">{release.tag_name}</span>
                                              <span className="text-xs bg-gray-200 dark:bg-gray-600 px-2 py-1 rounded text-gray-700 dark:text-gray-300 group-hover:bg-blue-100 dark:group-hover:bg-blue-900 group-hover:text-blue-700 dark:group-hover:text-blue-300 transition-colors">
                                                  Install All
                                              </span>
                                          </div>
                                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                              Published: {new Date(release.published_at).toLocaleDateString()}
                                          </p>
                                      </button>
                                  );
                              })}
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* Bulk Schedule Modal */}
      {isBulkScheduleModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md">
                  <header className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center">
                          <ClockIcon className="mr-2" /> Bulk Schedule Devices
                      </h3>
                      <button onClick={() => setBulkScheduleModalOpen(false)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white">
                          <XIcon />
                      </button>
                  </header>
                  
                  <div className="p-6">
                        <div className="mb-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-3 rounded-md text-sm text-yellow-800 dark:text-yellow-200">
                             This will add the following schedule to <strong>ALL {devices.length}</strong> devices. Online devices will receive it immediately.
                        </div>

                        <div className="mb-4">
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Action</label>
                            <div className="flex space-x-4">
                                <button 
                                    onClick={() => setNewAction('REBOOT')}
                                    className={`flex-1 py-2 px-3 rounded-md text-sm font-medium border ${newAction === 'REBOOT' ? 'bg-blue-100 border-blue-500 text-blue-700 dark:bg-blue-900 dark:text-blue-200' : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400'}`}
                                >
                                    Reboot
                                </button>
                                <button 
                                    onClick={() => setNewAction('OFF')}
                                    className={`flex-1 py-2 px-3 rounded-md text-sm font-medium border ${newAction === 'OFF' ? 'bg-red-100 border-red-500 text-red-700 dark:bg-red-900 dark:text-red-200' : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400'}`}
                                >
                                    Power Off
                                </button>
                            </div>
                        </div>

                        <div className="mb-4 grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">{newAction === 'OFF' ? 'Start Time' : 'Time'}</label>
                                <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)} className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-gray-900 dark:text-white"/>
                            </div>
                            {newAction === 'OFF' && (
                                <div>
                                    <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">End Time</label>
                                    <input type="time" value={newEndTime} onChange={e => setNewEndTime(e.target.value)} className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-gray-900 dark:text-white"/>
                                </div>
                            )}
                        </div>

                        <div className="mb-6">
                            <label className="block text-sm text-gray-700 dark:text-gray-300">Days</label>
                            <div className="flex flex-wrap gap-2 mt-2">
                                {weekDays.map(day => (
                                    <button key={day} onClick={() => toggleDay(day)} className={`px-3 py-1 text-sm rounded-full border ${newDays.includes(day) ? 'bg-blue-500 border-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700 border-gray-300 dark:border-gray-600 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'}`}>
                                        {day}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row justify-between gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                             <button 
                                onClick={handleBulkClearSchedules}
                                className="px-4 py-2 bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 rounded-md hover:bg-red-200 dark:hover:bg-red-800 transition-colors text-sm font-semibold flex items-center justify-center"
                            >
                                <TrashIcon className="w-4 h-4 mr-2" />
                                Clear All
                            </button>
                            <div className="flex gap-2 justify-end">
                                <button onClick={() => setBulkScheduleModalOpen(false)} className="px-4 py-2 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded-md text-gray-800 dark:text-gray-200">Cancel</button>
                                <button onClick={handleSaveBulkSchedule} className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-500 rounded-md font-semibold">Save Schedule</button>
                            </div>
                        </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default DeviceList;
