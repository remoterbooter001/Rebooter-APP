
import React from 'react';
import type { ResetHistoryEntry } from '../types';
import { XIcon, TrashIcon, SunIcon, MoonIcon } from './icons';

interface SideMenuProps {
  isOpen: boolean;
  onClose: () => void;
  history: ResetHistoryEntry[];
  onClearHistory: () => void;
  theme: 'light' | 'dark';
  onThemeChange: () => void;
}

const SideMenu: React.FC<SideMenuProps> = ({ isOpen, onClose, history, onClearHistory, theme, onThemeChange }) => {
  const handleClearClick = () => {
    if (window.confirm('Are you sure you want to clear the entire event history? This action cannot be undone.')) {
      onClearHistory();
    }
  };

  return (
    <>
      <div 
        className={`fixed inset-0 bg-black bg-opacity-50 z-20 transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      <div className={`fixed top-0 left-0 h-full w-80 bg-white dark:bg-gray-800 shadow-xl z-30 transform transition-transform ${isOpen ? 'translate-x-0' : '-translate-x-full'} text-gray-900 dark:text-white`}>
        <div className="flex flex-col h-full">
            <header className="p-4 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-xl font-bold">Event History</h2>
                <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
                    <XIcon />
                </button>
            </header>
            <div className="flex-grow overflow-y-auto p-4">
                {history.length === 0 ? (
                    <div className="text-center text-gray-500 dark:text-gray-400 mt-10">
                        <p>No device events recorded yet.</p>
                    </div>
                ) : (
                    <ul className="space-y-3">
                        {history.map(entry => (
                            <li key={entry.id} className="bg-gray-100 dark:bg-gray-700 p-3 rounded-md">
                                <p className="font-semibold">{entry.deviceName}</p>
                                <p className="text-sm text-gray-700 dark:text-gray-300">{entry.eventType || "Device was rebooted"}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{new Date(entry.timestamp).toLocaleString()}</p>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <footer className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-4">
                <div className="flex justify-between items-center">
                    <label htmlFor="theme-toggle" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
                    </label>
                    <button
                        id="theme-toggle"
                        onClick={onThemeChange}
                        className="p-2 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 focus:ring-offset-white dark:focus:ring-offset-gray-800"
                        aria-label="Toggle theme"
                    >
                        {theme === 'dark' ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
                    </button>
                </div>
                <button 
                    onClick={handleClearClick}
                    disabled={history.length === 0}
                    className="w-full flex items-center justify-center px-4 py-2 bg-red-100 text-red-700 dark:bg-red-800/50 dark:text-red-300 rounded-md hover:bg-red-200 dark:hover:bg-red-800/80 dark:hover:text-red-200 disabled:bg-gray-200 dark:disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
                >
                    <TrashIcon className="w-5 h-5 mr-2" />
                    Clear History
                </button>
            </footer>
        </div>
      </div>
    </>
  );
};

export default SideMenu;
