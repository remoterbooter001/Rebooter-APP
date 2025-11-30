
import React, { useState, useEffect } from 'react';
import { DownloadIcon, XIcon } from './icons';

const InstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [platformText, setPlatformText] = useState("Install App");

  useEffect(() => {
    // 1. Check if already installed/standalone mode
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true) {
      setIsStandalone(true);
      return;
    }

    // 2. Detect Platform
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(userAgent);
    const isDesktop = !/android|iphone|ipad|ipod/.test(userAgent);
    
    setIsIOS(isIos);
    if (isDesktop) setPlatformText("Install to Desktop");

    // 3. Desktop/Android: Listen for 'beforeinstallprompt'
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true); 
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // 4. iOS: Show immediately
    if (isIos && !isStandalone) {
        const timer = setTimeout(() => setShowPrompt(true), 1000); 
        return () => clearTimeout(timer);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
        setDeferredPrompt(null);
        setShowPrompt(false);
    }
  };

  const handleDismiss = () => {
      setShowPrompt(false);
  };

  if (isStandalone || !showPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[90] animate-in slide-in-from-bottom-5 fade-in duration-500">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)] border border-blue-100 dark:border-gray-600 p-5 max-w-md mx-auto relative flex flex-col sm:flex-row items-center gap-4 ring-1 ring-black/5">
        
        <button 
            onClick={handleDismiss} 
            className="absolute -top-2 -right-2 bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-300 rounded-full p-1 hover:bg-gray-300 dark:hover:bg-gray-600 shadow-sm"
        >
            <XIcon className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-4 w-full sm:w-auto">
             <div className="bg-blue-600 p-3 rounded-xl text-white shadow-lg shadow-blue-500/30">
                <DownloadIcon className="w-6 h-6 animate-bounce" />
             </div>
             <div>
                 <h3 className="font-bold text-gray-900 dark:text-white text-lg">Remote Rebooter</h3>
                 <p className="text-xs text-gray-500 dark:text-gray-400">
                     {isIOS ? "Add to Home Screen for instant access." : "Install this app on your device."}
                 </p>
             </div>
        </div>

        {isIOS ? (
            <div className="text-sm text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700/50 p-3 rounded-lg w-full text-center border border-gray-200 dark:border-gray-600">
                Tap <span className="font-bold text-blue-600 dark:text-blue-400">Share</span> <span className="inline-block border border-gray-400 rounded px-1 text-[10px] mx-1">⎋</span> then <span className="font-bold text-blue-600 dark:text-blue-400">Add to Home Screen</span> <span className="inline-block border border-gray-400 rounded px-1 text-[10px] mx-1">+</span>
            </div>
        ) : (
            <button 
                onClick={handleInstallClick}
                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-6 rounded-lg shadow-md transition-all active:scale-95 whitespace-nowrap animate-pulse hover:animate-none"
            >
                {platformText}
            </button>
        )}
      </div>
    </div>
  );
};

export default InstallPrompt;