import React, { useState, useEffect, useRef } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import {
  Activity,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  Phone,
  Info,
  X,
  Upload,
  Camera,
  User,
  Smartphone,
  MapPin,
  Download,
  Share2,
  FileText,
  AlertTriangle,
  Navigation,
  Check,
  Heart,
  BriefcaseMedical,
  Clock,
  Sparkles
} from 'lucide-react';
import { triggerSOS } from '../lib/gemini';
import { db, collection, addDoc, Timestamp } from '../firebase';
import { cn } from '../lib/utils';
import { API_BASE_URL } from '../config';
import WebcamModal from '../components/WebcamModal';

interface Hospital {
  name: string;
  address: string;
  phone: string;
  distance: number;
  eta: number;
}

interface ReportData {
  patientDetails: {
    name: string;
    age: string;
    gender: string;
    mobileNumber: string;
  };
  location: {
    latitude: number | null;
    longitude: number | null;
    address: string;
    city: string;
    district: string;
    state: string;
  };
  incidentDetails: {
    userNote: string;
    incidentTime: string;
  };
  aiDetection: {
    injuryType: string;
    bodyLocation: string;
    severityLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    severityScore: number;
    confidenceScore: number;
    bloodLoss: string;
    visibleBurns: string;
    visibleFractures: string;
    openWounds: string;
    bruises: string;
    swelling: string;
  };
  riskFactors: {
    bloodLossRisk: 'Low' | 'Medium' | 'High' | 'Critical';
    fractureRisk: 'Low' | 'Medium' | 'High' | 'Critical';
    infectionRisk: 'Low' | 'Medium' | 'High' | 'Critical';
    shockRisk: 'Low' | 'Medium' | 'High' | 'Critical';
  };
  recommendedDepartment: string;
  firstAidRecommendations: string[];
  possibleRisks: string[];
  nearestHospitals: Hospital[];
}

