import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Device, DeviceCredentials } from '../types';
import { QrCodeIcon, CheckCircleIcon } from './icons';
import jsQR from 'jsqr';
import CryptoJS from 'crypto-js';

interface AddDeviceModalProps {
  onClose: () => void;
  onAddDevice: (device: Device) => void;
}

// This key must match the one used to generate the QR codes
const APP_SECRET_KEY = "RemoteRebooterSecureKey2024";

const AddDeviceModal: React.FC<AddDeviceModalProps> = ({ onClose, onAddDevice }) => {
  const [qrContent, setQrContent] = useState('');
  const [customName, setCustomName] = useState('');
  const [error, setError] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanSuccess, setScanSuccess] = useState(false);
  const [scanStatusText, setScanStatusText] = useState('Please scan QR code');
  const [isInvalidQr, setIsInvalidQr] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const verificationState = useRef<'idle' | 'verifying' | 'cooldown'>('idle');
  const lastScanTime = useRef<number>(0);

  const onScanSuccess = useCallback((data: string) => {
    setQrContent(data);
    setIsScanning(false);
    setScanSuccess(true);
    setError('');
  }, []);

  const validateQr = (content: string): boolean => {
      try {
        const bytes = CryptoJS.AES.decrypt(content, APP_SECRET_KEY);
        const decryptedString = bytes.toString(CryptoJS.enc.Utf8);
        if (!decryptedString) return false;
        
        const json = JSON.parse(decryptedString);
        // Basic check for required fields
        return !!(json.device_id && json.broker && json.user);
      } catch (e) {
        return false;
      }
  };

  useEffect(() => {
    let stream: MediaStream | null = null;
    let animationId: number | null = null;
    
    // Reset state
    verificationState.current = 'idle';
    setScanStatusText('Please scan QR code');
    setIsInvalidQr(false);

    const tick = () => {
      if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA && canvasRef.current) {
        
        // THROTTLE: Only scan every ~50ms (20fps) to allow UI thread (animations) to update on mobile
        const now = Date.now();
        if (now - lastScanTime.current < 50) {
            animationId = requestAnimationFrame(tick);
            return;
        }
        lastScanTime.current = now;

        // Skip processing if we are busy verifying or in cooldown
        if (verificationState.current === 'idle') {
            
            const video = videoRef.current;
            const canvasElement = canvasRef.current;
            // Use 'willReadFrequently' optimization
            const canvas = canvasElement.getContext('2d', { willReadFrequently: true });
            
            if (canvas) {
                // MATCH VIDEO DIMENSIONS EXACTLY (Fastest Method)
                const width = video.videoWidth;
                const height = video.videoHeight;
                
                if (canvasElement.width !== width || canvasElement.height !== height) {
                    canvasElement.width = width;
                    canvasElement.height = height;
                }
                
                // Draw full frame
                canvas.drawImage(video, 0, 0, width, height);
                
                // Scan full frame
                const imageData = canvas.getImageData(0, 0, width, height);
                
                try {
                    const code = jsQR(imageData.data, imageData.width, imageData.height);
                    if (code && code.data) {
                        // QR FOUND!
                        const isValid = validateQr(code.data);
                        
                        if (isValid) {
                            verificationState.current = 'verifying'; // Lock loop
                            setScanStatusText("Verifying...");
                            
                            // DELAY: Provide visual feedback for 800ms so user sees "Verifying"
                            setTimeout(() => {
                                onScanSuccess(code.data);
                            }, 800);
                            return; // Exit loop (stop requesting frames)
                        } else {
                            // Invalid QR logic
                            setScanStatusText("Invalid QR Code");
                            setIsInvalidQr(true);
                            verificationState.current = 'cooldown';
                            
                            // Reset after 2 seconds
                            setTimeout(() => {
                                if (verificationState.current === 'cooldown') {
                                    setScanStatusText("Please scan QR code");
                                    setIsInvalidQr(false);
                                    verificationState.current = 'idle';
                                }
                            }, 2000);
                        }
                    }
                } catch(e) {
                    // Ignore errors during scan
                }
            }
        }
      }
      animationId = requestAnimationFrame(tick);
    };

    const startScanner = async () => {
      setError('');
      try {
        // FAST SETTINGS: No specific resolution constraints. Let browser choose optimized default.
        // Added 'advanced' focus mode if supported.
        const constraints: any = { 
            video: { 
                facingMode: 'environment',
                // This advanced setting helps with close-up macro focus for small stickers
                advanced: [{ focusMode: 'continuous' }] 
            } 
        };

        stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true'); 
          await videoRef.current.play();
          animationId = requestAnimationFrame(tick);
        }
      } catch (err) {
        // Fallback for browsers that don't support 'advanced' constraints
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.setAttribute('playsinline', 'true');
                await videoRef.current.play();
                animationId = requestAnimationFrame(tick);
            }
        } catch (e) {
            setError('Camera permission is required.');
            setIsScanning(false);
        }
      }
    };
    
    if (isScanning) {
      startScanner();
    }
    
    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isScanning, onScanSuccess]);

  const handleAdd = () => {
    setError('');
    if (!customName.trim()) {
      setError('Please enter a custom name for the device.');
      return;
    }
    if (!scanSuccess || !qrContent) {
        setError('You must scan a valid QR code first.');
        return;
    }

    try {
      // Decrypt
      const bytes = CryptoJS.AES.decrypt(qrContent, APP_SECRET_KEY);
      const decryptedString = bytes.toString(CryptoJS.enc.Utf8);
      const credentials: DeviceCredentials = JSON.parse(decryptedString);
      
      const parsedData = credentials as any;
      
      // --- LOGIC TO EXTRACT PERSISTED STATE ---
      
      // 1. Normalize lastAction values
      let initLastAction = parsedData.lastAction || parsedData.last_action;
      const la = initLastAction ? initLastAction.toString().toLowerCase() : '';

      if (['reset_manual', 'reset_schedule', 'reset_autoping', 'reset_done', 'reboot', 'boot'].includes(la)) {
          initLastAction = 'Reboot';
      } else if (['power_off', 'turn_off', 'off'].includes(la)) {
          initLastAction = 'Power Off';
      } else if (['power_on', 'turn_on', 'on'].includes(la)) {
          initLastAction = 'Power On';
      }

      // 2. Normalize isPoweredOff
      let rawIsPoweredOff = parsedData.isPoweredOff;
      if (rawIsPoweredOff === undefined) rawIsPoweredOff = parsedData.is_powered_off;

      let initIsPoweredOff = false;
      if (rawIsPoweredOff === true || rawIsPoweredOff === 'true' || rawIsPoweredOff === 1) {
          initIsPoweredOff = true;
      }
      
      // Consistency check
      if (initLastAction === 'Power Off') {
          initIsPoweredOff = true;
      } else if (initLastAction === 'Power On') {
          initIsPoweredOff = false;
      }

      // 3. Normalize Last Action Time
      let initLastActionTime = parsedData.lastActionTime || parsedData.last_action_time || parsedData.timestamp || parsedData.time || parsedData.ts;
      
      if (initLastActionTime) {
        if (typeof initLastActionTime === 'number') {
            // Check if seconds or milliseconds
            if (initLastActionTime < 100000000000) { 
                initLastActionTime = new Date(initLastActionTime * 1000).toISOString();
            } else {
                initLastActionTime = new Date(initLastActionTime).toISOString();
            }
        } else {
            try {
                const d = new Date(initLastActionTime);
                if (!isNaN(d.getTime())) {
                    initLastActionTime = d.toISOString();
                } else {
                    initLastActionTime = undefined;
                }
            } catch (e) {
                initLastActionTime = undefined;
            }
        }
      }

      const newDevice: Device = {
        ...credentials,
        custom_name: customName.trim(),
        schedules: [],
        lastAction: initLastAction,
        lastActionTime: initLastActionTime,
        isPoweredOff: initIsPoweredOff,
        lastSeen: parsedData.lastSeen || parsedData.last_seen
      };
      
      onAddDevice(newDevice);
      onClose();
    } catch (e: any) {
      setError(e.message || 'Error adding device.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      {/* Inject styles for scan animation */}
      <style>{`
        @keyframes scan {
            0% { top: 0%; opacity: 0; }
            10% { opacity: 1; }
            90% { opacity: 1; }
            100% { top: 100%; opacity: 0; }
        }
      `}</style>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
        <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">Add New Device</h2>
        <div className="space-y-6">
          <div>
            <label htmlFor="customName" className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Device Name</label>
            <input
              id="customName"
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="e.g., Living Room Router"
              className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">Device Configuration</label>
            
            {isScanning ? (
              <div className="space-y-2">
                <div className="relative w-full border border-gray-600 rounded-lg overflow-hidden bg-gray-900 aspect-square">
                    <video ref={videoRef} className="w-full h-full object-cover"></video>
                    <canvas ref={canvasRef} className="hidden"></canvas>
                    
                    {/* Visual Guide Box - Z-Index 10 */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                         <div className={`relative w-[70%] h-[70%] border-2 rounded-lg shadow-[0_0_0_999px_rgba(0,0,0,0.6)] overflow-hidden transition-colors duration-300 ${isInvalidQr ? 'border-red-500' : 'border-blue-400'}`}>
                             {/* Red Laser Line */}
                             {!isInvalidQr && (
                                 <div 
                                    className="absolute left-0 w-full h-[2px] bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" 
                                    style={{ animation: 'scan 2s linear infinite' }}
                                 ></div>
                             )}
                         </div>
                    </div>
                    
                    {/* Status Text Overlay - Z-Index 20 */}
                    <div className="absolute top-[88%] left-1/2 transform -translate-x-1/2 w-full text-center pointer-events-none z-20">
                        <span className={`text-xs px-3 py-1 rounded-full backdrop-blur-sm transition-colors duration-300 ${isInvalidQr ? 'bg-red-600/90 text-white font-bold' : 'bg-black/60 text-white animate-pulse'}`}>
                            {scanStatusText}
                        </span>
                    </div>
                </div>
                <button onClick={() => setIsScanning(false)} className="w-full px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500 rounded-md transition-colors">Cancel Scan</button>
              </div>
            ) : scanSuccess ? (
               <div className="w-full bg-green-50 dark:bg-green-900/20 border border-green-500 rounded-md p-4 flex flex-col items-center justify-center text-center space-y-3">
                    <CheckCircleIcon className="w-12 h-12 text-green-500" />
                    <div>
                        <p className="font-bold text-green-700 dark:text-green-400">Configuration Loaded</p>
                        <p className="text-sm text-green-600 dark:text-green-300">Device credentials secured.</p>
                    </div>
                    <button 
                        onClick={() => {
                            setIsScanning(true);
                            setScanSuccess(false);
                            setQrContent('');
                        }}
                        className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline"
                    >
                        Scan Different Code
                    </button>
                </div>
            ) : (
                <div className="w-full bg-gray-50 dark:bg-gray-700/50 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 flex flex-col items-center justify-center text-center space-y-4">
                    <QrCodeIcon className="w-16 h-16 text-gray-400 dark:text-gray-500" />
                    <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Scan the QR code provided with your device.</p>
                    </div>
                    <button 
                        onClick={() => { setIsScanning(true); setScanSuccess(false); }}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-full font-medium transition-colors shadow-sm"
                    >
                        Scan QR Code
                    </button>
                </div>
            )}
          </div>

          {error && <p className="text-red-600 dark:text-red-400 text-sm font-medium text-center px-2">{error}</p>}
        </div>
        
        <div className="mt-8 flex justify-end space-x-4 border-t border-gray-200 dark:border-gray-700 pt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={!scanSuccess}
            className={`px-6 py-2 rounded-md font-semibold text-white transition-colors ${
                scanSuccess 
                ? 'bg-blue-600 hover:bg-blue-500 shadow-md' 
                : 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed'
            }`}
          >
            Add Device
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddDeviceModal;