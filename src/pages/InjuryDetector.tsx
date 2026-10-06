import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User } from 'firebase/auth';
import { Link } from 'react-router-dom';
import {
  Camera, Upload, ArrowLeft, RefreshCcw, ShieldAlert,
  Activity, CheckCircle2, AlertCircle, Phone, MapPin, Sparkles, AlertOctagon, AlertTriangle
} from 'lucide-react';
import { analyzeInjuryFile, analyzeInjury } from '../lib/gemini';
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '../config';
import WebcamModal from '../components/WebcamModal';
import AIRecommendationsSection from '../components/AIRecommendationsSection';

const SOCKET_URL = (import.meta as any).env.VITE_API_URL || '/';

const isNoInjuryDetected = (result: any) => {
  if (!result) return false;
  const pred = (result.prediction || result.injury || result.disease || '').toLowerCase();
  return (
    pred.includes('normal skin') ||
    pred.includes('no injury') ||
    pred.includes('no wound') ||
    pred === 'normal' ||
    pred === 'none' ||
    pred === 'healthy'
  );
};

const compressImage = (file: File): Promise<{ compressedFile: File; base64: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 1200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ compressedFile: file, base64: event.target?.result as string });
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        const mimeType = 'image/jpeg';
        const base64 = canvas.toDataURL(mimeType, 0.8);
        
        const arr = base64.split(',');
        const mime = arr[0].match(/:(.*?);/)?.[1] || mimeType;
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        const compressedFile = new File([u8arr], file.name, { type: mime });
        resolve({ compressedFile, base64 });
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

