
import React, { useState } from 'react';
import type { Schedule } from '../types';
import { ClockIcon, PlusIcon, TrashIcon, PowerIcon } from './icons';

interface ScheduleManagerProps {
  schedules: Schedule[];
  onSchedulesChange: (newSchedules: Schedule[]) => void;
  onClearAll: () => void;
}

const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const ScheduleManager: React.FC<ScheduleManagerProps> = ({ schedules, onSchedulesChange, onClearAll }) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTime, setNewTime] = useState('07:00');
  const [newEndTime, setNewEndTime] = useState('19:00');
  const [newAction, setNewAction] = useState<'REBOOT' | 'OFF'>('REBOOT');
  const [newDays, setNewDays] = useState<string[]>([]);

  const handleAddSchedule = () => {
    if (newTime && newDays.length > 0) {
      const newSchedule: Schedule = {
        id: new Date().toISOString(),
        time: newTime,
        days: newDays,
        enabled: true,
        action: newAction,
        endTime: newAction === 'OFF' ? newEndTime : undefined
      };
      onSchedulesChange([...schedules, newSchedule]);
      
      // Reset form defaults
      setNewTime('07:00');
      setNewEndTime('19:00');
      setNewAction('REBOOT');
      setNewDays([]);
      setShowAddForm(false);
    }
  };
  
  const toggleDay = (day: string) => {
    setNewDays(prev => 
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  }

  const handleDeleteSchedule = (id: string) => {
    onSchedulesChange(schedules.filter(s => s.id !== id));
  };
  
  const handleToggleSchedule = (id: string) => {
    onSchedulesChange(schedules.map(s => s.id === id ? {...s, enabled: !s.enabled} : s));
  };
  
  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to clear ALL schedules? This will also remove them from the device.')) {
      onClearAll();
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 mt-4">
      <h3 className="text-lg font-bold flex items-center"><ClockIcon className="mr-2" /> Schedules</h3>
      <div className="mt-4 space-y-3">
        {schedules.map(schedule => {
            const action = schedule.action || 'REBOOT';
            return (
              <div key={schedule.id} className={`p-3 rounded-md flex items-center justify-between transition-colors ${schedule.enabled ? 'bg-gray-100 dark:bg-gray-700' : 'bg-gray-200/50 dark:bg-gray-900/50'}`}>
                <div>
                  <div className="flex items-center space-x-2">
                      <p className={`text-xl font-mono ${!schedule.enabled && 'line-through text-gray-400 dark:text-gray-500'}`}>
                        {schedule.time}
                        {action === 'OFF' && schedule.endTime && <span className="text-sm text-gray-500 ml-1">➔ {schedule.endTime}</span>}
                      </p>
                      {action === 'OFF' ? (
                          <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200 font-bold">OFF</span>
                      ) : (
                          <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200 font-bold">REBOOT</span>
                      )}
                  </div>
                  <p className={`text-xs text-gray-500 dark:text-gray-400 ${!schedule.enabled && 'line-through'}`}>{schedule.days.join(', ')}</p>
                </div>
                <div className="flex items-center space-x-2">
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={schedule.enabled} onChange={() => handleToggleSchedule(schedule.id)} className="sr-only peer" />
                        <div className="w-11 h-6 bg-gray-200 dark:bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                    <button onClick={() => handleDeleteSchedule(schedule.id)} className="p-2 text-red-500 hover:text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-900/50 rounded-full">
                        <TrashIcon className="w-5 h-5" />
                    </button>
                </div>
              </div>
            );
        })}
        {schedules.length === 0 && !showAddForm && (
            <p className="text-center text-gray-500 dark:text-gray-400 py-4">No schedules added yet.</p>
        )}
      </div>
      {showAddForm && (
        <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
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
                    <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)} className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2"/>
                </div>
                {newAction === 'OFF' && (
                    <div>
                        <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">End Time</label>
                        <input type="time" value={newEndTime} onChange={e => setNewEndTime(e.target.value)} className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2"/>
                    </div>
                )}
            </div>

            <div className="mb-4">
                <label className="block text-sm text-gray-700 dark:text-gray-300">Days</label>
                <div className="flex flex-wrap gap-2 mt-2">
                    {weekDays.map(day => (
                        <button key={day} onClick={() => toggleDay(day)} className={`px-3 py-1 text-sm rounded-full border ${newDays.includes(day) ? 'bg-blue-500 border-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700 border-gray-300 dark:border-gray-600 hover:bg-gray-300 dark:hover:bg-gray-600'}`}>
                            {day}
                        </button>
                    ))}
                </div>
            </div>
            <div className="flex justify-end gap-2">
                <button onClick={() => setShowAddForm(false)} className="px-4 py-2 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded-md">Cancel</button>
                <button onClick={handleAddSchedule} className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-500 rounded-md">Save</button>
            </div>
        </div>
      )}
      <div className="mt-4 space-y-2">
        <button onClick={() => setShowAddForm(!showAddForm)} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded-md flex items-center justify-center transition-colors">
          <PlusIcon className="mr-2 h-5 w-5" />
          Add Schedule
        </button>
        {schedules.length > 0 && (
            <button
                onClick={handleClearAll}
                className="w-full flex items-center justify-center px-4 py-2 bg-red-100 text-red-700 dark:bg-red-800/50 dark:text-red-300 rounded-md hover:bg-red-200 dark:hover:bg-red-800/80 dark:hover:text-red-200 transition-colors"
            >
                <TrashIcon className="w-5 h-5 mr-2" />
                Clear All Schedules
            </button>
        )}
      </div>
    </div>
  );
};

export default ScheduleManager;
