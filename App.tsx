
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import useLocalStorage from './hooks/useLocalStorage';
import type { Device, Schedule, ResetHistoryEntry } from './types';
import Header from './components/Header';
import DeviceList from './components/DeviceList';
import DevicePanel from './components/DevicePanel';
import AddDeviceModal from './components/AddDeviceModal';
import SideMenu from './components/SideMenu';
import InstallPrompt from './components/InstallPrompt';
import SplashScreen from './components/SplashScreen';
import { PlusIcon } from './components/icons';
import { useMqttManager, type DeviceMqttState } from './hooks/useMqttManager';
import MqttContext from './contexts/MqttContext';

const App: React.FC = () => {
  const [devices, setDevices] = useLocalStorage<Device[]>('devices', []);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [isAddModalOpen, setAddModalOpen] = useState(false);
  const [isMenuOpen, setMenuOpen] = useState(false);
  const [resetHistory, setResetHistory] = useLocalStorage<ResetHistoryEntry[]>('resetHistory', []);
  const [theme, setTheme] = useLocalStorage<'light' | 'dark'>('theme', 'dark');
  
  // Splash Screen State
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  const handleThemeChange = () => {
    setTheme(prevTheme => (prevTheme === 'dark' ? 'light' : 'dark'));
  };

  const handleClearHistory = () => {
    setResetHistory([]);
  };

  const handleDeviceEvent = useCallback((deviceId: string, eventType: string, timestamp: Date) => {
    const isoTimestamp = timestamp.toISOString();
    
    // HISTORY DEDUPLICATION:
    setResetHistory(prevHistory => {
        const exists = prevHistory.some(entry => 
            entry.deviceId === deviceId && 
            entry.timestamp === isoTimestamp &&
            entry.eventType === eventType
        );
        
        if (exists) {
            return prevHistory;
        }

        const device = devices.find(d => d.device_id === deviceId);
        const deviceName = device ? device.custom_name : deviceId;

        const newEntry: ResetHistoryEntry = {
            id: isoTimestamp + deviceId, // Unique ID combination
            deviceId: deviceId,
            deviceName: deviceName,
            timestamp: isoTimestamp,
            eventType: eventType,
        };
        return [newEntry, ...prevHistory].slice(0, 100);
    });
  }, [devices, setResetHistory]);

  const handleDeviceSeen = useCallback((deviceId: string, timestamp: Date) => {
    setDevices(prevDevices =>
      prevDevices.map(d =>
        d.device_id === deviceId ? { ...d, lastSeen: timestamp.toISOString() } : d
      )
    );
  }, [setDevices]);

  const handleDeviceAction = useCallback((deviceId: string, action: string, timestamp: Date) => {
    setDevices(prevDevices =>
      prevDevices.map(d =>
        d.device_id === deviceId ? { ...d, lastAction: action, lastActionTime: timestamp.toISOString() } : d
      )
    );
  }, [setDevices]);

  const handleSchedulesCleared = useCallback((deviceId: string) => {
    setDevices(prevDevices =>
      prevDevices.map(d =>
        d.device_id === deviceId ? { ...d, schedules: [] } : d
      )
    );
  }, [setDevices]);
  
  const { statuses, publish } = useMqttManager({ 
    devices: devices, 
    onDeviceEvent: handleDeviceEvent,
    onSchedulesCleared: handleSchedulesCleared,
    onDeviceSeen: handleDeviceSeen,
    onDeviceAction: handleDeviceAction,
  });

  const selectedDevice = useMemo(() => {
    return devices.find(d => d.device_id === selectedDeviceId) || null;
  }, [devices, selectedDeviceId]);

  const addDevice = (device: Device) => {
    if (devices.some(d => d.device_id === device.device_id)) {
      alert('Error: A device with this ID already exists.');
      return;
    }
    setDevices(prevDevices => [...prevDevices, device]);
  };
  
  const deleteDevice = (deviceId: string) => {
    setDevices(prevDevices => prevDevices.filter(d => d.device_id !== deviceId));
    if (selectedDeviceId === deviceId) {
        setSelectedDeviceId(null);
    }
  };
  
  const handleRenameDevice = (deviceId: string) => {
    const device = devices.find(d => d.device_id === deviceId);
    if (!device) return;

    const newName = prompt("Enter new name for the device:", device.custom_name);
    if (newName && newName.trim() !== "") {
      setDevices(prev => prev.map(d => d.device_id === deviceId ? {...d, custom_name: newName.trim()} : d));
    }
  };

  const updateDeviceSchedules = (deviceId: string, newSchedules: Schedule[]) => {
    setDevices(prevDevices =>
      prevDevices.map(d =>
        d.device_id === deviceId ? { ...d, schedules: newSchedules } : d
      )
    );
  };

  const updateDeviceConfig = (deviceId: string, config: Partial<Device>) => {
    setDevices(prevDevices =>
      prevDevices.map(d =>
        d.device_id === deviceId ? { ...d, ...config } : d
      )
    );
  };
  
  // Adds a schedule to ALL devices
  const handleBulkAddSchedule = (scheduleTemplate: Omit<Schedule, 'id'>) => {
    setDevices(prevDevices =>
      prevDevices.map(d => ({
        ...d,
        schedules: [...d.schedules, { 
            ...scheduleTemplate, 
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9) 
        }]
      }))
    );
  };

  // Clears schedules from ALL devices
  const handleBulkClearSchedules = () => {
    setDevices(prevDevices =>
      prevDevices.map(d => ({
        ...d,
        schedules: []
      }))
    );
  };

  const totalDevices = devices.length;
  const onlineDevices = Object.values(statuses).filter((s: DeviceMqttState) => s.status === 'online').length;

  return (
    <MqttContext.Provider value={{ statuses, publish }}>
      
      {/* Splash Screen - conditionally rendered */}
      {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}
      
      <SideMenu 
        isOpen={isMenuOpen} 
        onClose={() => setMenuOpen(false)} 
        history={resetHistory}
        onClearHistory={handleClearHistory}
        theme={theme}
        onThemeChange={handleThemeChange}
      />
      <div className="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-white flex flex-col transition-colors duration-200">
        <Header 
          title={selectedDevice ? selectedDevice.custom_name : "Remote Rebooter Dashboard"} 
          onBack={selectedDevice ? () => setSelectedDeviceId(null) : undefined}
          onMenuClick={!selectedDevice ? () => setMenuOpen(true) : undefined}
        />
        <main className="flex-grow">
          {selectedDevice ? (
            <DevicePanel 
              device={selectedDevice} 
              onUpdateSchedules={updateDeviceSchedules}
              onUpdateConfig={updateDeviceConfig}
            />
          ) : (
            <DeviceList 
              devices={devices} 
              onSelectDevice={setSelectedDeviceId} 
              onDeleteDevice={deleteDevice} 
              onRenameDevice={handleRenameDevice}
              onBulkAddSchedule={handleBulkAddSchedule}
              onBulkClearSchedules={handleBulkClearSchedules}
              totalDevices={totalDevices}
              onlineDevices={onlineDevices}
              onAddDeviceClick={() => setAddModalOpen(true)}
              history={resetHistory}
              statuses={statuses}
            />
          )}
        </main>

        {!selectedDevice && (
          <button
            onClick={() => setAddModalOpen(true)}
            className="fixed bottom-6 right-6 bg-blue-600 text-white p-4 rounded-full shadow-lg hover:bg-blue-500 transition-transform hover:scale-110"
            aria-label="Add new device"
          >
            <PlusIcon />
          </button>
        )}

        {isAddModalOpen && (
          <AddDeviceModal 
            onClose={() => setAddModalOpen(false)} 
            onAddDevice={addDevice} 
          />
        )}
        
        {/* PWA Install Prompt - Always last to sit on top */}
        <InstallPrompt />
      </div>
    </MqttContext.Provider>
  );
};

export default App;