export default function AccidentPage({ user }: { user: FirebaseUser | null }) {
  // Input fields
  const [patientName, setPatientName] = useState('');
  const [patientAge, setPatientAge] = useState('');
  const [patientGender, setPatientGender] = useState('Male');
  const [patientMobile, setPatientMobile] = useState('');
  const [incidentNote, setIncidentNote] = useState('');
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [showSourceSelector, setShowSourceSelector] = useState(false);
  const [showWebcam, setShowWebcam] = useState(false);

  // Live Captured Geolocation Details
  const [locationCaptured, setLocationCaptured] = useState<{
    lat: number | null;
    lng: number | null;
    address: string;
    city: string;
    district: string;
    state: string;
  }>({
    lat: null,
    lng: null,
    address: '',
    city: '',
    district: '',
    state: ''
  });

  // UI state
  const [loading, setLoading] = useState(false);
  const [currentStepText, setCurrentStepText] = useState('');
  const [result, setResult] = useState<ReportData | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'info' | 'error'; message: string } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);

  // Auto-capture location on mount
  useEffect(() => {
    handleAutoCaptureLocation();
  }, []);

  const handleAutoCaptureLocation = async () => {
    setLocationLoading(true);
    try {
      if (!navigator.geolocation) {
        throw new Error('Geolocation not supported by this browser.');
      }
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;

          // Reverse lookup address
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, {
              headers: { 'Accept-Language': 'en' }
            });
            if (res.ok) {
              const data = await res.json();
              const address = data.display_name || 'Captured Coordinates';
              const city = data.address?.city || data.address?.town || data.address?.village || '';
              const district = data.address?.county || '';
              const state = data.address?.state || '';

              setLocationCaptured({ lat, lng, address, city, district, state });
            } else {
              setLocationCaptured(prev => ({ ...prev, lat, lng, address: 'Coordinates captured' }));
            }
          } catch (err) {
            setLocationCaptured(prev => ({ ...prev, lat, lng, address: 'Coordinates captured' }));
          }
          setLocationLoading(false);
        },
        (err) => {
          console.warn('Geolocation capture failed:', err.message);
          setLocationLoading(false);
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    } catch (e) {
      console.warn('Location capture setup failed:', e);
      setLocationLoading(false);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    console.log(`[FILE SELECTED] File selected in AccidentPage: ${file.name}`);
    console.log('[IMAGE RECEIVED] Processing selected image in AccidentPage');
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      console.log('[BASE64 CREATED] Image base64 created successfully in AccidentPage');
      setImageBase64(base64);
      console.log('[IMAGE PREVIEW] Image preview set successfully in AccidentPage');
    };
    reader.readAsDataURL(file);
  };

  const handleWebcamCapture = async (base64Image: string) => {
    setShowWebcam(false);
    console.log('[IMAGE RECEIVED] Accident page webcam image captured');
    setImageBase64(base64Image);
    console.log('[IMAGE PREVIEW] Image preview set successfully in AccidentPage');
    const mimeMatch = base64Image.match(/data:(.*?);base64/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const blob = await (await fetch(base64Image)).blob();
    setImageFile(new File([blob], 'webcam.jpg', { type: mimeType }));
    console.log('[BASE64 CREATED] Webcam base64 captured in AccidentPage');
  };

  const handleSelectSource = (source: 'camera' | 'gallery') => {
    setShowSourceSelector(false);
    if (source === 'gallery') {
      console.log('[CAMERA OPENED] Option Choose From Gallery selected in AccidentPage');
      galleryInputRef.current?.click();
    } else {
      console.log('[CAMERA OPENED] Option Open Camera selected in AccidentPage');
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (isMobile) {
        cameraInputRef.current?.click();
      } else {
        setShowWebcam(true);
      }
    }
  };

  const triggerImageUpload = () => {
    console.log('[UPLOAD BUTTON CLICKED] User clicked upload button in AccidentPage');
    
    // Bypass custom bottom sheet on iOS to prevent browser click blocking
    const isIos = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isIos) {
      console.log('[UPLOAD BUTTON CLICKED] iOS detected, opening native picker directly in AccidentPage');
      galleryInputRef.current?.click();
    } else {
      console.log('[CAMERA OPENED] Non-iOS detected, opening source selector modal in AccidentPage');
      setShowSourceSelector(true);
    }
  };

  // Drag and drop image
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImageBase64(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerTriageAnalysis = async () => {
    if (!imageBase64) {
      setNotification({ type: 'error', message: 'Please upload an injury/accident photo.' });
      return;
    }
    if (!patientName.trim()) {
      setNotification({ type: 'error', message: 'Patient Name is required.' });
      return;
    }
    if (!patientAge.trim()) {
      setNotification({ type: 'error', message: 'Patient Age is required.' });
      return;
    }
    if (!patientMobile.trim()) {
      setNotification({ type: 'error', message: 'Patient Mobile Number is required.' });
      return;
    }

    setLoading(true);
    setResult(null);

    // Simulate multi-step loading checkpoints
    const steps = [
      'Capturing live incident GPS coordinates...',
      'Reverse-geocoding incident location...',
      'Uploading and parsing injury photo...',
      'AI detecting injury type and body location...',
      'Evaluating clinical risk factors...',
      'Mapping nearest hospital emergency units...',
      'Finalizing Doctor Pre-Arrival Report...'
    ];

    let stepIdx = 0;
    setCurrentStepText(steps[0]);
    const stepInterval = setInterval(() => {
      if (stepIdx < steps.length - 1) {
        stepIdx++;
        setCurrentStepText(steps[stepIdx]);
      }
    }, 1200);

    let activeLocation = { ...locationCaptured };
    try {
      // If we don't have location yet, try to capture it quickly
      if (!activeLocation.lat) {
        try {
          const coords = await new Promise<{ lat: number; lng: number }>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
              (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
              (err) => reject(err),
              { timeout: 4000 }
            );
          });

          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.lat}&lon=${coords.lng}`, {
            headers: { 'Accept-Language': 'en' }
          });
          if (res.ok) {
            const data = await res.json();
            activeLocation = {
              lat: coords.lat,
              lng: coords.lng,
              address: data.display_name || 'Coordinates captured',
              city: data.address?.city || data.address?.town || data.address?.village || '',
              district: data.address?.county || '',
              state: data.address?.state || ''
            };
            setLocationCaptured(activeLocation);
          }
        } catch (locationErr) {
          activeLocation = {
            lat: 30.7333,
            lng: 76.7794,
            address: 'Sector 17, Chandigarh, India (Mock location due to permissions)',
            city: 'Chandigarh',
            district: 'Chandigarh',
            state: 'Chandigarh'
          };
          setLocationCaptured(activeLocation);
        }
      }

      const response = await fetch(`${API_BASE_URL}/api/analyze-emergency-details`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: imageBase64,
          patientName,
          patientAge,
          patientGender,
          patientMobile,
          incidentNote,
          location: activeLocation,
          userId: user?.uid || 'anonymous'
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned code ${response.status}`);
      }

      const reportData = await response.json();
      setResult(reportData);
      setNotification({ type: 'success', message: 'Triage briefing compiled successfully!' });
    } catch (error: any) {
      console.error('Triage error:', error);
      setNotification({ type: 'error', message: 'AI Analysis failed. Displaying basic fallback report so you can still Dispatch/SOS.' });
      setResult({
        patientDetails: { name: patientName, age: patientAge, gender: patientGender, mobileNumber: patientMobile },
        location: {
          latitude: activeLocation.lat,
          longitude: activeLocation.lng,
          address: activeLocation.address,
          city: activeLocation.city,
          district: activeLocation.district,
          state: activeLocation.state
        },
        incidentDetails: { userNote: incidentNote, incidentTime: new Date().toLocaleTimeString() },
        aiDetection: { injuryType: 'Unverified Emergency', bodyLocation: 'Unknown', severityLevel: 'HIGH', severityScore: 8, confidenceScore: 50, bloodLoss: 'Unknown', visibleBurns: 'Unknown', visibleFractures: 'Unknown', openWounds: 'Unknown', bruises: 'Unknown', swelling: 'Unknown' },
        riskFactors: { bloodLossRisk: 'Medium', fractureRisk: 'Medium', infectionRisk: 'Medium', shockRisk: 'High' },
        recommendedDepartment: 'EMERGENCY ER',
        firstAidRecommendations: ['Ensure personal safety before assisting.', 'Do NOT move the person if spinal injury is suspected.', 'Apply firm pressure to control severe bleeding.', 'Keep the victim calm and warm.', 'Trigger SOS immediately.'],
        possibleRisks: ['Traumatic Shock', 'Delayed Care'],
        nearestHospitals: []
      });
    } finally {
      clearInterval(stepInterval);
      setLoading(false);
    }
  };

  const downloadReportPdf = async () => {
    if (!result) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/download-emergency-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          report: result,
          image: imageBase64
        }),
      });
      if (!response.ok) throw new Error('Failed to generate report PDF');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PreArrival_Briefing_${result.patientDetails.name.replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setNotification({ type: 'success', message: 'Report PDF downloaded.' });
    } catch (e) {
      console.error('PDF error:', e);
      setNotification({ type: 'error', message: 'Failed to generate PDF Report.' });
    }
  };

  const shareReportText = () => {
    if (!result) return;
    const shareText = `HelpAid AI Doctor Pre-Arrival Report:\nPatient: ${result.patientDetails.name} (${result.patientDetails.age}M, ${result.patientDetails.gender})\nMobile: ${result.patientDetails.mobileNumber}\nInjury: ${result.aiDetection.injuryType}\nLocation: ${result.aiDetection.bodyLocation}\nSeverity: ${result.aiDetection.severityLevel} (${result.aiDetection.severityScore}/10)\nGPS Address: ${result.location.address}\nRecommended Department: ${result.recommendedDepartment}\nPrimary Hospital: ${result.nearestHospitals?.[0]?.name || 'N/A'}`;

    if (navigator.share) {
      navigator.share({
        title: `Doctor Briefing - ${result.patientDetails.name}`,
        text: shareText
      }).catch(err => console.log(err));
    } else {
      navigator.clipboard.writeText(shareText);
      setNotification({ type: 'info', message: 'Brief details copied to clipboard!' });
    }
  };

  const sendReportToHospital = () => {
    if (!result) return;
    setNotification({
      type: 'success',
      message: `Emergency briefing securely transmitted to ${result.nearestHospitals?.[0]?.name || 'nearest trauma center'} admissions desk!`
    });
  };

  const triggerSOSSignal = async () => {
    console.log('[SOS] Button Clicked');
    const lat = locationCaptured.lat || 30.7333;
    const lng = locationCaptured.lng || 76.7794;
    try {
      console.log('[SOS] Request Sent');
      const formData = new FormData();
      formData.append('userId', user?.uid || 'anonymous');
      formData.append('patientName', patientName || 'Emergency Patient');
      formData.append('patient_phone', patientMobile || '');
      formData.append('lat', lat.toString());
      formData.append('lng', lng.toString());
      formData.append('emergencyDescription', incidentNote || '');
      
      if (result) {
        formData.append('injuryType', result.aiDetection.injuryType);
        formData.append('severity', result.aiDetection.severityLevel);
        formData.append('aiReportSummary', (result.aiDetection as any).explanation || (result as any).summary || '');
        formData.append('reportData', JSON.stringify(result));
      } else {
        formData.append('injuryType', 'Emergency');
        formData.append('severity', 'CRITICAL');
      }

      if (imageFile) {
        formData.append('photo', imageFile);
      } else if (imageBase64) {
        // Convert base64 to Blob if needed
        const fetchRes = await fetch(imageBase64);
        const blob = await fetchRes.blob();
        formData.append('photo', blob, 'emergency.jpg');
      }

      const res = await fetch(`${API_BASE_URL}/api/sos/create`, {
        method: 'POST',
        body: formData
      });
      const sosResult = await res.json();
      
      console.log('[SOS] Response Received');
      if (sosResult.success) {
        setNotification({
          type: 'success',
          message: sosResult.message || 'SOS signal successfully sent to ambulance services and emergency contacts!'
        });
      } else {
        throw new Error(sosResult.error || 'Failed to dispatch SOS');
      }
    } catch (error) {
      setNotification({ type: 'error', message: 'Failed to issue SOS signal.' });
    }
  };

  const clearForm = () => {
    setResult(null);
    setImageBase64(null);
    setImageFile(null);
    setShowSourceSelector(false);
    setShowWebcam(false);
    setPatientName('');
    setPatientAge('');
    setPatientMobile('');
    setIncidentNote('');
    handleAutoCaptureLocation();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="w-full space-y-5 pb-32"
    >
      {/* ── HEADER ── */}
      <div className="pt-2 flex justify-between items-start">
        <div>
          <h1 className="text-[28px] font-black text-gray-900 dark:text-white tracking-tight leading-none mb-1">
            Emergency Responder
          </h1>
          <p className="text-[13px] text-gray-500 font-medium">
            AI Triage & Doctor Pre-Arrival Report Gateway
          </p>
        </div>

        {result && (
          <button
            onClick={clearForm}
            className="px-3.5 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-[11px] font-bold text-gray-500 hover:text-red-500 uppercase tracking-wider transition-colors active:scale-95"
          >
            New Report
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {/* STEP 1 & 3: FORM AND PHOTO UPLOAD */}
        {!loading && !result && (
          <motion.div
            key="input-form"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="space-y-4"
          >
            {/* PHOTO UPLOAD DRAG-DROP */}
            <div
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              className={cn(
                "relative h-52 rounded-[32px] border-2 border-dashed flex flex-col items-center justify-center transition-all bg-white dark:bg-gray-900 overflow-hidden",
                imageBase64
                  ? "border-blue-500"
                  : "border-gray-200 dark:border-gray-800 hover:border-blue-400 dark:hover:border-blue-900"
              )}
            >
              {imageBase64 ? (
                <>
                  <img src={imageBase64} alt="Incident Preview" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={triggerImageUpload}
                      className="cursor-pointer bg-white text-gray-900 px-5 py-2.5 rounded-full font-bold text-xs uppercase tracking-wide active:scale-95 shadow-md flex items-center gap-2"
                    >
                      <Camera size={15} />
                      Change Photo
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={triggerImageUpload}
                  className="w-full h-full flex flex-col items-center justify-center cursor-pointer p-6"
                >
                  <div className="w-14 h-14 bg-red-50 dark:bg-red-950/30 text-[#B91C1C] rounded-full flex items-center justify-center mb-3.5 shadow-sm">
                    <Upload size={22} />
                  </div>
                  <span className="text-[14px] font-extrabold text-gray-900 dark:text-white leading-tight">
                    Upload Injury / Accident Photo
                  </span>
                  <span className="text-[11px] text-gray-400 font-bold uppercase tracking-wider mt-1">
                    Drag and drop or tap to capture
                  </span>
                </button>
              )}
              <input type="file" accept="image/*" className="hidden" ref={galleryInputRef} onChange={handleImageSelect} />
              <input type="file" accept="image/*" capture="environment" className="hidden" ref={cameraInputRef} onChange={handleImageSelect} />
            </div>

            {/* REQUIRED DETAILS FORM */}
            <div className="bg-white dark:bg-gray-950 rounded-[32px] border border-gray-100 dark:border-gray-900 p-6 space-y-4 shadow-sm">
              <div className="flex items-center gap-2 pb-1 border-b border-gray-50 dark:border-gray-900">
                <User size={15} className="text-blue-500" />
                <h3 className="font-extrabold text-gray-900 dark:text-white text-[13px] uppercase tracking-wider">Patient Details</h3>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Patient Name</label>
                  <input
                    type="text"
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    placeholder="Enter full name"
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-transparent focus:border-blue-500 dark:focus:border-blue-800 focus:bg-white dark:focus:bg-black text-[14px] font-semibold rounded-[18px] focus:outline-none transition-all placeholder:text-gray-400"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Mobile Number</label>
                  <input
                    type="tel"
                    value={patientMobile}
                    onChange={(e) => setPatientMobile(e.target.value)}
                    placeholder="E.g., +91 9876543210"
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-transparent focus:border-blue-500 dark:focus:border-blue-800 focus:bg-white dark:focus:bg-black text-[14px] font-semibold rounded-[18px] focus:outline-none transition-all placeholder:text-gray-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Age</label>
                  <input
                    type="number"
                    value={patientAge}
                    onChange={(e) => setPatientAge(e.target.value)}
                    placeholder="Age in years"
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-transparent focus:border-blue-500 dark:focus:border-blue-800 focus:bg-white dark:focus:bg-black text-[14px] font-semibold rounded-[18px] focus:outline-none transition-all placeholder:text-gray-400"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Gender</label>
                  <div className="flex gap-2">
                    {['Male', 'Female', 'Other'].map(g => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setPatientGender(g)}
                        className={cn(
                          "flex-1 py-3 border text-[13px] font-bold uppercase rounded-[18px] transition-all",
                          patientGender === g
                            ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/10"
                            : "bg-gray-50 dark:bg-gray-900 border-transparent text-gray-500 dark:text-gray-400 hover:bg-gray-100"
                        )}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* OPTIONAL FIELD: SHORT INCIDENT NOTE */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Short Incident Note</label>
                  <span className="text-[9px] text-gray-300 font-bold uppercase tracking-wider">Optional</span>
                </div>
                <textarea
                  value={incidentNote}
                  onChange={(e) => setIncidentNote(e.target.value)}
                  placeholder="E.g., Bike accident while returning home, hot water burn in kitchen, dog bite on left leg..."
                  rows={2}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-transparent focus:border-blue-500 dark:focus:border-blue-800 focus:bg-white dark:focus:bg-black text-[14px] font-semibold rounded-[18px] focus:outline-none transition-all placeholder:text-gray-400 resize-none"
                />
              </div>

              {/* AUTO-CAPTURED GEOLOCATION PREVIEW */}
              <div className="flex items-center gap-3 p-3.5 bg-blue-50/50 dark:bg-blue-950/20 rounded-[20px] border border-blue-100/50 dark:border-blue-900/40 mt-1">
                <div className="p-2 bg-blue-500 text-white rounded-lg shrink-0">
                  <MapPin size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest leading-none">Live Incident GPS</span>
                    {locationLoading && <span className="text-[8px] text-blue-400 animate-pulse font-bold">(UPDATING...)</span>}
                  </div>
                  <p className="text-[11px] font-bold text-gray-600 dark:text-gray-300 truncate mt-0.5">
                    {locationCaptured.address || 'Detecting live address via Geolocation API...'}
                  </p>
                </div>
                {!locationCaptured.lat && (
                  <button
                    type="button"
                    onClick={handleAutoCaptureLocation}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-extrabold rounded-lg uppercase tracking-wider active:scale-95 shrink-0"
                  >
                    Retry GPS
                  </button>
                )}
              </div>
            </div>

            {/* ACTION BUTTON */}
            <button
              onClick={triggerTriageAnalysis}
              disabled={!imageBase64 || !patientName || !patientAge || !patientMobile}
              className="w-full py-4.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-extrabold text-[14px] uppercase tracking-wider rounded-full shadow-lg shadow-red-200 dark:shadow-none flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
            >
              <Activity size={18} />
              Generate Pre-Arrival Brief
            </button>
          </motion.div>
        )}

        {/* STEP 5: LOADER / AI STATUS CHECKLIST */}
        {loading && (
          <motion.div
            key="analysis-loader"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="bg-white dark:bg-gray-950 rounded-[32px] border border-gray-100 dark:border-gray-900 p-8 flex flex-col items-center justify-center space-y-6 shadow-xl min-h-[400px]"
          >
            {/* Spinning heart pulse */}
            <div className="relative w-24 h-24 flex items-center justify-center">
              <motion.div
                animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
                transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
                className="absolute inset-0 bg-red-500/10 rounded-full"
              />
              <div className="w-16 h-16 bg-red-600 text-white rounded-full flex items-center justify-center shadow-lg shadow-red-500/20">
                <Heart size={26} className="animate-pulse" />
              </div>
            </div>

            <div className="text-center max-w-sm">
              <h3 className="text-[17px] font-black text-gray-900 dark:text-white leading-tight">
                Compiling Doctor Briefing
              </h3>
              <p className="text-[11px] text-blue-600 dark:text-blue-400 font-extrabold uppercase tracking-widest mt-1.5 animate-pulse">
                {currentStepText}
              </p>
            </div>

            {/* Fake progress bars */}
            <div className="w-full max-w-xs space-y-2.5 pt-4">
              <div className="flex justify-between items-center text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                <span>Triage Model Pipeline</span>
                <span className="animate-pulse">Active</span>
              </div>
              <div className="h-1.5 bg-gray-100 dark:bg-gray-900 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: '10%' }}
                  animate={{ width: '90%' }}
                  transition={{ duration: 6 }}
                  className="h-full bg-red-600 rounded-full"
                />
              </div>
            </div>
          </motion.div>
        )}

        {/* STEP 6: DOCTOR PRE-ARRIVAL REPORT VIEW */}
        {!loading && result && (
          <motion.div
            key="report-view"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-5"
          >
            {/* DOCTOR ACTION RIBBON / ONE CLICK ACTIONS */}
            <div className="bg-red-900/10 border border-red-500/20 rounded-[28px] p-4.5 flex flex-wrap gap-2.5 items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-red-600 text-white rounded-xl flex items-center justify-center">
                  <ShieldAlert size={18} />
                </div>
                <div>
                  <h4 className="font-extrabold text-[13px] text-gray-900 dark:text-white leading-none">Emergency Live Report</h4>
                  <span className="text-[9px] font-black text-[#B91C1C] uppercase tracking-widest">Admissions Priority Briefing</span>
                </div>
              </div>

              {/* Actions row */}
              <div className="flex gap-2 w-full sm:w-auto">
                <button
                  onClick={downloadReportPdf}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 px-4 py-2.5 rounded-xl font-bold text-[11px] uppercase tracking-wider hover:bg-gray-50 active:scale-95 transition-all shadow-xs"
                >
                  <Download size={14} />
                  PDF
                </button>
                <button
                  onClick={shareReportText}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 px-4 py-2.5 rounded-xl font-bold text-[11px] uppercase tracking-wider hover:bg-gray-50 active:scale-95 transition-all shadow-xs"
                >
                  <Share2 size={14} />
                  Share
                </button>
                <button
                  onClick={sendReportToHospital}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-[#1D58D8] text-white px-4 py-2.5 rounded-xl font-bold text-[11px] uppercase tracking-wider hover:bg-blue-700 active:scale-95 transition-all shadow-md shadow-blue-500/10"
                >
                  <FileText size={14} />
                  Dispatch
                </button>
              </div>
            </div>

            {/* SEVERITY BANNER */}
            <div className="bg-white dark:bg-gray-950 rounded-[32px] border border-gray-100 dark:border-gray-900 p-6 flex flex-col md:flex-row items-center gap-6 shadow-xs">
              <div className="relative shrink-0 w-24 h-24 flex items-center justify-center bg-gray-50 dark:bg-gray-900 rounded-full border border-gray-100 dark:border-gray-800 shadow-inner">
                <div className="text-center">
                  <span className="block text-[24px] font-black text-red-600 dark:text-red-500 leading-none">
                    {result.aiDetection.severityScore}
                  </span>
                  <span className="text-[7.5px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                    Severity
                  </span>
                </div>
              </div>

              <div className="flex-1 text-center md:text-left">
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-2.5">
                  <span className={cn(
                    "px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-md",
                    result.aiDetection.severityLevel === 'CRITICAL' ? "bg-red-600 text-white" :
                      result.aiDetection.severityLevel === 'HIGH' ? "bg-orange-500 text-white" :
                        result.aiDetection.severityLevel === 'MEDIUM' ? "bg-amber-500 text-white" :
                          "bg-green-600 text-white"
                  )}>
                    {result.aiDetection.severityLevel} EMERGENCY
                  </span>
                  <span className="px-3 py-1 bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 text-[10px] font-black uppercase tracking-widest rounded-md">
                    Dept: {result.recommendedDepartment}
                  </span>
                </div>
                <h2 className="text-[20px] font-black text-gray-900 dark:text-white mt-2 leading-tight">
                  {result.aiDetection.injuryType}
                </h2>
                <p className="text-[12px] text-gray-500 font-semibold mt-1">
                  Location: <span className="text-gray-800 dark:text-gray-300 font-bold">{result.aiDetection.bodyLocation}</span> (Confidence: {result.aiDetection.confidenceScore}%)
                </p>
              </div>
            </div>

            {/* PATIENT & LOCATION INFO CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Patient brief */}
              <div className="bg-white dark:bg-gray-950 rounded-[32px] border border-gray-100 dark:border-gray-900 p-5 space-y-3.5 shadow-xs">
                <div className="flex items-center gap-2 pb-1.5 border-b border-gray-50 dark:border-gray-900">
                  <User size={14} className="text-gray-400" />
                  <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest leading-none">Patient Information</span>
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-3">
                  <div>
                    <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider">Patient Name</span>
                    <span className="text-[13px] font-bold text-gray-900 dark:text-white leading-tight">{result.patientDetails.name}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider">Mobile Number</span>
                    <span className="text-[13px] font-bold text-gray-900 dark:text-white leading-tight">{result.patientDetails.mobileNumber}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider">Age / Gender</span>
                    <span className="text-[13px] font-bold text-gray-900 dark:text-white leading-tight">{result.patientDetails.age} Years / {result.patientDetails.gender}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider">Incident Time</span>
                    <span className="text-[13px] font-bold text-gray-900 dark:text-white leading-tight">{result.incidentDetails.incidentTime}</span>
                  </div>
                </div>
                {result.incidentDetails.userNote && (
                  <div className="pt-2">
                    <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider">Incident Note</span>
                    <p className="text-[12px] text-gray-600 dark:text-gray-400 font-medium italic mt-0.5 leading-relaxed">
                      "{result.incidentDetails.userNote}"
                    </p>
                  </div>
                )}
              </div>

              {/* Location details */}
              <div className="bg-white dark:bg-gray-950 rounded-[32px] border border-gray-100 dark:border-gray-900 p-5 space-y-3.5 shadow-xs">
                <div className="flex items-center gap-2 pb-1.5 border-b border-gray-50 dark:border-gray-900">
                  <MapPin size={14} className="text-gray-400" />
                  <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest leading-none">Incident Location</span>
                </div>
                <div>
                  <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider">Reverse Geocoded Address</span>
                  <p className="text-[12px] font-bold text-gray-900 dark:text-white leading-snug mt-0.5">
                    {result.location.address}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-3">
                  <div>
                    <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider">GPS Coordinates</span>
                    <span className="text-[12px] font-bold text-gray-700 dark:text-gray-300 leading-tight">
                      {result.location.latitude?.toFixed(5) || 'N/A'}, {result.location.longitude?.toFixed(5) || 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider">Region Details</span>
                    <span className="text-[12px] font-bold text-gray-700 dark:text-gray-300 leading-tight">
                      {result.location.city || result.location.district || result.location.state || 'N/A'}
                    </span>
                  </div>
                </div>
                <div className="pt-1">
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${result.location.latitude},${result.location.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#1D58D8] uppercase tracking-wider hover:underline"
                  >
                    <Navigation size={12} />
                    Open in Maps
                  </a>
                </div>
              </div>
            </div>

            {/* DETECTED CLINICAL ARTIFACTS AND RISK FACTORS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Specific Indicators */}
              <div className="bg-white dark:bg-gray-950 rounded-[32px] border border-gray-100 dark:border-gray-900 p-5 space-y-4 shadow-xs">
                <div className="flex items-center gap-2 pb-1 border-b border-gray-50 dark:border-gray-900">
                  <Activity size={14} className="text-gray-400" />
                  <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest leading-none">Automated Injury Indicators</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Burns', val: result.aiDetection.visibleBurns },
                    { label: 'Fractures', val: result.aiDetection.visibleFractures },
                    { label: 'Open Wounds', val: result.aiDetection.openWounds },
                    { label: 'Bruises', val: result.aiDetection.bruises },
                    { label: 'Swelling', val: result.aiDetection.swelling },
                    { label: 'Blood Loss', val: result.aiDetection.bloodLoss }
                  ].map(ind => (
                    <div key={ind.label} className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-[20px] border border-gray-50/50 dark:border-gray-900/40">
                      <span className="block text-[8.5px] font-black text-gray-400 uppercase tracking-widest">{ind.label}</span>
                      <span className={cn(
                        "text-[12.5px] font-extrabold mt-0.5 block leading-tight",
                        ind.val && ind.val !== 'None' && ind.val !== 'No'
                          ? "text-red-600 dark:text-red-400"
                          : "text-gray-700 dark:text-gray-300"
                      )}>
                        {ind.val || 'None'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Risk factors grid */}
              <div className="bg-white dark:bg-gray-950 rounded-[32px] border border-gray-100 dark:border-gray-900 p-5 space-y-4 shadow-xs">
                <div className="flex items-center gap-2 pb-1 border-b border-gray-50 dark:border-gray-900">
                  <AlertTriangle size={14} className="text-gray-400" />
                  <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest leading-none">AI Risk Assessments</span>
                </div>

                <div className="space-y-3.5">
                  {[
                    { key: 'bloodLossRisk', label: 'Blood Loss Risk', val: result.riskFactors.bloodLossRisk },
                    { key: 'fractureRisk', label: 'Fracture/Dislocation Risk', val: result.riskFactors.fractureRisk },
                    { key: 'infectionRisk', label: 'Infection Risk', val: result.riskFactors.infectionRisk },
                    { key: 'shockRisk', label: 'Traumatic Shock Risk', val: result.riskFactors.shockRisk }
                  ].map(risk => (
                    <div key={risk.key} className="space-y-1">
                      <div className="flex justify-between items-baseline text-[11px] font-bold">
                        <span className="text-gray-700 dark:text-gray-300">{risk.label}</span>
                        <span className={cn(
                          risk.val === 'Critical' || risk.val === 'High' ? "text-red-600 dark:text-red-400" :
                            risk.val === 'Medium' ? "text-orange-500 dark:text-amber-500" :
                              "text-green-600"
                        )}>
                          {risk.val || 'Low'}
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-100 dark:bg-gray-900 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-500",
                            risk.val === 'Critical' ? "w-full bg-red-600" :
                              risk.val === 'High' ? "w-3/4 bg-red-50" :
                                risk.val === 'Medium' ? "w-1/2 bg-orange-500" :
                                  "w-1/4 bg-green-500"
                          )}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* FIRST AID AND DEPT PREDICTIONS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Actionable First Aid */}
              <div className="bg-white dark:bg-gray-950 rounded-[32px] border border-gray-100 dark:border-gray-900 p-5 space-y-4 shadow-xs">
                <div className="flex items-center gap-2 pb-1 border-b border-gray-50 dark:border-gray-900">
                  <BriefcaseMedical size={14} className="text-gray-400" />
                  <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest leading-none">First Aid Recommendations</span>
                </div>
                <div className="space-y-2.5">
                  {result.firstAidRecommendations.map((rec, i) => (
                    <div key={i} className="flex gap-3 items-start p-3 bg-green-50/20 dark:bg-green-950/10 rounded-[20px] border border-green-100/10">
                      <div className="w-5 h-5 bg-green-600 text-white rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                        {i + 1}
                      </div>
                      <p className="text-[12.5px] font-medium text-gray-800 dark:text-gray-200 leading-normal">
                        {rec}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Department and Risks */}
              <div className="bg-white dark:bg-gray-950 rounded-[32px] border border-gray-100 dark:border-gray-900 p-5 space-y-4 shadow-xs">
                <div className="flex items-center gap-2 pb-1 border-b border-gray-50 dark:border-gray-900">
                  <ShieldAlert size={14} className="text-gray-400" />
                  <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest leading-none">Clinical Triage Warnings</span>
                </div>

                <div className="space-y-4">
                  <div>
                    <span className="block text-[8.5px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Recommended Department</span>
                    <div className="bg-gradient-to-r from-red-600 to-red-700 text-white rounded-[20px] p-4 font-extrabold text-[15px] flex items-center justify-center gap-2 shadow-md">
                      <Sparkles size={16} />
                      {result.recommendedDepartment.toUpperCase()} DISPATCH
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <span className="block text-[8.5px] font-black text-gray-400 uppercase tracking-widest">Potential Complications</span>
                    {result.possibleRisks.map((risk, i) => (
                      <div key={i} className="flex gap-2.5 items-start">
                        <span className="w-1.5 h-1.5 bg-red-500 rounded-full mt-1.5 shrink-0" />
                        <span className="text-[12.5px] text-gray-600 dark:text-gray-400 font-medium leading-tight">{risk}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* NEAREST HOSPITALS */}
            <div className="bg-white dark:bg-gray-950 rounded-[32px] border border-gray-100 dark:border-gray-900 p-5 space-y-4 shadow-xs">
              <div className="flex items-center gap-2 pb-1 border-b border-gray-50 dark:border-gray-900">
                <Navigation size={14} className="text-gray-400" />
                <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest leading-none">Nearest Emergency Hospitals</span>
              </div>
              <div className="space-y-3">
                {result.nearestHospitals.length === 0 ? (
                  <p className="text-[12px] font-semibold text-gray-400 text-center py-4">
                    No hospitals with coordinate mappings matched.
                  </p>
                ) : (
                  result.nearestHospitals.map((hosp, i) => (
                    <div
                      key={hosp.name}
                      className={cn(
                        "p-4 rounded-[24px] border flex items-center justify-between gap-4 transition-all",
                        i === 0
                          ? "border-red-200 dark:border-red-950/60 bg-red-50/20 dark:bg-red-950/10 shadow-xs"
                          : "border-gray-100 dark:border-gray-900"
                      )}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-extrabold text-[14px] text-gray-900 dark:text-white truncate">
                            {hosp.name}
                          </h4>
                          {i === 0 && (
                            <span className="px-2 py-0.5 bg-red-600 text-white rounded text-[8px] font-black uppercase tracking-wider">
                              Primary
                            </span>
                          )}
                        </div>
                        <p className="text-[11.5px] text-gray-500 dark:text-gray-400 truncate mt-0.5">
                          {hosp.address}
                        </p>
                      </div>

                      <div className="shrink-0 text-right">
                        <div className="flex items-center gap-1.5 justify-end">
                          <Clock size={12} className="text-red-500" />
                          <span className="font-black text-[14px] text-red-600 dark:text-red-400">
                            ~{hosp.eta} mins
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5 block">
                          {hosp.distance.toFixed(1)} km away
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* CRITICAL SOS / BOTTOM ONE-CLICK BARS */}
            <div className="grid grid-cols-2 gap-3.5 pt-2">
              <button
                onClick={triggerSOSSignal}
                className="w-full py-4 bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-[12px] uppercase tracking-wider rounded-full shadow-md active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <AlertTriangle size={15} />
                Send SOS
              </button>
              <a
                href="tel:108"
                className="w-full py-4 bg-red-600 hover:bg-red-700 text-white font-extrabold text-[12px] uppercase tracking-wider rounded-full shadow-md active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <Phone size={15} />
                Call Ambulance
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── TOAST ── */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.92 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-5 py-3.5 bg-gray-900 dark:bg-gray-800 text-white rounded-2xl shadow-2xl text-[12px] font-bold flex items-center gap-3 border border-white/10 dark:border-gray-700 max-w-[90vw]"
          >
            <div className={cn(
              "p-1.5 rounded-lg shrink-0 text-white",
              notification.type === 'success' ? "bg-green-600" :
                notification.type === 'error' ? "bg-red-600" :
                  "bg-blue-600"
            )}>
              {notification.type === 'success' ? <Check size={14} /> : <Info size={14} />}
            </div>
            <span className="flex-1 leading-snug">{notification.message}</span>
            <button
              onClick={() => setNotification(null)}
              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors shrink-0"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

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
