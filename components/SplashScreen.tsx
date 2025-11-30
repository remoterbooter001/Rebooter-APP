import React, { useEffect, useState } from 'react';

interface SplashScreenProps {
  onFinish: () => void;
}

const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // 1. Wait 4.5 seconds (keep visible)
    const fadeTimer = setTimeout(() => {
      setIsVisible(false); // Trigger CSS fade out
    }, 4500);

    // 2. Wait 5.0 seconds (finish completely)
    const finishTimer = setTimeout(() => {
      onFinish();
    }, 5000);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(finishTimer);
    };
  }, [onFinish]);

  return (
    <div 
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 transition-opacity duration-700 ease-out ${isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
    >
      <div className="relative flex flex-col items-center">
        {/* Logo Container */}
        <div className="w-48 h-48 mb-6 relative flex items-center justify-center">
            {/* Pulsing effect behind logo */}
            <div className="absolute inset-0 bg-blue-500 rounded-full opacity-20 animate-ping"></div>
            
            <img 
                src="splash-logo.png" 
                alt="App Logo" 
                className="w-full h-full object-contain relative z-10 drop-shadow-2xl"
                onError={(e) => {
                    // Fallback to pwa-icon if splash-logo doesn't exist yet
                    e.currentTarget.src = 'pwa-icon.png';
                }}
            />
        </div>
        
        {/* App Name */}
        <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-2 tracking-wider animate-pulse text-center">
            Remote rebooter app
        </h1>
        
        {/* Loading Bar */}
        <div className="w-48 h-1 bg-gray-200 dark:bg-gray-700 rounded-full mt-8 overflow-hidden">
            <div className="h-full bg-blue-600 animate-[loading_4.5s_ease-in-out_forwards] w-0"></div>
        </div>
        
        <p className="text-xs text-gray-400 mt-4 font-mono">Initializing connection...</p>
      </div>

      <style>{`
        @keyframes loading {
            0% { width: 0%; }
            50% { width: 70%; }
            100% { width: 100%; }
        }
      `}</style>
    </div>
  );
};

export default SplashScreen;