export default function InjuryDetector({ user }: { user: User | null }) {
  const [image, setImage] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [emergencyLocations, setEmergencyLocations] = useState<any[]>([]);
  const [fetchingLocations, setFetchingLocations] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [isDispatched, setIsDispatched] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [assignedHospital, setAssignedHospital] = useState<any>(null);
  const [currentCaseId, setCurrentCaseId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [showSourceSelector, setShowSourceSelector] = useState(false);
  const [showWebcam, setShowWebcam] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [recommendationsData, setRecommendationsData] = useState<any>(null);
  const [fetchingRecommendations, setFetchingRecommendations] = useState(false);

  const fetchAIRecommendations = async (pred: any, lat?: number, lng?: number) => {
    setFetchingRecommendations(true);
    try {
      const userLat = lat || 26.8467;
      const userLng = lng || 80.9462;
      const res = await fetch(`${API_BASE_URL}/api/emergency/recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: userLat,
          longitude: userLng,
          injuryType: pred.prediction || pred.injury || 'Injury',
          severity: pred.severity || 'HIGH',
          requiredSpecializations: pred.requiredSpecializations
        })
      });
      const data = await res.json();
      if (data.success) {
        setRecommendationsData(data);
      }
    } catch (err) {
      console.error('Failed to fetch AI recommendations:', err);
    } finally {
      setFetchingRecommendations(false);
    }
  };

  // Initialize socket when dispatched
  React.useEffect(() => {
    if (isDispatched && currentCaseId) {
      const newSocket = io(SOCKET_URL);
      setSocket(newSocket);
      
      newSocket.on('connect', () => {
        newSocket.emit('track_emergency', currentCaseId);
      });

      newSocket.on('case_accepted', (data) => {
        setAssignedHospital(data);
        // Play notification sound
        try {
          const audio = new Audio('/alert.mp3');
          audio.play().catch(() => {});
        } catch (e) {}
      });

      return () => {
        newSocket.close();
      };
    }
  }, [isDispatched, currentCaseId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      console.log(`[FILE SELECTED] File selected in InjuryDetector: ${selectedFile.name}`);
      console.log(`[IMAGE RECEIVED] File selected: ${selectedFile.name}, Type: ${selectedFile.type}`);
      // Validation: verify is an image
      if (!selectedFile.type.startsWith('image/')) {
        setError('Invalid file type. Please select an image.');
        setFile(null);
        setImage(null);
        return;
      }
      setFile(selectedFile);
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        console.log('[BASE64 CREATED] Image base64 created successfully in InjuryDetector');
        setImage(base64);
        console.log('[IMAGE PREVIEW] Image preview set successfully in InjuryDetector');
        setResult(null);
        setError(null);
      };
      reader.readAsDataURL(selectedFile);
    }
  };

  const triggerUpload = () => {
    console.log('[UPLOAD BUTTON CLICKED] User clicked upload button in InjuryDetector');
    
    // Bypass custom bottom sheet on iOS to prevent browser click blocking
    const isIos = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isIos) {
      console.log('[UPLOAD BUTTON CLICKED] iOS detected, opening native picker directly in InjuryDetector');
      fileInputRef.current?.click();
    } else {
      console.log('[CAMERA OPENED] Non-iOS detected, opening source selector modal in InjuryDetector');
      setShowSourceSelector(true);
    }
  };

  const handleSelectSource = (source: 'camera' | 'gallery') => {
    setShowSourceSelector(false);
    if (source === 'gallery') {
      console.log('[CAMERA OPENED] Option Choose From Gallery selected in InjuryDetector');
      fileInputRef.current?.click();
    } else {
      console.log('[CAMERA OPENED] Option Open Camera selected in InjuryDetector');
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (isMobile) {
        cameraInputRef.current?.click();
      } else {
        setShowWebcam(true);
      }
    }
  };

  const handleWebcamCapture = async (base64Image: string) => {
    setShowWebcam(false);
    console.log('[IMAGE RECEIVED] InjuryDetector webcam image captured');
    setImage(base64Image);
    console.log('[IMAGE PREVIEW] Image preview set successfully in InjuryDetector');
    const mimeMatch = base64Image.match(/data:(.*?);base64/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const blob = await (await fetch(base64Image)).blob();
    const capturedFile = new File([blob], 'webcam.jpg', { type: mimeType });
    setFile(capturedFile);
    console.log('[BASE64 CREATED] Webcam base64 captured in InjuryDetector');
    setResult(null);
    setError(null);
  };

  const handleAnalyze = async () => {
    if (!file && !image) return;
    setLoading(true);
    setError(null);
    try {
      let prediction;
      if (file) {
        console.log(`[IMAGE RECEIVED] Beginning analysis for file: ${file.name}`);
        console.log(`[IMAGE SIZE] Original size: ${(file.size / 1024).toFixed(2)} KB`);

        // Image Validation
        if (!file.type.startsWith('image/')) {
          throw new Error('Image validation failed: Selected file is not an image.');
        }

        // Image Compression
        console.log("Compressing image...");
        const compressed = await compressImage(file);
        console.log(`[IMAGE SIZE] Compressed size: ${(compressed.compressedFile.size / 1024).toFixed(2)} KB`);
        console.log("[BASE64 CREATED] Base64 representation created for compressed image.");

        console.log("[API REQUEST SENT] Sending analyzeInjuryFile request to backend API.");
        prediction = await analyzeInjuryFile(compressed.compressedFile, user?.uid || undefined);
      } else {
        console.log("[IMAGE RECEIVED] Direct base64/camera image received.");
        const approxSize = Math.round((image!.length * 3) / 4);
        console.log(`[IMAGE SIZE] Base64 image size: ${(approxSize / 1024).toFixed(2)} KB`);
        console.log("[BASE64 CREATED] Base64 string exists.");

        console.log("[API REQUEST SENT] Sending analyzeInjury request to backend API.");
        prediction = await analyzeInjury(image!, user?.uid || undefined);
      }

      console.log("[FINAL RESULT] Backend API returned analysis result:", prediction);
      setResult(prediction);

      // Fetch AI Recommended Specialists, Hospitals & Nearby lists
      if (!isNoInjuryDetected(prediction)) {
        if ('geolocation' in navigator) {
          setFetchingLocations(true);
          navigator.geolocation.getCurrentPosition(async (pos) => {
            fetchAIRecommendations(prediction, pos.coords.latitude, pos.coords.longitude);
            try {
              const res = await fetch(`${API_BASE_URL}/api/agent/location-query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  query: 'trauma center and ambulance',
                  latitude: pos.coords.latitude,
                  longitude: pos.coords.longitude
                })
              });
              const data = await res.json();
              if (data.results) setEmergencyLocations(data.results.slice(0, 2));
            } catch (err) {
              console.error('Failed to fetch emergency locations', err);
            } finally {
              setFetchingLocations(false);
            }
          }, () => {
            fetchAIRecommendations(prediction);
            setFetchingLocations(false);
          });
        } else {
          fetchAIRecommendations(prediction);
        }
      }

      if (user) {
        try {
          await fetch(`${API_BASE_URL}/api/injury-history`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: user.uid,
              imageUrl: prediction.imageUrl || image || "",
              injuryType: prediction.prediction || "Unknown Injury",
              severity: prediction.severity || "MEDIUM",
              result: prediction
            })
          });
        } catch (postErr) {
          console.error('Failed to post injury history:', postErr);
        }
      }

      // Automatically trigger consent for High/Critical
      if (prediction.severity === 'HIGH' || prediction.severity === 'CRITICAL') {
        setShowConsent(true);
      }
    } catch (err: any) {
      console.error('Injury analysis error:', err);
      setError(err.message || 'Failed to analyze image. Please ensure the backend and Gemini API are running.');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setImage(null);
    setFile(null);
    setResult(null);
    setError(null);
    setEmergencyLocations([]);
    setShowConsent(false);
    setIsDispatched(false);
    setAssignedHospital(null);
    setCurrentCaseId(null);
  };

  const triggerReupload = () => {
    setImage(null);
    setFile(null);
    setResult(null);
    setError(null);
    setShowSourceSelector(false);
    setShowWebcam(false);
    setTimeout(() => {
      setShowSourceSelector(true);
    }, 100);
  };

  const handleDispatch = async () => {
    setDispatching(true);
    try {
      // Get location
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const payload = {
          userId: user?.uid || 'anonymous',
          patientName: user?.displayName || 'Unknown Patient',
          patientContact: user?.phoneNumber || 'N/A',
          injuryType: result.prediction,
          severity: result.severity,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          reportData: result
        };

        const res = await fetch(`${API_BASE_URL}/api/emergency/dispatch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
          setCurrentCaseId(data.caseId);
          setIsDispatched(true);
          setShowConsent(false);
        } else {
          setError('Failed to dispatch. ' + data.error);
        }
        setDispatching(false);
      }, () => {
        setError('Location access required for emergency dispatch.');
        setDispatching(false);
      });
    } catch (err) {
      console.error(err);
      setError('Dispatch failed.');
      setDispatching(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full pb-8">
      <div className="space-y-6">
        
        {/* Header */}
        <div className="flex justify-between items-center px-1">
          <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
            <Activity className="text-red-600" size={24} /> Injury Scanner
          </h1>
          {(image || result) && (
            <button onClick={reset} className="flex items-center gap-1.5 text-xs font-extrabold text-red-600 hover:underline">
              <RefreshCcw size={12} /> Start Over
            </button>
          )}
        </div>

        {/* main container */}
        <div className="bg-white dark:bg-gray-900/50 rounded-[32px] p-5 sm:p-6 shadow-sm border border-gray-100 dark:border-gray-800/50 space-y-6">
          <AnimatePresence mode="wait">
            {!image && (
              /* UPLOAD BOX */
              <motion.div
                key="upload"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={triggerUpload}
                className="border-2 border-dashed border-gray-200 dark:border-gray-800 hover:border-red-400 dark:hover:border-red-500 rounded-[24px] p-10 flex flex-col items-center justify-center cursor-pointer group transition-colors min-h-[260px]"
              >
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                />
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  ref={cameraInputRef}
                  onChange={handleFileChange}
                />
                <div className="w-16 h-16 rounded-full bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                  <Camera size={30} />
                </div>
                <h3 className="font-extrabold text-gray-900 dark:text-white text-base mb-1">Upload Injury Photo</h3>
                <p className="text-gray-400 dark:text-gray-500 text-xs text-center max-w-[240px] leading-relaxed">
                  Support formats: JPEG, PNG. Take a clear, well-lit photo of the wound or trauma area.
                </p>
                <button className="mt-5 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 font-extrabold text-xs px-4 py-2.5 rounded-full group-hover:bg-red-100 dark:group-hover:bg-red-900/40 transition-colors">
                  Select Image
                </button>
              </motion.div>
            )}

            {image && !result && (
              /* IMAGE PREVIEW */
              <motion.div
                key="preview"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <div className="relative rounded-[24px] overflow-hidden border border-gray-100 dark:border-gray-800/50 max-h-[300px]">
                  <img src={image} alt="Upload preview" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/10" />
                </div>
                
                {error && (
                  <div className="p-4 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 rounded-[20px] text-xs font-semibold flex items-center gap-2 border border-red-100 dark:border-red-900/30">
                    <AlertCircle size={16} /> {error}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button onClick={reset} className="flex-1 py-4 rounded-[20px] bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 font-bold text-sm transition-all active:scale-95">
                    Discard
                  </button>
                  <button
                    onClick={handleAnalyze}
                    disabled={loading}
                    className="flex-[2] py-4 rounded-[20px] bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold text-sm shadow-lg shadow-red-500/20 flex items-center justify-center gap-2 transition-all active:scale-95"
                  >
                    {loading ? (
                      <>
                        <Activity className="animate-spin" size={16} />
                        <span>Analyzing Image...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} />
                        <span>Diagnose Injury</span>
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            )}

            {result && result.confidence < 60 && (
              /* LOW CONFIDENCE WARNING */
              <motion.div
                key="low-confidence"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6"
              >
                {/* Uploaded image preview */}
                <div className="relative rounded-[24px] overflow-hidden max-h-[220px]">
                  <img src={image!} alt="Analysed Preview" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <span className="text-white text-xs font-bold tracking-wider bg-black/60 px-3 py-1.5 rounded-full flex items-center gap-1.5">
                      <AlertOctagon size={14} className="text-red-500" /> Low Confidence ({result.confidence}%)
                    </span>
                  </div>
                </div>

                {/* Error warning box */}
                <div className="p-6 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 rounded-[24px] border border-red-100 dark:border-red-900/30 text-center space-y-3">
                  <div className="w-12 h-12 bg-red-100 dark:bg-red-900/50 rounded-full flex items-center justify-center mx-auto text-red-600 dark:text-red-400">
                    <ShieldAlert size={28} />
                  </div>
                  <h4 className="font-extrabold text-lg">Analysis Warning</h4>
                  <p className="text-sm font-semibold leading-relaxed">
                    Unable to confidently identify the condition. Please consult a medical professional.
                  </p>
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    onClick={reset}
                    className="flex-1 py-4 rounded-[20px] bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 font-bold hover:bg-gray-200 dark:hover:bg-gray-700 transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <RefreshCcw size={16} /> Re-scan
                  </button>
                  <Link
                    to="/nearby"
                    className="flex-[2] py-4 rounded-[20px] bg-blue-600 hover:bg-blue-700 text-white font-bold text-center flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 transition-all active:scale-95 uppercase tracking-wide"
                  >
                    <MapPin size={16} /> Find Nearby Hospitals
                  </Link>
                </div>
              </motion.div>
            )}

            {result && result.confidence >= 60 && isNoInjuryDetected(result) && (
              /* NO INJURY DETECTED DISPLAY */
              <motion.div
                key="no-injury-detected"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6"
              >
                {/* Uploaded image preview */}
                <div className="relative rounded-[24px] overflow-hidden max-h-[220px]">
                  <img src={image!} alt="Analysed Preview" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <span className="text-white text-xs font-bold tracking-wider bg-black/60 px-3 py-1.5 rounded-full flex items-center gap-1.5">
                      <CheckCircle2 size={14} className="text-green-500" /> Normal Skin Detected
                    </span>
                  </div>
                </div>

                {/* Info box */}
                <div className="p-6 bg-green-50/50 dark:bg-green-950/10 text-green-700 dark:text-green-400 rounded-[24px] border border-green-100/30 dark:border-green-900/30 text-center space-y-3">
                  <div className="w-12 h-12 bg-green-100 dark:bg-green-900/50 rounded-full flex items-center justify-center mx-auto text-green-600 dark:text-green-400">
                    <CheckCircle2 size={28} />
                  </div>
                  <h4 className="font-extrabold text-lg">No Injury Detected</h4>
                  <p className="text-sm font-semibold leading-relaxed">
                    The scanner did not detect any visible signs of injury or wound in this image. The analyzed area appears to be normal skin.
                  </p>
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    onClick={triggerReupload}
                    className="flex-1 py-4 rounded-[20px] bg-red-600 hover:bg-red-750 text-white font-bold transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-red-500/20"
                  >
                    <Upload size={16} /> Re-upload Image
                  </button>
                  <Link
                    to="/nearby"
                    className="flex-1 py-4 rounded-[20px] bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 font-bold hover:bg-gray-200 dark:hover:bg-gray-700 transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <MapPin size={16} /> Nearby ERs
                  </Link>
                </div>
              </motion.div>
            )}

            {result && result.confidence >= 60 && !isNoInjuryDetected(result) && (
              /* DIAGNOSIS RESULTS */
              <motion.div
                key="result"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6"
              >
                {/* Image & prediction badge */}
                <div className="relative rounded-[24px] overflow-hidden max-h-[180px]">
                  <img src={image!} alt="Analysed" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                  <div className="absolute bottom-4 left-4 text-white">
                    <span className="text-[10px] font-bold tracking-widest uppercase bg-red-600 px-2 py-0.5 rounded-md mb-1.5 inline-block">
                      TensorFlow + Gemini AI
                    </span>
                    <h3 className="text-xl font-black capitalize">{result.prediction} Detection</h3>
                  </div>
                </div>

                {/* Score & Severity Cards */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 dark:bg-gray-800/40 p-4 rounded-[20px] border border-gray-100 dark:border-gray-800/50 text-center">
                    <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Confidence Score</span>
                    <p className="text-2xl font-black text-gray-900 dark:text-white mt-1">{result.confidence}%</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800/40 p-4 rounded-[20px] border border-gray-100 dark:border-gray-800/50 text-center">
                    <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Severity Level</span>
                    <p className="text-2xl font-black mt-1">
                      <span className={`px-3 py-0.5 rounded-lg text-sm font-black uppercase ${
                        result.severity === 'CRITICAL' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
                        result.severity === 'HIGH' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' :
                        result.severity === 'MEDIUM' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' :
                        'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                      }`}>{result.severity}</span>
                    </p>
                  </div>
                </div>

                {/* Explanation */}
                <div className="bg-red-50/50 dark:bg-red-950/10 p-5 rounded-[24px] border border-red-100/50 dark:border-red-900/30">
                  <h4 className="text-xs font-black text-red-700 dark:text-red-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <AlertOctagon size={14} className="text-red-600 dark:text-red-400" /> Medical Assessment
                  </h4>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 leading-relaxed">
                    {result.explanation}
                  </p>
                </div>

                {/* First Aid Instructions */}
                <div className="space-y-3">
                  <h4 className="font-extrabold text-gray-900 dark:text-white text-base">Immediate First Aid Actions</h4>
                  <div className="space-y-3">
                    {(result.steps || result.firstAid)?.map((step: string, i: number) => (
                      <div key={i} className="flex gap-4 items-start p-4 bg-gray-50 dark:bg-gray-800/30 rounded-[20px] border border-gray-100 dark:border-gray-800/40">
                        <div className="shrink-0 w-7 h-7 rounded-full bg-red-600 text-white flex items-center justify-center text-xs font-black">
                          {i + 1}
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300 font-semibold leading-relaxed mt-0.5">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Emergency Recommendations / Warnings */}
                {(result.emergencyWarnings && result.emergencyWarnings.length > 0) && (
                  <div className="space-y-3">
                    <h4 className="font-extrabold text-gray-900 dark:text-white text-base">Emergency Recommendations & Warnings</h4>
                    <div className="space-y-2">
                      {result.emergencyWarnings.map((warning: string, i: number) => (
                        <div key={i} className="flex gap-3 items-start p-4 bg-orange-50 dark:bg-orange-950/10 rounded-[20px] border border-orange-100 dark:border-orange-900/30 text-orange-800 dark:text-orange-300">
                          <AlertTriangle className="shrink-0 mt-0.5" size={16} />
                          <p className="text-sm font-semibold leading-relaxed">{warning}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI RECOMMENDED SPECIALISTS & HOSPITALS + NEARBY LISTS */}
                {fetchingRecommendations && (
                  <div className="p-5 bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 rounded-[20px] text-xs font-bold flex items-center justify-center gap-2 border border-blue-100 dark:border-blue-900/30">
                    <Activity size={16} className="animate-spin" />
                    <span>Analyzing AI Recommended Specialists & Hospitals...</span>
                  </div>
                )}

                {recommendationsData && (
                  <AIRecommendationsSection
                    aiDiagnosis={{
                      injuryType: result.prediction,
                      severity: result.severity,
                      requiredSpecializations: result.requiredSpecializations || recommendationsData.aiDiagnosis?.requiredSpecializations
                    }}
                    recommendedSpecialists={recommendationsData.recommendedSpecialists || []}
                    recommendedHospitals={recommendationsData.recommendedHospitals || []}
                    nearbyDoctors={recommendationsData.nearbyDoctors || []}
                    nearbyHospitals={recommendationsData.nearbyHospitals || []}
                    onTriggerParallelSOS={() => setShowConsent(true)}
                    isDispatching={dispatching}
                  />
                )}

                {!recommendationsData && !fetchingRecommendations && (
                  <div className="space-y-3">
                    <div className="p-4 bg-gray-50 dark:bg-gray-800/30 rounded-[20px] border border-gray-100 dark:border-gray-800/40 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                        <MapPin size={20} />
                      </div>
                      <div>
                        <h5 className="font-extrabold text-gray-900 dark:text-white text-sm">Recommended Clinic/Hospital</h5>
                        <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">{result.hospitalRecommendation}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button onClick={() => setShowConsent(true)} className="flex-[2] py-4 rounded-[20px] bg-red-600 hover:bg-red-700 text-white font-bold text-center flex items-center justify-center gap-2 shadow-lg shadow-red-500/20 transition-all active:scale-95 uppercase tracking-wide animate-pulse">
                    <ShieldAlert size={16} /> Auto-Dispatch Emergency
                  </button>
                  <a href="tel:108" className="flex-1 py-4 rounded-[20px] bg-orange-600 hover:bg-orange-700 text-white font-bold text-center flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 uppercase tracking-wide">
                    <Phone size={16} /> Call 108
                  </a>
                </div>
              </motion.div>
            )}

            {/* CONSENT MODAL OVERLAY */}
            {showConsent && !isDispatched && (
              <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-[24px] max-w-md w-full p-6 shadow-2xl border border-red-200">
                  <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <AlertTriangle size={32} />
                  </div>
                  <h3 className="text-xl font-black text-center text-gray-900 mb-2">Critical Emergency Detected</h3>
                  <p className="text-center text-gray-600 text-sm mb-6">
                    We detected a {result?.severity} severity condition ({result?.prediction}). Do you consent to automatically sharing your location, injury report, and medical details with the nearest hospitals for immediate dispatch?
                  </p>
                  <div className="space-y-3">
                    <button 
                      onClick={handleDispatch}
                      disabled={dispatching}
                      className="w-full bg-red-600 hover:bg-red-700 text-white font-black py-4 rounded-[16px] flex items-center justify-center gap-2"
                    >
                      {dispatching ? <Activity className="animate-spin" /> : <ShieldAlert />}
                      {dispatching ? 'Dispatching Alert...' : 'Yes, Dispatch Immediate Help'}
                    </button>
                    <button 
                      onClick={() => setShowConsent(false)}
                      className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 rounded-[16px]"
                    >
                      No, I will handle it manually
                    </button>
                  </div>
                </motion.div>
              </div>
            )}

            {/* LIVE EMERGENCY TRACKER */}
            {isDispatched && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="p-6 bg-slate-900 text-white rounded-[24px] mt-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/20 blur-3xl rounded-full mix-blend-screen"></div>
                
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-3 h-3 bg-red-500 rounded-full animate-ping"></div>
                  <h3 className="font-black tracking-widest text-sm uppercase">Live Dispatch Tracking</h3>
                </div>

                {!assignedHospital ? (
                  <div className="text-center py-6 space-y-4">
                    <Activity size={40} className="mx-auto text-blue-400 animate-pulse" />
                    <p className="text-lg font-bold">Alert broadcasted to nearby hospitals...</p>
                    <p className="text-sm text-slate-400">Waiting for a hospital to accept the emergency case. Please stay calm.</p>
                  </div>
                ) : (
                  <div className="bg-slate-800 border border-slate-700 p-5 rounded-[16px]">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <span className="bg-green-500/20 text-green-400 text-xs font-black uppercase px-2 py-1 rounded">Case Accepted</span>
                        <h4 className="text-xl font-bold mt-2 text-white">{assignedHospital.hospitalName}</h4>
                      </div>
                      <CheckCircle2 size={32} className="text-green-500" />
                    </div>
                    
                    <div className="space-y-3 mb-6">
                      <p className="flex items-center gap-2 text-sm text-slate-300">
                        <Phone size={14} className="text-slate-400" /> Contact: {assignedHospital.hospitalContact}
                      </p>
                      <p className="flex items-center gap-2 text-sm text-slate-300">
                        <Activity size={14} className="text-slate-400" /> Medical team is preparing for your arrival.
                      </p>
                      <p className="flex items-center gap-2 font-bold text-yellow-400">
                        ETA to Hospital: ~{assignedHospital.etaMinutes} mins
                      </p>
                    </div>

                    <Link to="/location-agent" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">
                      <MapPin size={16} /> Navigate to Hospital Now
                    </Link>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── CAMERA / GALLERY SOURCE SELECTOR ── */}
      {showSourceSelector && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-xs p-4 sm:items-center">
          <div className="bg-white dark:bg-gray-900 w-full max-w-sm rounded-[28px] p-6 shadow-2xl space-y-4 border border-gray-100 dark:border-gray-800">
            <h3 className="font-extrabold text-gray-900 dark:text-white text-base text-center">Select Photo Source</h3>
            <div className="flex flex-col gap-3">
              <button type="button" onClick={() => handleSelectSource('camera')} className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer shadow-md shadow-blue-500/10">
                📷 Open Camera
              </button>
              <button type="button" onClick={() => handleSelectSource('gallery')} className="w-full py-3.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 font-extrabold text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer border border-gray-200/20">
                🖼 Choose From Gallery
              </button>
              <button type="button" onClick={() => setShowSourceSelector(false)} className="w-full py-3 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-xs font-bold uppercase tracking-wider mt-1 transition-colors cursor-pointer">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── WEBCAM CAPTURE MODAL ── */}
      {showWebcam && (
        <WebcamModal onCapture={handleWebcamCapture} onClose={() => setShowWebcam(false)} />
      )}
    </motion.div>
  );
}
