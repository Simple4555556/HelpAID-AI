import React, { useRef, useState, useEffect } from 'react';
import { Camera, X } from 'lucide-react';

interface WebcamModalProps {
  onCapture: (base64Image: string) => void;
  onClose: () => void;
}

export default function WebcamModal({ onCapture, onClose }: WebcamModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log('[CAMERA OPENED] Accessing webcam stream...');
    
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(stream => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch(err => {
        console.error('Webcam access error:', err);
        setError('Could not access webcam. Please check device permissions.');
      });

    return () => {
      stopCamera();
    };
  }, []);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg');
        console.log('[IMAGE RECEIVED] Captured photo from webcam successfully');
        onCapture(dataUrl);
        stopCamera();
        onClose();
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4">
      <div className="relative bg-gray-900 rounded-[28px] overflow-hidden max-w-md w-full shadow-2xl border border-gray-800">
        <div className="p-4 border-b border-gray-800 flex justify-between items-center text-white">
          <h3 className="font-extrabold text-sm uppercase tracking-wider">Webcam Capture</h3>
          <button 
            type="button"
            onClick={onClose} 
            className="p-1 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>
        <div className="relative aspect-video bg-black flex items-center justify-center">
          {error ? (
            <div className="text-red-500 text-sm p-4 text-center font-semibold">{error}</div>
          ) : (
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted
              className="w-full h-full object-cover scale-x-[-1]" 
            />
          )}
        </div>
        <div className="p-5 flex justify-center bg-gray-950">
          <button
            type="button"
            onClick={capturePhoto}
            disabled={!!error}
            className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-750 text-white flex items-center justify-center shadow-lg active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
            title="Take Photo"
          >
            <Camera size={28} />
          </button>
        </div>
      </div>
    </div>
  );
}
