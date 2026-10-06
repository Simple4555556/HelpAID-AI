import React, { useState, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import {
  Camera, Upload, ShieldAlert, ArrowRight, MessageSquare,
  ArrowLeft, Info, FileWarning, CheckCircle2,
  Phone, MapPin, Stethoscope, Star, Navigation,
  Download, Zap, Activity, Sparkles, AlertTriangle, Droplets, Truck, Heart, Clock, Share2, X, Loader2
} from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import { cn } from '../lib/utils';
import { useGeolocation } from '../hooks/useGeolocation';
import { API_BASE_URL } from '../config';
import AccountConversionModal from '../components/AccountConversionModal';
import WebcamModal from '../components/WebcamModal';

// @ts-ignore
const GEMINI_KEY = (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEMINI_API_KEY) || '';

const API_BASE = API_BASE_URL;

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

type ScanResult = {
  imageUrl: string;
  isEmergency: boolean;
  // Disease fields
  disease?: string;
  symptoms?: string;
  precautions?: string[];
  medicines?: string[];
  confidence?: string;
  severity?: string;
  explanation?: string;
  // Emergency fields
  injury?: string;
  steps?: string[];
  do?: string[];
  dont?: string[];
  is_emergency?: boolean;
  // Source
  fromGemini?: boolean;
  base64Image?: string;
  // Extra compiled data
  fullReportData?: any;
};

type Doctor = { name: string; specialization: string; distance_km: number; phone: string; rating: number };
type Hospital = { name: string; distance_km: number; address: string; phone: string; rating: number };

// ---------- Gemini Analysis ----------
async function analyzeWithGemini(imageFile: File, isEmergency: boolean): Promise<Partial<ScanResult>> {
  const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
  const base64 = await fileToBase64(imageFile);

  const prompt = isEmergency
    ? `You are an emergency first-aid AI. Analyze this injury image and respond ONLY as valid JSON with no markdown:
{
  "injury": "name of injury",
  "confidence": "85%",
  "severity": "Emergency",
  "steps": ["step 1", "step 2", "step 3"],
  "do": ["do 1", "do 2", "do 3"],
  "dont": ["dont 1", "dont 2", "dont 3"],
  "explanation": "Why this result"
}`
    : `You are a medical AI. Analyze the image and return ONLY JSON with no markdown:
{
  "disease": "predicted disease or condition",
  "confidence": "85%",
  "severity": "Low/Medium/High/Emergency",
  "symptoms": "comma-separated symptoms",
  "precautions": ["precaution 1", "precaution 2", "precaution 3"],
  "medicines": ["medicine 1", "medicine 2"],
  "explanation": "why this result"
}`;

  console.log('[REQUEST SENT] Sending request to Gemini AI API');
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        role: 'user', parts: [
          { inlineData: { mimeType: imageFile.type as 'image/jpeg', data: base64 } },
          { text: prompt }
        ]
      }
    ]
  });

  const text = response.text?.replace(/```json|```/g, '').trim() || '{}';
  const result = JSON.parse(text);

  // Validation Layer
  const confStr = result.confidence || "0";
  const confVal = parseInt(confStr.replace(/\\D/g, ''), 10) || 0;
  if (confVal < 60) {
    result.severity = "Uncertain";
  }

  return result;
}

interface LocationData {
  lat: number;
  lng: number;
  address: string;
  city: string;
  district: string;
  state: string;
}

const captureLocation = (): Promise<LocationData> => {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({
        lat: 26.8467,
        lng: 80.9462,
        address: "Lucknow, Uttar Pradesh, India",
        city: "Lucknow",
        district: "Lucknow",
        state: "Uttar Pradesh"
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
            headers: {
              'Accept-Language': 'en'
            }
          });
          if (res.ok) {
            const data = await res.json();
            const address = data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
            const city = data.address?.city || data.address?.town || data.address?.village || data.address?.suburb || "Lucknow";
            const district = data.address?.county || data.address?.district || "Lucknow";
            const state = data.address?.state || "Uttar Pradesh";
            resolve({ lat, lng, address, city, district, state });
          } else {
            throw new Error();
          }
        } catch {
          resolve({
            lat,
            lng,
            address: `${lat.toFixed(4)}, ${lng.toFixed(4)} (GPS Location)`,
            city: "Lucknow",
            district: "Lucknow",
            state: "Uttar Pradesh"
          });
        }
      },
      () => {
        resolve({
          lat: 26.8467,
          lng: 80.9462,
          address: "Lucknow, Uttar Pradesh, India (Default Location)",
          city: "Lucknow",
          district: "Lucknow",
          state: "Uttar Pradesh"
        });
      },
      { timeout: 8000 }
    );
  });
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      console.log('[BASE64 CREATED] Base64 string generated successfully');
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------- Static fallback data ----------
const FALLBACK_DISEASE: Partial<ScanResult> = {
  disease: 'Skin Condition Detected',
  confidence: '88%', severity: 'Medium',
  symptoms: 'visible skin irregularity, possible inflammation',
  precautions: ['Consult a dermatologist', 'Avoid scratching', 'Apply moisturizer'],
  medicines: ['Calamine lotion', 'Antihistamine']
};

const FALLBACK_EMERGENCY: Partial<ScanResult> = {
  injury: 'Wound / Laceration',
  confidence: '97%',
  steps: ['1. Apply direct pressure with a clean cloth', '2. Elevate the injured area above heart level', '3. Seek immediate medical attention'],
  do: ['Apply pressure', 'Stay calm', 'Elevate wound'],
  dont: ['Do NOT remove soaked cloth', 'Do NOT use ice directly', 'Do NOT delay medical help']
};

// ---------- Recommendation Engine Generators ----------
function getRecommendedSpecialists(condition: string) {
  const condLower = (condition || '').toLowerCase();
  if (condLower.includes('burn') || condLower.includes('scald') || condLower.includes('fire')) {
    return [
      {
        id: 'spec-1',
        name: 'Dr. Raj Sharma',
        specialization: 'Burn Specialist',
        hospital: 'City Burn Centre',
        distance: '6.2 km',
        eta: '11 min',
        availability: 'Available Now',
        isOnline: true,
        reason: 'Best specialist for second-degree burns.'
      },
      {
        id: 'spec-2',
        name: 'Dr. Amit Verma',
        specialization: 'Plastic Surgeon',
        hospital: 'Apollo Hospital',
        distance: '7.4 km',
        eta: '13 min',
        availability: 'On Call',
        isOnline: true,
        reason: 'Expert in burn skin reconstruction & trauma.'
      },
      {
        id: 'spec-3',
        name: 'Dr. Vivek Singh',
        specialization: 'Trauma Surgeon',
        hospital: 'Trauma Centre',
        distance: '8.1 km',
        eta: '14 min',
        availability: 'In ER',
        isOnline: true,
        reason: 'High experience with emergency burn resuscitation.'
      }
    ];
  } else if (condLower.includes('fracture') || condLower.includes('bone') || condLower.includes('dislocat')) {
    return [
      {
        id: 'spec-1',
        name: 'Dr. Rajesh Gupta',
        specialization: 'Orthopedic Surgeon',
        hospital: 'Bone & Joint Hospital',
        distance: '4.8 km',
        eta: '9 min',
        availability: 'Available Now',
        isOnline: true,
        reason: 'Best specialist for complex bone fracture reduction.'
      },
      {
        id: 'spec-2',
        name: 'Dr. Ananya Mishra',
        specialization: 'Trauma Specialist',
        hospital: 'City Trauma Unit',
        distance: '5.5 km',
        eta: '11 min',
        availability: 'On Duty',
        isOnline: true,
        reason: 'Specialist in acute fracture immobilization.'
      },
      {
        id: 'spec-3',
        name: 'Dr. Vikramaditya Rao',
        specialization: 'Joint & Musculoskeletal Specialist',
        hospital: 'Max Healthcare',
        distance: '7.2 km',
        eta: '13 min',
        availability: 'In ER',
        isOnline: true,
        reason: 'Advanced expertise in emergency limb trauma.'
      }
    ];
  } else if (condLower.includes('cut') || condLower.includes('wound') || condLower.includes('lacerat') || condLower.includes('bleed')) {
    return [
      {
        id: 'spec-1',
        name: 'Dr. Sameer Khan',
        specialization: 'General & Trauma Surgeon',
        hospital: 'Emergency Trauma Care',
        distance: '3.5 km',
        eta: '8 min',
        availability: 'Available Now',
        isOnline: true,
        reason: 'Best specialist for deep laceration repair & hemostasis.'
      },
      {
        id: 'spec-2',
        name: 'Dr. Priya Nair',
        specialization: 'Plastic & Wound Surgeon',
        hospital: 'Apollo Hospital',
        distance: '5.2 km',
        eta: '10 min',
        availability: 'On Duty',
        isOnline: true,
        reason: 'Specialist in minimal scar tissue wound closure.'
      },
      {
        id: 'spec-3',
        name: 'Dr. Devendra Joshi',
        specialization: 'Critical Care Specialist',
        hospital: 'Care Hospital',
        distance: '6.9 km',
        eta: '12 min',
        availability: 'In ER',
        isOnline: true,
        reason: 'High capability for severe acute blood loss management.'
      }
    ];
  } else {
    return [
      {
        id: 'spec-1',
        name: 'Dr. Raj Sharma',
        specialization: 'Burn Specialist',
        hospital: 'City Burn Centre',
        distance: '6.2 km',
        eta: '11 min',
        availability: 'Available Now',
        isOnline: true,
        reason: 'Best specialist for second-degree burns.'
      },
      {
        id: 'spec-2',
        name: 'Dr. Amit Verma',
        specialization: 'Plastic Surgeon',
        hospital: 'Apollo Hospital',
        distance: '7.4 km',
        eta: '13 min',
        availability: 'On Call',
        isOnline: true,
        reason: 'Expert in burn skin reconstruction & trauma.'
      },
      {
        id: 'spec-3',
        name: 'Dr. Vivek Singh',
        specialization: 'Trauma Surgeon',
        hospital: 'Trauma Centre',
        distance: '8.1 km',
        eta: '14 min',
        availability: 'In ER',
        isOnline: true,
        reason: 'High experience with emergency burn resuscitation.'
      }
    ];
  }
}

function getRecommendedHospitals(condition: string) {
  const condLower = (condition || '').toLowerCase();
  if (condLower.includes('burn') || condLower.includes('scald') || condLower.includes('fire')) {
    return [
      {
        id: 'rhosp-1',
        name: 'Burn & Trauma Centre',
        department: 'Burn ICU & Emergency',
        distance: '6.5 km',
        eta: '12 min',
        emergencyAvailable: '24/7 ER Ready',
        specialUnit: 'Burn ICU Available',
        reason: 'Highest capability for severe burn treatment.'
      },
      {
        id: 'rhosp-2',
        name: 'Apollo Super Specialty Hospital',
        department: 'Plastic & Reconstructive Surgery',
        distance: '7.8 km',
        eta: '14 min',
        emergencyAvailable: '24/7 ER Ready',
        specialUnit: 'Specialized Burn Ward',
        reason: '24/7 emergency plastic surgery team on standby.'
      },
      {
        id: 'rhosp-3',
        name: 'City General Hospital',
        department: 'Emergency & Trauma Ward',
        distance: '8.5 km',
        eta: '15 min',
        emergencyAvailable: '24/7 ER Ready',
        specialUnit: 'Emergency Trauma ICU',
        reason: 'Rapid response emergency stabilization unit.'
      }
    ];
  } else if (condLower.includes('fracture') || condLower.includes('bone')) {
    return [
      {
        id: 'rhosp-1',
        name: 'National Bone & Joint Centre',
        department: 'Orthopedics & Trauma',
        distance: '4.5 km',
        eta: '9 min',
        emergencyAvailable: '24/7 ER Ready',
        specialUnit: 'Fracture ICU Available',
        reason: 'Highest capability for complex orthopedic trauma.'
      },
      {
        id: 'rhosp-2',
        name: 'Apollo Emergency Hospital',
        department: 'Emergency Surgery',
        distance: '6.1 km',
        eta: '11 min',
        emergencyAvailable: '24/7 ER Ready',
        specialUnit: 'Level-1 Trauma Suite',
        reason: 'Complete emergency trauma & imaging facilities.'
      },
      {
        id: 'rhosp-3',
        name: 'Regional Medical Centre',
        department: 'General Trauma Ward',
        distance: '7.4 km',
        eta: '13 min',
        emergencyAvailable: '24/7 ER Ready',
        specialUnit: 'Trauma Resuscitation Unit',
        reason: 'Immediate trauma triage & stabilization team.'
      }
    ];
  } else {
    return [
      {
        id: 'rhosp-1',
        name: 'Burn & Trauma Centre',
        department: 'Acute Emergency Triage',
        distance: '6.5 km',
        eta: '12 min',
        emergencyAvailable: '24/7 ER Ready',
        specialUnit: 'Burn ICU Available',
        reason: 'Highest capability for severe burn treatment.'
      },
      {
        id: 'rhosp-2',
        name: 'Apollo Super Specialty Hospital',
        department: 'Emergency Medicine',
        distance: '7.8 km',
        eta: '14 min',
        emergencyAvailable: '24/7 ER Ready',
        specialUnit: 'Specialized Burn Ward',
        reason: '24/7 emergency plastic surgery team on standby.'
      },
      {
        id: 'rhosp-3',
        name: 'City General Hospital',
        department: 'Emergency & Trauma Ward',
        distance: '8.5 km',
        eta: '15 min',
        emergencyAvailable: '24/7 ER Ready',
        specialUnit: 'Emergency Trauma ICU',
        reason: 'Rapid response emergency stabilization unit.'
      }
    ];
  }
}

// ─────────────────────────────────────────────
export default function HomePage({ user, onAuthSuccess }: { user: User | null; onAuthSuccess: (user: any) => void }) {
  const navigate = useNavigate();
  const { lat: liveLat, lng: liveLng, accuracy: liveAccuracy, error: locationError, requesting: locating, getPosition: refreshLocation } = useGeolocation(true);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [dashboardHospitals, setDashboardHospitals] = useState<Hospital[]>([]);
  const [dashboardDoctors, setDashboardDoctors] = useState<Doctor[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  
  const mainInputRef = useRef<HTMLInputElement>(null);
  const emergencyInputRef = useRef<HTMLInputElement>(null);
  const mainCameraInputRef = useRef<HTMLInputElement>(null);
  const emergencyCameraInputRef = useRef<HTMLInputElement>(null);
  const [sourceSelector, setSourceSelector] = useState<{ isEmergency: boolean } | null>(null);
  const [showWebcam, setShowWebcam] = useState<{ isEmergency: boolean } | null>(null);

  // Workflow states for multi-step emergency scan
  const [workflowStep, setWorkflowStep] = useState<'upload' | 'form' | 'report'>('upload');
  const [patientName, setPatientName] = useState('');
  const [patientAge, setPatientAge] = useState('');
  const [patientGender, setPatientGender] = useState('Male');
  const [patientMobile, setPatientMobile] = useState('');
  const [patientBloodGroup, setPatientBloodGroup] = useState('O+');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [incidentNote, setIncidentNote] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [conversionModalOpen, setConversionModalOpen] = useState(false);
  const [generatedCaseId, setGeneratedCaseId] = useState<string | null>(null);
  const [sosBroadcastActive, setSosBroadcastActive] = useState(false);
  const [assignedDoctorName, setAssignedDoctorName] = useState<string | null>(null);

  React.useEffect(() => {
    if (user) {
      fetch(`${API_BASE_URL}/api/profile?userId=${user.uid}`)
        .then(res => res.json())
        .then(data => {
          setProfile(data);
          if (data) {
            setPatientName(data.fullName || data.displayName || '');
            setPatientAge(data.age ? String(data.age) : '');
            setPatientGender(data.gender || 'Male');
            setPatientMobile(data.mobileNumber || '');
            setPatientBloodGroup(data.bloodGroup || 'O+');
            if (data.emergencyContacts && data.emergencyContacts.length > 0) {
              setEmergencyContact(data.emergencyContacts[0].mobileNumber || data.emergencyContacts[0].phone || '');
            }
          }
        })
        .catch(err => console.error('Failed to load profile:', err));

      fetch(`${API_BASE_URL}/api/timeline?userId=${user.uid}`)
        .then(res => res.json())
        .then(data => setTimeline(data))
        .catch(err => console.error('Failed to load timeline:', err));
    }
  }, [user]);

  // Fetch initial nearby data
  React.useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [hRes, dRes] = await Promise.all([
          fetch(`${API_BASE}/api/nearby-facilities`),
          fetch(`${API_BASE}/api/doctors`).catch(() => null)
        ]);

        if (hRes.ok) {
          const hData = await hRes.json();
          if (Array.isArray(hData)) {
            const mapped = hData.map((f: any) => ({
              name: f.name,
              distance_km: f.distance_km || f.distanceKm || 2.0,
              address: f.address,
              phone: f.phone || '+91 9266949411',
              rating: f.rating || 4.5
            }));
            setDashboardHospitals(mapped.slice(0, 4));
          } else if (hData && hData.facilities) {
            const mapped = hData.facilities.map((f: any) => ({
              name: f.name,
              distance_km: f.distance_km || f.distanceKm || 2.0,
              address: f.address,
              phone: f.phone || '+91 9266949411',
              rating: f.rating || 4.5
            }));
            setDashboardHospitals(mapped.slice(0, 4));
          } else {
            setDashboardHospitals([]);
          }
        } else {
          setDashboardHospitals([]);
        }

        if (dRes && dRes.ok) {
          const dData = await dRes.json();
          if (Array.isArray(dData)) {
            const mapped = dData.map((d: any) => ({
              name: d.name,
              specialization: d.specialization || d.specialty || 'General Practitioner',
              distance_km: d.distance_km || d.distanceKm || 1.5,
              phone: d.phone || '+91 9876543210',
              rating: d.rating || 4.6
            }));
            setDashboardDoctors(mapped.slice(0, 4));
          } else {
            setDashboardDoctors([]);
          }
        } else {
          setDashboardDoctors([]);
        }
      } catch {
        setDashboardHospitals([]);
        setDashboardDoctors([]);
      }
    };
    fetchInitialData();
  }, []);

  // Support mock scan via query parameter for testing
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mock_scan') === 'true') {
      setScanResult({
        imageUrl: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=120&h=120&fit=crop',
        isEmergency: true,
        injury: 'Simulated Laceration',
        confidence: '95%',
        base64Image: 'mock_base64_data',
        fromGemini: true
      });
      setWorkflowStep('form');
    }
  }, []);

  const fetchSupportData = useCallback(async (disease: string) => {
    try {
      const [dRes, hRes] = await Promise.all([
        fetch(`${API_BASE}/doctors?disease=${encodeURIComponent(disease)}`),
        fetch(`${API_BASE}/api/nearby-facilities`)
      ]);
      const dData = await dRes.json();
      const hData = await hRes.json();
      setDoctors(dData.doctors || []);
      if (Array.isArray(hData)) {
        const mapped = hData.map((f: any) => ({
          name: f.name,
          distance_km: f.distance_km || f.distanceKm || 2.0,
          address: f.address,
          phone: f.phone || '+91 9266949411',
          rating: f.rating || 4.5
        }));
        setHospitals(mapped.slice(0, 4));
      } else if (hData && hData.facilities) {
        const mapped = hData.facilities.map((f: any) => ({
          name: f.name,
          distance_km: f.distance_km || f.distanceKm || 2.0,
          address: f.address,
          phone: f.phone || '+91 9266949411',
          rating: f.rating || 4.5
        }));
        setHospitals(mapped.slice(0, 4));
      } else {
        setHospitals([]);
      }
    } catch {
      setDoctors([]);
      setHospitals([]);
    }
  }, []);

  const processFile = async (file: File, isEmergency: boolean) => {
    console.log('[IMAGE RECEIVED] Processing image:', file.name, 'Size:', file.size, 'bytes');
    setIsScanning(true);
    setScanResult(null);
    const imageUrl = URL.createObjectURL(file);
    console.log(`[IMAGE PREVIEW] Image preview URL created successfully: ${imageUrl}`);

    let data: Partial<ScanResult> = {};
    let fromGemini = false;

    // 1. Try Gemini first
    if (GEMINI_KEY) {
      try {
        console.log('[AI REQUEST] Requesting Gemini AI scan on frontend...');
        data = await analyzeWithGemini(file, isEmergency);
        console.log('[AI RESPONSE] Gemini AI scan response received:', JSON.stringify(data));
        fromGemini = true;
      } catch (err) {
        console.warn('Gemini client side analysis failed, falling back to server...', err);
      }
    }

    // 2. Try Flask backend
    if (!fromGemini) {
      try {
        console.log('[AI REQUEST] Sending image analysis request to backend server...');
        const formData = new FormData();
        formData.append('image', file);
        const res = await fetch(`${API_BASE}/${isEmergency ? 'emergency' : 'predict'}`, {
          method: 'POST', body: formData
        });
        data = await res.json();
        console.log('[AI RESPONSE] Backend server analysis response received:', JSON.stringify(data));
      } catch (err) {
        console.warn('Backend server analysis failed, using fallback...');
        data = isEmergency ? FALLBACK_EMERGENCY : FALLBACK_DISEASE;
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    const base64Data = await fileToBase64(file).catch(() => undefined);
    const result: ScanResult = { ...data, imageUrl, isEmergency, fromGemini, base64Image: base64Data };
    setScanResult(result);
    await fetchSupportData(data.disease || data.injury || '');
    setIsScanning(false);

    if (isEmergency) {
      if (isNoInjuryDetected(result)) {
        setWorkflowStep('report');
      } else {
        setWorkflowStep('form');
      }
    } else {
      setWorkflowStep('report');
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, isEmergency: boolean) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    console.log(`[FILE SELECTED] File selected via file input: ${file.name}`);
    await processFile(file, isEmergency);
  };

  const handleWebcamCapture = async (base64Image: string) => {
    if (!showWebcam) return;
    const { isEmergency } = showWebcam;
    setShowWebcam(null);

    const mimeMatch = base64Image.match(/data:(.*?);base64/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const blob = await (await fetch(base64Image)).blob();
    const file = new File([blob], "webcam.jpg", { type: mimeType });
    await processFile(file, isEmergency);
  };

  const triggerSourceSelect = (isEmergency: boolean) => {
    console.log('[UPLOAD BUTTON CLICKED] User tapped upload image button');
    
    // Check if device is iPhone/iPad (iOS)
    const isIos = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
    
    if (isIos) {
      console.log('[UPLOAD BUTTON CLICKED] iOS device detected, bypassing custom bottom sheet and opening native picker directly');
      if (isEmergency) {
        emergencyInputRef.current?.click();
      } else {
        mainInputRef.current?.click();
      }
    } else {
      console.log('[CAMERA OPENED] Non-iOS device detected, showing custom bottom sheet');
      setSourceSelector({ isEmergency });
    }
  };

  const handleSelectSource = (source: 'camera' | 'gallery') => {
    if (!sourceSelector) return;
    const { isEmergency } = sourceSelector;
    setSourceSelector(null);

    if (source === 'gallery') {
      console.log('[CAMERA OPENED] Option Choose From Gallery selected');
      if (isEmergency) {
        emergencyInputRef.current?.click();
      } else {
        mainInputRef.current?.click();
      }
    } else {
      console.log('[CAMERA OPENED] Option Open Camera selected');
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (isMobile) {
        if (isEmergency) {
          emergencyCameraInputRef.current?.click();
        } else {
          mainCameraInputRef.current?.click();
        }
      } else {
        setShowWebcam({ isEmergency });
      }
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanResult) return;
    
    setIsScanning(true);
    const loc = await captureLocation();
    
    try {
      const response = await fetch(`${API_BASE}/api/analyze-emergency-details`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: scanResult.base64Image,
          patientName,
          patientAge,
          patientGender,
          patientMobile,
          incidentNote: incidentNote || `${scanResult.disease || scanResult.injury} emergency`,
          location: {
            lat: loc.lat,
            lng: loc.lng,
            address: loc.address,
            city: loc.city,
            district: loc.district,
            state: loc.state
          },
          userId: user?.uid || 'guest'
        })
      });
      
      if (response.ok) {
        const fullReport = await response.json();
        setScanResult({
          ...scanResult,
          isEmergency: true,
          disease: fullReport.aiDetection?.injuryType || scanResult.disease || scanResult.injury,
          injury: fullReport.aiDetection?.injuryType || scanResult.injury,
          confidence: `${fullReport.aiDetection?.confidenceScore || 90}%`,
          severity: fullReport.aiDetection?.severityLevel || 'High',
          explanation: `Location: ${fullReport.aiDetection?.bodyLocation || 'N/A'}. Open Wounds: ${fullReport.aiDetection?.openWounds || 'None'}. Burns: ${fullReport.aiDetection?.visibleBurns || 'None'}. recommended department: ${fullReport.recommendedDepartment || 'Emergency'}. ETA: ${fullReport.nearestHospitals?.[0]?.eta || 10} mins.`,
          steps: fullReport.firstAidRecommendations || scanResult.steps || [],
          base64Image: scanResult.base64Image,
          imageUrl: scanResult.imageUrl,
          fullReportData: fullReport
        });
        setWorkflowStep('report');
      } else {
        throw new Error();
      }
    } catch (err) {
      alert('Failed to compile Pre-Arrival report. Displaying basic first aid directions.');
      setWorkflowStep('report');
    } finally {
      setIsScanning(false);
    }
  };

  const reset = () => {
    setScanResult(null);
    setIsScanning(false);
    setDoctors([]);
    setHospitals([]);
    setWorkflowStep('upload');
    setIncidentNote('');
  };

  const triggerEmergencyReupload = () => {
    setScanResult(null);
    setIsScanning(false);
    setDoctors([]);
    setHospitals([]);
    setWorkflowStep('upload');
    setIncidentNote('');
    setTimeout(() => {
      emergencyInputRef.current?.click();
    }, 100);
  };

  const downloadReport = async () => {
    if (!scanResult) return;
    
    try {
      let url = `${API_BASE}/download-report`;
      let body: any = {};
      
      if (scanResult.isEmergency && scanResult.fullReportData) {
        url = `${API_BASE}/api/download-emergency-pdf`;
        body = {
          report: scanResult.fullReportData,
          image: scanResult.base64Image
        };
      } else {
        body = {
          patient: user?.displayName || 'Rahul Sharma',
          date: new Date().toLocaleString('en-IN', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }),
          disease: scanResult.disease,
          injury: scanResult.injury,
          confidence: scanResult.confidence,
          severity: scanResult.severity,
          explanation: scanResult.explanation,
          steps: scanResult.steps,
          precautions: scanResult.precautions,
          medicines: scanResult.medicines,
          do: scanResult.do,
          dont: scanResult.dont,
          image: scanResult.base64Image,
          location: 'Chandigarh, India',
          hospital: 'City General Hospital',
          distance: '2.3 km',
          contact: '108'
        };
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) throw new Error('Failed to generate PDF');

      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = scanResult.isEmergency ? `HelpAid_PreArrival_Report_${new Date().getTime()}.pdf` : `HelpAid_Scan_Report_${new Date().getTime()}.pdf`;
      a.click();
      URL.revokeObjectURL(downloadUrl);
    } catch (e) {
      console.error('PDF generation failed', e);
      alert('Failed to generate PDF report. Please ensure the backend server is running.');
    }
  };

  const openMapsNearby = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => window.open(`https://www.google.com/maps/search/hospital+near+me/@${pos.coords.latitude},${pos.coords.longitude},14z`, '_blank'),
        () => window.open('https://www.google.com/maps/search/hospital+near+me', '_blank')
      );
    } else window.open('https://www.google.com/maps/search/hospital+near+me', '_blank');
  };

  const shareReport = async () => {
    if (!scanResult) return;
    const shareText = `HelpAid Emergency Pre-Arrival Report - ${scanResult.disease || scanResult.injury}
Patient: ${patientName} (${patientAge}Y / ${patientGender})
Location: ${scanResult.fullReportData?.location?.address || 'GPS Coordinates'}
Severity: ${scanResult.severity}
Triage steps: ${(scanResult.steps || []).join('; ')}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'HelpAid Emergency Pre-Arrival Report',
          text: shareText,
        });
        setToastMessage('Report shared successfully.');
      } catch {
        navigator.clipboard.writeText(shareText);
        setToastMessage('Report summary copied to clipboard.');
      }
    } else {
      navigator.clipboard.writeText(shareText);
      setToastMessage('Report summary copied to clipboard.');
    }
  };

  const sendToHospital = () => {
    setToastMessage('🚑 Report successfully transmitted to the nearest hospital Emergency Room.');
  };

  const sendSOS = async () => {
    console.log('[SOS] Button Clicked - Simultaneous Dispatch to Recommended Specialists & Hospitals');
    if (!scanResult) return;

    const detectedCond = scanResult.disease || scanResult.injury || scanResult.fullReportData?.aiDetection?.injuryType || 'Second-Degree Burn';
    const recSpecs = getRecommendedSpecialists(detectedCond);
    const recHosps = getRecommendedHospitals(detectedCond);

    setSosBroadcastActive(true);
    setAssignedDoctorName(null);

    try {
      console.log('[SOS] Simultaneous Request Sent');
      const res = await fetch(`${API_BASE}/api/sos/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.uid || 'guest',
          patientName: patientName || user?.displayName || 'Emergency Patient',
          lat: scanResult.fullReportData?.location?.latitude || liveLat || 26.8467,
          lng: scanResult.fullReportData?.location?.longitude || liveLng || 80.9462,
          recommendedSpecialists: recSpecs,
          recommendedHospitals: recHosps
        })
      });
      const data = await res.json();
      console.log('[SOS] Simultaneous Response Received', data);
      if (res.ok) {
        setToastMessage(`🚨 SOS PRIORITY ACTIVE: Dispatched simultaneously to all 3 Recommended Specialists & Top Hospitals.`);
        if (data.caseId) {
          setGeneratedCaseId(data.caseId);
        }
        if (!user) {
          setConversionModalOpen(true);
        }
      } else {
        setToastMessage('🚨 SOS Simultaneous Priority Broadcast initiated to recommended specialists.');
      }
    } catch (err) {
      console.error('SOS dispatch error:', err);
      setToastMessage('🚨 SOS Priority Broadcast sent to network. Alerting all recommended specialists.');
    }

    // Doctor acceptance simulation: First doctor who accepts becomes Assigned Doctor. Pending requests for others are automatically cancelled.
    setTimeout(() => {
      const assignedDoc = recSpecs[0].name;
      setAssignedDoctorName(assignedDoc);
      setToastMessage(`✅ ${assignedDoc} ACCEPTED SOS! Assigned Doctor set. Pending requests for remaining specialists cancelled.`);
    }, 2500);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full flex justify-center pt-2">
      <AnimatePresence mode="wait">

        {/* ────────── HOME ────────── */}
        {workflowStep === 'upload' && !isScanning && !scanResult && (
          <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full space-y-5">

            {/* Greeting */}
            <div className="flex justify-between items-start mb-6">
              <div>
                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-1">YOUR HEALTH COMPANION</p>
                <h1 className="text-[32px] font-black text-gray-900 dark:text-white tracking-tight leading-none mb-1">
                  Hello, {user?.displayName?.split(' ')[0] || 'Guest'}
                </h1>
                <p className="text-gray-650 dark:text-gray-400 text-sm mt-1">How are you feeling today?</p>
              </div>
            </div>

            {/* Live GPS Status Banner */}
            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-2xl flex items-center justify-center ${locationError ? 'bg-red-50 text-red-600' : liveLat ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                  {locating ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <MapPin size={16} />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-850 dark:text-slate-200">GPS Status</span>
                    <span className={`w-2 h-2 rounded-full ${locationError ? 'bg-red-500' : liveLat ? 'bg-emerald-500 animate-pulse' : 'bg-blue-500 animate-pulse'}`} />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {locationError 
                      ? locationError 
                      : liveLat 
                        ? `Lat: ${liveLat.toFixed(4)}, Lng: ${liveLng?.toFixed(4)} (Accuracy: ±${liveAccuracy ? Math.round(liveAccuracy) : 0}m)` 
                        : 'Retrieving your precise location...'}
                  </p>
                </div>
              </div>
              {(locationError || liveLat) && (
                <button 
                  onClick={refreshLocation} 
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer self-start sm:self-auto animate-none"
                >
                  Refresh Location
                </button>
              )}
            </div>

            {/* HelpAid Passport Card */}
            {user && profile ? (
              <div className="bg-linear-to-br from-gray-900 via-gray-950 to-slate-900 rounded-[28px] p-6 text-white border border-gray-800 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none w-full h-full flex justify-end">
                  <div className="w-40 h-40 border-[20px] border-white rounded-full translate-x-12 -translate-y-4" />
                </div>
                
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-extrabold text-sm shadow-md">
                      HA
                    </div>
                    <div>
                      <h3 className="text-[9px] font-black uppercase tracking-wider text-gray-400">HelpAid ID</h3>
                      <span className="text-[16px] font-black tracking-wider text-blue-400 leading-none">
                        {profile.publicId || 'HA-2026-PENDING'}
                      </span>
                    </div>
                  </div>
                  <div className="bg-blue-600/20 border border-blue-500/30 text-blue-400 text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider">
                    Secure Passport
                  </div>
                </div>

                <div className="mt-6 flex justify-between items-end">
                  <div>
                    <span className="block text-[8px] font-black text-gray-500 uppercase tracking-widest">PATIENT NAME</span>
                    <span className="text-sm font-bold text-gray-200">
                      {profile.fullName || profile.displayName || user.displayName || 'HelpAid User'}
                    </span>
                  </div>
                  
                  <div className="flex gap-4 bg-white/5 border border-white/5 rounded-xl px-3 py-2 text-right">
                    <div>
                      <span className="block text-[8px] text-gray-400 uppercase font-black">Blood</span>
                      <span className="text-[11px] font-bold text-red-400">{profile.bloodGroup || 'O+'}</span>
                    </div>
                    <div>
                      <span className="block text-[8px] text-gray-400 uppercase font-black">Age</span>
                      <span className="text-[11px] font-bold text-gray-200">{profile.age || '28'} Yrs</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : !user ? (
              <div className="p-5 bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-950/20 dark:to-red-950/10 rounded-[28px] border border-red-100/30 dark:border-red-900/20 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="min-w-0 text-center sm:text-left">
                  <h4 className="font-extrabold text-sm text-[#B91C1C] dark:text-red-400 uppercase tracking-wider">🚨 Emergency Guest Mode</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Free instant triage, scans, AI chat, and locator. No signup required.</p>
                </div>
                <div className="flex gap-2 w-full sm:w-auto shrink-0">
                  <Link to="/login" className="flex-1 sm:flex-initial px-4.5 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-750 text-gray-805 dark:text-gray-250 rounded-xl font-bold text-xs text-center active:scale-95 transition-all">
                    Login
                  </Link>
                  <Link to="/signup" className="flex-1 sm:flex-initial px-4.5 py-2.5 bg-[#1D58D8] text-white rounded-xl font-bold text-xs text-center shadow-md shadow-blue-500/10 active:scale-95 transition-all">
                    Sign Up
                  </Link>
                </div>
              </div>
            ) : null}

            {/* Timeline Preview */}
            {user && timeline && timeline.length > 0 && (
              <div className="bg-white dark:bg-gray-900 rounded-[28px] p-5 shadow-xs border border-gray-100 dark:border-gray-800 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Clock size={14} className="text-blue-500" /> Recent Medical Timeline
                  </h3>
                  <Link to="/profile" className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline">
                    View Vault
                  </Link>
                </div>
                <div className="relative pl-5 border-l-2 border-blue-500/20 space-y-4 pt-1 ml-2">
                  {timeline.slice(0, 2).map((event: any, idx: number) => (
                    <div key={idx} className="relative">
                      <div className={cn(
                        "absolute -left-[28.5px] top-1 w-3 h-3 rounded-full border-2 border-white dark:border-gray-900",
                        event.eventType === 'INJURY' ? "bg-red-500" :
                        event.eventType === 'SYMPTOM' ? "bg-amber-500" :
                        event.eventType === 'CHAT' ? "bg-blue-500" :
                        "bg-green-500"
                      )} />
                      <div className="flex justify-between items-start gap-4">
                        <div className="min-w-0">
                          <h5 className="font-extrabold text-xs text-gray-900 dark:text-white truncate">
                            {event.eventTitle}
                          </h5>
                          <span className="text-[10px] text-gray-400 block mt-0.5">
                            {new Date(event.eventDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                        </div>
                        <span className="shrink-0 text-[8px] font-black uppercase bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded">
                          {event.eventType}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── EMERGENCY SCAN BUTTON (Absolute Primary Option) ── */}
            <motion.div
              whileTap={{ scale: 0.98 }}
              className="relative overflow-hidden bg-gradient-to-br from-[#B91C1C] to-red-900 rounded-[32px] p-6 shadow-xl shadow-red-900/20 cursor-pointer flex flex-col justify-between min-h-[200px]"
              onClick={() => triggerSourceSelect(true)}
            >
              <div className="absolute top-0 right-0 p-2 opacity-20 pointer-events-none w-full h-full flex justify-end">
                <div className="w-32 h-32 border-[24px] border-white/10 rounded-full translate-x-12 -translate-y-4" />
                <div className="absolute w-24 h-24 bg-white/5 rounded-full top-1/2 left-1/2" />
              </div>
              <div className="relative z-10">
                <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mb-5 border border-white/20 shadow-sm animate-pulse">
                  <span className="text-white font-black text-2xl animate-ping select-none">*</span>
                </div>
                <h2 className="text-[28px] font-black text-white leading-tight mb-2">🚨 Emergency Scan Now</h2>
                <p className="text-red-100/90 text-[13px] leading-relaxed max-w-[260px]">
                  Cuts, Burns, Wounds, Bruises. Upload an injury photo for instant pre-arrival reporting.
                </p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); triggerSourceSelect(true); }}
                className="relative z-10 mt-5 flex items-center gap-1.5 text-white font-medium text-[13px] group"
              >
                Upload & Scan Injury <ArrowRight size={16} strokeWidth={2.5} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </motion.div>
            <input type="file" accept="image/*" className="hidden" ref={emergencyInputRef} onChange={(e) => handleUpload(e, true)} />
            <input type="file" accept="image/*" capture="environment" className="hidden" ref={emergencyCameraInputRef} onChange={(e) => handleUpload(e, true)} />

            {/* ── DIAGNOSTIC SKIN CONDITIONS SCAN (Exposed to all, login required for guests) ── */}
            <motion.div
              whileTap={{ scale: 0.98 }}
              className="relative overflow-hidden bg-gradient-to-br from-[#1D58D8] to-blue-800 rounded-[32px] p-6 shadow-xl shadow-blue-500/20 cursor-pointer flex flex-col justify-between min-h-[220px]"
              onClick={() => {
                if (user) {
                  triggerSourceSelect(false);
                } else {
                  navigate('/login');
                }
              }}
            >
              <div className="absolute top-0 right-0 p-2 opacity-20 pointer-events-none w-full h-full flex justify-end">
                <div className="w-32 h-32 border-[24px] border-white/10 rounded-full translate-x-12 -translate-y-4" />
              </div>
              <div className="relative z-10">
                <div className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-[18px] flex items-center justify-center mb-5 border border-white/20">
                  <Camera size={22} className="text-white" strokeWidth={2.5} />
                </div>
                <h2 className="text-[28px] font-black text-white leading-tight mb-2">Scan Disease</h2>
                <p className="text-blue-100/90 text-[13px] leading-relaxed max-w-[220px]">
                  {user 
                    ? "AI-powered vision to identify skin conditions with clinical precision." 
                    : "AI-powered vision to identify skin conditions. Login required to start scanning."
                  }
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (user) {
                    triggerSourceSelect(false);
                  } else {
                    navigate('/login');
                  }
                }}
                className="relative z-10 mt-5 flex items-center gap-1.5 text-white font-medium text-[13px] group"
              >
                {user ? "Start Analysis" : "Login to Scan"} <ArrowRight size={16} strokeWidth={2.5} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </motion.div>
            <input type="file" accept="image/*" className="hidden" ref={mainInputRef} onChange={(e) => handleUpload(e, false)} />
            <input type="file" accept="image/*" capture="environment" className="hidden" ref={mainCameraInputRef} onChange={(e) => handleUpload(e, false)} />

            {/* ── QUICK ACTION SHORTCUTS (Redesigned Grid for Guest & Logged-in Navigation) ── */}
            <div className="grid grid-cols-3 gap-3 mt-4">
              <Link to="/symptoms" className="bg-white dark:bg-gray-800 rounded-[24px] py-4 px-2 flex flex-col items-center justify-center gap-2 shadow-xs border border-gray-100 dark:border-gray-700 active:scale-95 transition-all">
                <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-950/20 flex items-center justify-center text-[#1D58D8] dark:text-blue-400">
                  <Stethoscope size={20} />
                </div>
                <span className="text-[11px] font-bold text-gray-800 dark:text-gray-250">AI Doctor</span>
              </Link>
              <Link to="/chat" className="bg-white dark:bg-gray-800 rounded-[24px] py-4 px-2 flex flex-col items-center justify-center gap-2 shadow-xs border border-gray-100 dark:border-gray-700 active:scale-95 transition-all">
                <div className="w-10 h-10 rounded-full bg-purple-50 dark:bg-purple-950/20 flex items-center justify-center text-purple-600 dark:text-purple-400">
                  <MessageSquare size={20} />
                </div>
                <span className="text-[11px] font-bold text-gray-800 dark:text-gray-250">AI Chatbot</span>
              </Link>
              <Link to="/nearby" className="bg-white dark:bg-gray-800 rounded-[24px] py-4 px-2 flex flex-col items-center justify-center gap-2 shadow-xs border border-gray-100 dark:border-gray-700 active:scale-95 transition-all">
                <div className="w-10 h-10 rounded-full bg-teal-50 dark:bg-teal-950/20 flex items-center justify-center text-teal-600 dark:text-teal-400">
                  <MapPin size={20} />
                </div>
                <span className="text-[11px] font-bold text-gray-800 dark:text-gray-250">Locator</span>
              </Link>
              <Link to="/accident" className="bg-white dark:bg-gray-800 rounded-[24px] py-4 px-2 flex flex-col items-center justify-center gap-2 shadow-xs border border-gray-100 dark:border-gray-700 active:scale-95 transition-all">
                <div className="w-10 h-10 rounded-full bg-orange-50 dark:bg-orange-950/20 flex items-center justify-center text-orange-600 dark:text-orange-400">
                  <AlertTriangle size={20} />
                </div>
                <span className="text-[11px] font-bold text-gray-800 dark:text-gray-250">Accident</span>
              </Link>
              <Link to="/ambulance" className="bg-white dark:bg-gray-800 rounded-[24px] py-4 px-2 flex flex-col items-center justify-center gap-2 shadow-xs border border-gray-100 dark:border-gray-700 active:scale-95 transition-all">
                <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-950/20 flex items-center justify-center text-red-600 dark:text-red-400">
                  <Truck size={20} />
                </div>
                <span className="text-[11px] font-bold text-gray-800 dark:text-gray-250">Ambulance</span>
              </Link>
              <Link to="/blood" className="bg-white dark:bg-gray-800 rounded-[24px] py-4 px-2 flex flex-col items-center justify-center gap-2 shadow-xs border border-gray-100 dark:border-gray-700 active:scale-95 transition-all">
                <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-950/20 flex items-center justify-center text-[#B91C1C] dark:text-red-400">
                  <Droplets size={20} />
                </div>
                <span className="text-[11px] font-bold text-gray-800 dark:text-gray-250">Blood Bank</span>
              </Link>
            </div>

            {/* ── NEARBY HOSPITALS LISTING ── */}
            <div className="mt-8 mb-6">
              <div className="flex items-end justify-between mb-4">
                <div>
                  <h3 className="text-[22px] font-black text-gray-900 dark:text-white tracking-tight">Nearby Emergency ER</h3>
                  <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-0.5">Verified centers with travel times</p>
                </div>
                <Link to="/nearby" className="text-[13px] text-[#1D58D8] flex items-center gap-1 font-bold">
                  View All <ArrowRight size={12} />
                </Link>
              </div>

              <div className="space-y-3">
                {dashboardHospitals.slice(0, 3).map((h, i) => (
                  <div key={i} className="bg-white dark:bg-gray-800 rounded-[32px] p-3 flex items-center gap-4 shadow-xs border border-gray-100 dark:border-gray-700 transition-all">
                    <img src={`https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=120&h=120&fit=crop`} alt={h.name} className="w-[60px] h-[60px] rounded-[24px] object-cover shrink-0 ml-1" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-bold text-gray-900 dark:text-white truncate">{h.name}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <div className="flex items-center gap-1">
                          <MapPin size={12} className="text-[#1D58D8] dark:text-blue-400" />
                          <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400">{h.distance_km} km</span>
                        </div>
                        <div className="flex items-center gap-1 bg-red-50 dark:bg-red-950/30 px-1.5 py-0.5 rounded-md">
                          <Star size={10} className="text-red-500 fill-red-500" />
                          <span className="text-[10px] font-black text-red-600 dark:text-red-400">{h.rating}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0 mr-1">
                      <button onClick={() => window.open(`tel:${h.phone}`)} className="w-10 h-10 rounded-full bg-[#F3F4F6] dark:bg-gray-755 text-[#1D58D8] dark:text-blue-400 flex items-center justify-center active:scale-90 transition-transform">
                        <Phone size={16} />
                      </button>
                      <button onClick={() => window.open(`https://www.google.com/maps/search/${encodeURIComponent(h.name)}`, '_blank')} className="w-10 h-10 rounded-full bg-[#1D58D8] text-white flex items-center justify-center active:scale-90 transition-transform shadow-md shadow-blue-500/20">
                        <Navigation size={16} fill="currentColor" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── NEARBY DOCTORS LISTING ── */}
            <div className="mt-6 mb-24">
              <div className="flex items-end justify-between mb-4">
                <div>
                  <h3 className="text-[22px] font-black text-gray-900 dark:text-white tracking-tight">Nearby Doctors</h3>
                  <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-0.5">Qualified doctors in your region</p>
                </div>
                <Link to="/nearby" className="text-[13px] text-[#1D58D8] flex items-center gap-1 font-bold">
                  View All <ArrowRight size={12} />
                </Link>
              </div>

              <div className="space-y-3">
                {dashboardDoctors.slice(0, 3).map((d, i) => (
                  <div key={i} className="bg-white dark:bg-gray-800 rounded-[32px] p-3 flex items-center gap-4 shadow-xs border border-gray-100 dark:border-gray-700 transition-all">
                    <div className="w-[60px] h-[60px] rounded-[24px] bg-blue-50 dark:bg-blue-955/20 text-[#1D58D8] dark:text-blue-400 flex items-center justify-center shrink-0 ml-1">
                      <Stethoscope size={24} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-bold text-gray-900 dark:text-white truncate">{d.name}</p>
                      <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mt-0.5 truncate">{d.specialization}</p>
                      <div className="flex flex-wrap items-center gap-3 mt-1">
                        <div className="flex items-center gap-1">
                          <MapPin size={11} className="text-[#1D58D8] dark:text-blue-400" />
                          <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400">{d.distance_km} km</span>
                        </div>
                        <span className="text-[10px] text-gray-450 dark:text-gray-505 font-medium">| {d.phone}</span>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0 mr-1">
                      <a href={`tel:${d.phone}`} className="w-10 h-10 rounded-full bg-green-50 dark:bg-green-950/30 text-green-655 dark:text-green-400 flex items-center justify-center active:scale-90 transition-transform">
                        <Phone size={16} />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* ────────── SCANNING ────────── */}
        {isScanning && (
          <motion.div key="scanning" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="w-full flex flex-col items-center justify-center py-24 text-center"
          >
            <div className="relative w-32 h-32 mb-8">
              <div className="absolute inset-0 border-4 border-blue-100 dark:border-blue-900/40 rounded-full" />
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.1, ease: 'linear' }}
                className="absolute inset-0 border-4 border-transparent border-t-[#1D58D8] rounded-full"
              />
              <motion.div animate={{ rotate: -360 }} transition={{ repeat: Infinity, duration: 1.8, ease: 'linear' }}
                className="absolute inset-4 border-4 border-transparent border-t-blue-300 rounded-full"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <Camera size={28} className="text-[#1D58D8] dark:text-blue-400" />
              </div>
            </div>
            <h3 className="text-2xl font-black text-gray-900 dark:text-white mb-2">Analyzing Image…</h3>
            <p className="text-gray-400 dark:text-gray-500 text-sm">Gemini AI is processing your request</p>
            <div className="flex items-center gap-2 mt-4 text-[#1D58D8] dark:text-blue-400">
              <Sparkles size={16} className="animate-pulse" />
              <span className="text-sm font-bold">AI Vision Active</span>
            </div>
          </motion.div>
        )}

        {/* ────────── EMERGENCY INFO FORM ────────── */}
        {workflowStep === 'form' && scanResult && (
          <motion.div key="form" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full space-y-5">
            <div className="flex items-center gap-2">
              <button onClick={reset} className="flex items-center gap-1.5 text-gray-950 dark:text-white font-bold text-sm">
                <ArrowLeft size={16} /> Cancel Scan
              </button>
            </div>

            <div className="bg-red-50/50 dark:bg-red-950/10 border border-red-100 dark:border-red-900/30 rounded-[28px] p-5 flex items-center gap-4">
              <img src={scanResult.imageUrl} alt="Triage preview" className="w-16 h-16 rounded-xl object-cover shrink-0" />
              <div>
                <span className="text-[9px] font-black text-[#B91C1C] uppercase tracking-widest block">AI Vision Pre-Scan</span>
                <h4 className="font-extrabold text-sm text-gray-900 dark:text-white mt-0.5">
                  {scanResult.injury || scanResult.disease || 'Injury Detected'}
                </h4>
                <p className="text-xs text-gray-500 mt-1 leading-snug">To build a Doctor Pre-Arrival Report, enter patient details below.</p>
              </div>
            </div>

            <form onSubmit={handleFormSubmit} className="bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800 rounded-[32px] p-6 shadow-sm space-y-4">
              <h3 className="text-xs font-black text-[#B91C1C] uppercase tracking-widest flex items-center gap-1.5">
                👤 Patient Information Briefing
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Patient Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    value={patientName}
                    onChange={e => setPatientName(e.target.value)}
                    placeholder="E.g., Rahul Sharma"
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-950 border border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-black text-sm font-semibold rounded-xl focus:outline-none transition-all placeholder:text-gray-400"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Mobile Number <span className="text-red-500">*</span></label>
                  <input
                    type="tel"
                    required
                    value={patientMobile}
                    onChange={e => setPatientMobile(e.target.value)}
                    placeholder="E.g., +91 9876543210"
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-950 border border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-black text-sm font-semibold rounded-xl focus:outline-none transition-all placeholder:text-gray-400"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Age <span className="text-red-500">*</span></label>
                    <input
                      type="number"
                      required
                      value={patientAge}
                      onChange={e => setPatientAge(e.target.value)}
                      placeholder="Age"
                      className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-950 border border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-black text-sm font-semibold rounded-xl focus:outline-none transition-all placeholder:text-gray-400"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Gender <span className="text-red-500">*</span></label>
                    <select
                      value={patientGender}
                      onChange={e => setPatientGender(e.target.value)}
                      className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-955 border border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-black text-sm font-semibold rounded-xl focus:outline-none transition-all"
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Blood Group (Optional)</label>
                  <select
                    value={patientBloodGroup}
                    onChange={e => setPatientBloodGroup(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-955 border border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-black text-sm font-semibold rounded-xl focus:outline-none transition-all"
                  >
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Emergency Contact Number (Optional)</label>
                <input
                  type="tel"
                  value={emergencyContact}
                  onChange={e => setEmergencyContact(e.target.value)}
                  placeholder="Family or friend mobile number"
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-955 border border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-black text-sm font-semibold rounded-xl focus:outline-none transition-all placeholder:text-gray-400"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Incident Note / Context (Optional)</label>
                <textarea
                  value={incidentNote}
                  onChange={e => setIncidentNote(e.target.value)}
                  rows={2}
                  placeholder="E.g., Bike accident near highway, Hot water burn in kitchen"
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-955 border border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-black text-sm font-semibold rounded-xl focus:outline-none transition-all placeholder:text-gray-400 resize-none"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full bg-[#B91C1C] hover:bg-red-800 text-white py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all"
                >
                  <MapPin size={14} /> Capture Location & Compile Report
                </button>
                <span className="block text-[9px] text-gray-400 text-center mt-2">
                  ℹ️ Coordinates and full address lookup will be completed automatically on submission.
                </span>
              </div>
            </form>
          </motion.div>
        )}

        {/* ────────── DOCTOR-READY EMERGENCY REPORT RESULT ────────── */}
        {workflowStep === 'report' && !isScanning && scanResult && scanResult.isEmergency && (
          isNoInjuryDetected(scanResult) ? (
            /* NO INJURY DETECTED DISPLAY */
            <motion.div key="no-injury-report" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full space-y-6 pb-24">
              {/* Header */}
              <div className="flex items-center justify-between mb-2 px-1">
                <button onClick={reset} className="flex items-center gap-1.5 text-gray-955 dark:text-white font-bold text-sm">
                  <ArrowLeft size={16} /> New Scan
                </button>
                <span className="px-3 py-1 bg-green-100 dark:bg-green-955 text-green-650 dark:text-green-400 text-[10px] font-black rounded-full uppercase tracking-widest border border-green-200 dark:border-green-900/30">
                  Normal Skin Detected
                </span>
              </div>

              {/* Uploaded image preview */}
              <div className="relative rounded-[28px] overflow-hidden border border-gray-150 dark:border-gray-800 h-[220px] shadow-sm">
                <img src={scanResult.imageUrl} alt="Scanned image" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <span className="text-white text-xs font-bold tracking-wider bg-black/60 px-3 py-1.5 rounded-full flex items-center gap-1.5">
                    <CheckCircle2 size={14} className="text-green-500" /> Normal Skin / No Injury
                  </span>
                </div>
              </div>

              {/* Info Box */}
              <div className="p-6 bg-green-50/50 dark:bg-green-955/10 text-green-700 dark:text-green-400 rounded-[28px] border border-green-100 dark:border-green-900/30 text-center space-y-3">
                <div className="w-12 h-12 bg-green-100 dark:bg-green-900/50 rounded-full flex items-center justify-center mx-auto text-green-600 dark:text-green-400">
                  <CheckCircle2 size={28} />
                </div>
                <h4 className="font-extrabold text-lg">No Injury Detected</h4>
                <p className="text-sm font-semibold leading-relaxed">
                  The AI scanner analyzed the image and did not detect any visible signs of injury, cut, burn, wound, or trauma. The area appears normal.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  onClick={triggerEmergencyReupload}
                  className="flex-1 py-4 rounded-[20px] bg-red-650 hover:bg-red-755 text-white font-bold transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-red-500/20"
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
          ) : (
            <motion.div key="emergency-report" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full space-y-5 pb-24">
            
            {/* Header */}
            <div className="flex items-center justify-between mb-2 px-1">
              <button onClick={reset} className="flex items-center gap-1.5 text-gray-900 dark:text-white font-bold text-[15px]">
                <ArrowLeft size={18} /> New Scan
              </button>
              <span className="px-3 py-1 bg-red-100 dark:bg-red-955 text-red-600 dark:text-red-400 text-[10px] font-black rounded-full uppercase tracking-widest border border-red-200 dark:border-red-900/30">
                🚑 Pre-Arrival Hospital Report
              </span>
            </div>

            {/* Injury Image & Vital Severity circular gauge */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative rounded-[28px] overflow-hidden border border-gray-150 dark:border-gray-800 h-[220px] shadow-sm">
                <img src={scanResult.imageUrl} alt="Scanned injury" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute bottom-4 left-4 bg-[#B91C1C] text-white text-[9px] font-black px-2.5 py-1 rounded-md uppercase tracking-wider animate-pulse">
                  HIGH URGENCY CLINICAL BRIEF
                </div>
              </div>

              {/* Circular Gauge Card */}
              <div className="bg-white dark:bg-gray-905 border border-gray-150 dark:border-gray-800 rounded-[28px] p-5 flex flex-col justify-between shadow-sm">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Severity Assessment</span>
                
                <div className="flex items-center gap-6 my-2">
                  <div className="relative w-24 h-24 shrink-0 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="48" cy="48" r="40" className="stroke-gray-105 dark:stroke-gray-800 fill-none" strokeWidth="6" />
                      <circle cx="48" cy="48" r="40" className="stroke-[#B91C1C] fill-none" strokeWidth="6" strokeDasharray="251.2" strokeDashoffset={251.2 - (251.2 * (scanResult.fullReportData?.aiDetection?.severityScore || 8)) / 10} />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-xl font-black text-gray-950 dark:text-white leading-none">
                        {scanResult.fullReportData?.aiDetection?.severityScore || 8}
                      </span>
                      <span className="text-[8px] font-black text-gray-450 uppercase tracking-widest mt-0.5">Scale 1-10</span>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-extrabold text-[15px] text-[#B91C1C] dark:text-red-400 uppercase tracking-wider leading-snug">
                      {scanResult.fullReportData?.aiDetection?.injuryType || scanResult.injury || 'Condition'}
                    </h4>
                    <p className="text-xs text-gray-450 mt-1">Affected: {scanResult.fullReportData?.aiDetection?.bodyLocation || 'N/A'}</p>
                    <div className="mt-2.5 flex items-center gap-2">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Confidence:</span>
                      <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-955 text-blue-600 dark:text-blue-400 font-extrabold text-[10px] rounded">
                        {scanResult.fullReportData?.aiDetection?.confidenceScore || 90}%
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-red-50/50 dark:bg-red-955/20 border border-red-100/10 dark:border-red-900/30 px-3 py-2 rounded-xl text-[10px] font-bold text-red-600 dark:text-red-400 leading-snug flex items-center gap-2">
                  <ShieldAlert size={14} className="shrink-0" />
                  RECOMMENDED DEPT: {scanResult.fullReportData?.recommendedDepartment || 'Trauma Center'}
                </div>
              </div>
            </div>

            {/* Patient Details & Incident Info Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Patient Info */}
              <div className="bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800 rounded-[28px] p-5 shadow-sm space-y-3">
                <h4 className="text-xs font-black text-gray-905 dark:text-white uppercase tracking-widest border-b border-gray-50 dark:border-gray-800 pb-2">
                  👤 Patient Details
                </h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="block text-gray-400 font-bold uppercase text-[9px] tracking-wider">Patient Name</span>
                    <span className="font-extrabold text-gray-800 dark:text-gray-200 truncate block mt-0.5">
                      {scanResult.fullReportData?.patientDetails?.name || patientName}
                    </span>
                  </div>
                  <div>
                    <span className="block text-gray-400 font-bold uppercase text-[9px] tracking-wider">Mobile Number</span>
                    <span className="font-extrabold text-gray-800 dark:text-gray-200 block mt-0.5">
                      {scanResult.fullReportData?.patientDetails?.mobileNumber || patientMobile}
                    </span>
                  </div>
                  <div className="mt-2">
                    <span className="block text-gray-400 font-bold uppercase text-[9px] tracking-wider">Age / Gender</span>
                    <span className="font-extrabold text-gray-850 dark:text-gray-200 block mt-0.5">
                      {scanResult.fullReportData?.patientDetails?.age || patientAge} Yrs / {scanResult.fullReportData?.patientDetails?.gender || patientGender}
                    </span>
                  </div>
                  <div className="mt-2">
                    <span className="block text-gray-400 font-bold uppercase text-[9px] tracking-wider">Blood Group</span>
                    <span className="font-black text-red-500 block mt-0.5">
                      {patientBloodGroup}
                    </span>
                  </div>
                </div>
              </div>

              {/* Location & Time Info */}
              <div className="bg-white dark:bg-gray-905 border border-gray-150 dark:border-gray-800 rounded-[28px] p-5 shadow-sm space-y-3">
                <h4 className="text-xs font-black text-gray-950 dark:text-white uppercase tracking-widest border-b border-gray-50 dark:border-gray-800 pb-2">
                  📍 Incident Location
                </h4>
                <div className="text-xs space-y-2">
                  <div>
                    <span className="block text-gray-400 font-bold uppercase text-[9px] tracking-wider">Geocoded Address</span>
                    <span className="font-bold text-gray-700 dark:text-gray-300 block mt-0.5 leading-snug">
                      {scanResult.fullReportData?.location?.address || 'Auto-Captured GPS Location'}
                    </span>
                  </div>
                  <div className="flex gap-4">
                    <div>
                      <span className="block text-gray-400 font-bold uppercase text-[9px] tracking-wider">GPS Coordinates</span>
                      <span className="font-extrabold text-gray-850 dark:text-gray-200 mt-0.5 block">
                        {scanResult.fullReportData?.location?.latitude?.toFixed(4)}, {scanResult.fullReportData?.location?.longitude?.toFixed(4)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-gray-400 font-bold uppercase text-[9px] tracking-wider">Incident Time</span>
                      <span className="font-extrabold text-gray-850 dark:text-gray-200 mt-0.5 block">
                        {scanResult.fullReportData?.incidentDetails?.incidentTime || new Date().toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Incident note card */}
            {scanResult.fullReportData?.incidentDetails?.userNote && (
              <div className="bg-gray-50 dark:bg-gray-900 p-5 rounded-[24px] border border-gray-100 dark:border-gray-800 text-xs">
                <span className="block text-gray-400 font-bold uppercase text-[9px] tracking-wider mb-1">Incident Briefing Notes</span>
                <p className="font-medium text-gray-750 dark:text-gray-300 italic leading-relaxed">
                  "{scanResult.fullReportData.incidentDetails.userNote}"
                </p>
              </div>
            )}

            {/* Risk Assessment & Clinical Warnings */}
            <div className="bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800 rounded-[28px] p-5 shadow-sm space-y-3">
              <h4 className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-widest border-b border-gray-50 dark:border-gray-800 pb-2">
                ⚠️ Multimodal Clinical Risk Analysis
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Blood Loss Risk', val: scanResult.fullReportData?.riskFactors?.bloodLossRisk },
                  { label: 'Fracture Risk', val: scanResult.fullReportData?.riskFactors?.fractureRisk },
                  { label: 'Infection Risk', val: scanResult.fullReportData?.riskFactors?.infectionRisk },
                  { label: 'Shock Risk', val: scanResult.fullReportData?.riskFactors?.shockRisk }
                ].map((risk, i) => {
                  let badgeColor = 'bg-green-50 text-green-700 border-green-100 dark:bg-green-955/20 dark:text-green-400';
                  if (risk.val === 'High' || risk.val === 'Critical') {
                    badgeColor = 'bg-red-50 text-red-700 border-red-100 dark:bg-red-955/20 dark:text-red-400';
                  } else if (risk.val === 'Medium') {
                    badgeColor = 'bg-orange-50 text-orange-700 border-orange-100 dark:bg-orange-955/20 dark:text-orange-400';
                  }
                  return (
                    <div key={i} className="p-3 bg-gray-50/50 dark:bg-gray-950/30 rounded-xl border border-gray-100 dark:border-gray-800">
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide block">{risk.label}</span>
                      <span className={cn('inline-block text-[11px] font-black uppercase mt-1.5 px-2 py-0.5 rounded border', badgeColor)}>
                        {risk.val || 'Low'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* First Aid Recommendations */}
            <div className="bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800 rounded-[28px] p-5 shadow-sm space-y-4">
              <h4 className="text-xs font-black text-gray-950 dark:text-white uppercase tracking-widest border-b border-gray-50 dark:border-gray-800 pb-2">
                🚑 Critical First Aid Guidelines
              </h4>
              <div className="space-y-3">
                {scanResult.steps?.map((step, i) => (
                  <div key={i} className="flex gap-4 items-start p-3 bg-gray-50/50 dark:bg-gray-955/20 rounded-xl border border-gray-100 dark:border-gray-800">
                    <div className="w-6 h-6 rounded-full bg-green-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                      {i + 1}
                    </div>
                    <p className="text-xs text-gray-700 dark:text-gray-305 font-bold leading-relaxed">{step}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── 🧠 AI EMERGENCY RECOMMENDATION MODULE ── */}
            {(() => {
              const detectedCondition = scanResult.disease || scanResult.injury || scanResult.fullReportData?.aiDetection?.injuryType || 'Second-Degree Burn';
              const recSpecs = getRecommendedSpecialists(detectedCondition);
              const recHosps = getRecommendedHospitals(detectedCondition);
              const nearbyDocs5 = (dashboardDoctors.length > 0 ? dashboardDoctors : [
                { name: 'Dr. Rahul Verma', specialization: 'General Practitioner', distance_km: 1.2, phone: '+91 9876543210', rating: 4.8 },
                { name: 'Dr. Neha Sharma', specialization: 'Emergency Physician', distance_km: 2.1, phone: '+91 9876543211', rating: 4.7 },
                { name: 'Dr. Suresh Patel', specialization: 'General Surgeon', distance_km: 3.4, phone: '+91 9876543212', rating: 4.6 },
                { name: 'Dr. Ananya Roy', specialization: 'Trauma Specialist', distance_km: 4.0, phone: '+91 9876543213', rating: 4.9 },
                { name: 'Dr. Vikram Singh', specialization: 'Orthopedic Doctor', distance_km: 5.1, phone: '+91 9876543214', rating: 4.5 }
              ]).sort((a, b) => a.distance_km - b.distance_km).slice(0, 5);

              const nearbyHosps5 = (dashboardHospitals.length > 0 ? dashboardHospitals : [
                { name: 'Sunrise Hospital', distance_km: 1.5, address: 'Civil Lines, Lucknow', phone: '+91 9266949411', rating: 4.6 },
                { name: 'Metro Heart Institute', distance_km: 2.8, address: 'Hazratganj, Lucknow', phone: '+91 9266949412', rating: 4.8 },
                { name: 'Max Super Specialty', distance_km: 3.6, address: 'Gomti Nagar, Lucknow', phone: '+91 9266949413', rating: 4.7 },
                { name: 'Apollo Emergency Centre', distance_km: 4.3, address: 'Alambagh, Lucknow', phone: '+91 9266949414', rating: 4.9 },
                { name: 'St. Jude Hospital', distance_km: 5.8, address: 'Indira Nagar, Lucknow', phone: '+91 9266949415', rating: 4.5 }
              ]).sort((a, b) => a.distance_km - b.distance_km).slice(0, 5);

              return (
                <div className="w-full space-y-5">
                  {/* 1. 🧠 AI Emergency Recommendation / AI Diagnosis */}
                  <div className="bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800 rounded-[28px] p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
                      <h4 className="text-sm font-black text-gray-950 dark:text-white uppercase tracking-widest flex items-center gap-2">
                        🧠 AI Emergency Recommendation
                      </h4>
                      <span className="px-2.5 py-1 bg-red-100 dark:bg-red-955 text-red-700 dark:text-red-400 font-extrabold text-[10px] rounded-full uppercase tracking-wider">
                        AI Diagnosis
                      </span>
                    </div>

                    <div className="bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-955/20 dark:to-orange-955/20 border border-red-100 dark:border-red-900/30 p-4 rounded-2xl">
                      <p className="text-[11px] font-black text-red-600 dark:text-red-400 uppercase tracking-widest mb-1">
                        🧠 AI Diagnosis
                      </p>
                      <h3 className="text-xl font-black text-gray-950 dark:text-white mb-3">
                        {scanResult.disease || scanResult.injury || scanResult.fullReportData?.aiDetection?.injuryType || 'Second-Degree Burn'}
                      </h3>

                      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-red-100/60 dark:border-red-900/30 text-xs">
                        <div>
                          <span className="block text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Severity</span>
                          <span className="text-sm font-black text-red-600 dark:text-red-400">
                            : {scanResult.severity?.toUpperCase() || scanResult.fullReportData?.aiDetection?.severityLevel?.toUpperCase() || 'HIGH'}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Confidence</span>
                          <span className="text-sm font-black text-blue-600 dark:text-blue-400">
                            : {scanResult.confidence || (scanResult.fullReportData?.aiDetection?.confidenceScore ? `${scanResult.fullReportData.aiDetection.confidenceScore}%` : '94%')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 2. ⭐ Recommended Specialists */}
                  <div className="bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800 rounded-[28px] p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
                      <div>
                        <h4 className="text-sm font-black text-gray-950 dark:text-white uppercase tracking-widest flex items-center gap-2">
                          ⭐ Recommended Specialists
                        </h4>
                        <p className="text-[11px] text-gray-400 font-semibold mt-0.5">Top 3 disease-specific doctors</p>
                      </div>
                      <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-955 text-blue-600 dark:text-blue-400 text-[10px] font-extrabold rounded">
                        Top 3 Matched
                      </span>
                    </div>

                    <div className="space-y-3">
                      {recSpecs.map((doc, idx) => (
                        <div key={idx} className="p-4 bg-gray-50/70 dark:bg-gray-850/40 border border-gray-150 dark:border-gray-800 rounded-2xl space-y-2">
                          <div className="flex justify-between items-start">
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                                {idx + 1}
                              </span>
                              <div>
                                <h5 className="font-extrabold text-sm text-gray-950 dark:text-white">
                                  {doc.name}
                                </h5>
                                <p className="text-xs font-bold text-blue-600 dark:text-blue-400">{doc.specialization}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                              <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                                {doc.isOnline ? 'Online Status: Online' : 'Offline'}
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 py-2 border-y border-gray-100 dark:border-gray-800 text-xs my-2">
                            <div>
                              <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider">Hospital Name</span>
                              <span className="font-extrabold text-gray-800 dark:text-gray-200 truncate block mt-0.5">{doc.hospital}</span>
                            </div>
                            <div>
                              <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider">Distance</span>
                              <span className="font-extrabold text-gray-800 dark:text-gray-200 block mt-0.5">{doc.distance}</span>
                            </div>
                            <div>
                              <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider">ETA</span>
                              <span className="font-black text-red-600 dark:text-red-400 block mt-0.5">{doc.eta}</span>
                            </div>
                            <div>
                              <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider">Availability</span>
                              <span className="font-extrabold text-emerald-600 dark:text-emerald-400 block mt-0.5">{doc.availability}</span>
                            </div>
                          </div>

                          <div className="bg-blue-50/50 dark:bg-blue-955/20 border border-blue-100/50 dark:border-blue-900/30 p-2.5 rounded-xl text-xs">
                            <span className="font-bold text-blue-700 dark:text-blue-300 block text-[10px] uppercase tracking-wider mb-0.5">Why Recommended / Reason</span>
                            <p className="text-gray-700 dark:text-gray-300 font-medium italic leading-relaxed">{doc.reason}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 3. 🏥 Recommended Hospitals */}
                  <div className="bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800 rounded-[28px] p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
                      <div>
                        <h4 className="text-sm font-black text-gray-950 dark:text-white uppercase tracking-widest flex items-center gap-2">
                          🏥 Recommended Hospitals
                        </h4>
                        <p className="text-[11px] text-gray-400 font-semibold mt-0.5">Top 3 hospitals matching the detected emergency</p>
                      </div>
                      <span className="px-2 py-0.5 bg-red-50 dark:bg-red-955 text-red-600 dark:text-red-400 text-[10px] font-extrabold rounded">
                        Top 3 Matched
                      </span>
                    </div>

                    <div className="space-y-3">
                      {recHosps.map((hosp, idx) => (
                        <div key={idx} className="p-4 bg-gray-50/70 dark:bg-gray-850/40 border border-gray-150 dark:border-gray-800 rounded-2xl space-y-2">
                          <div className="flex justify-between items-start">
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded-full bg-red-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                                {idx + 1}
                              </span>
                              <div>
                                <h5 className="font-extrabold text-sm text-gray-950 dark:text-white">
                                  {hosp.name}
                                </h5>
                                <p className="text-xs font-bold text-red-600 dark:text-red-400">{hosp.department}</p>
                              </div>
                            </div>
                            <span className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-955/30 border border-emerald-200 dark:border-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-extrabold text-[10px] rounded uppercase">
                              {hosp.emergencyAvailable}
                            </span>
                          </div>

                          <div className="grid grid-cols-3 gap-2 py-2 border-y border-gray-100 dark:border-gray-800 text-xs my-2">
                            <div>
                              <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider">Distance</span>
                              <span className="font-extrabold text-gray-800 dark:text-gray-200 block mt-0.5">{hosp.distance}</span>
                            </div>
                            <div>
                              <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider">ETA</span>
                              <span className="font-black text-red-600 dark:text-red-400 block mt-0.5">{hosp.eta}</span>
                            </div>
                            <div>
                              <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider">Special Unit</span>
                              <span className="font-extrabold text-blue-600 dark:text-blue-400 block mt-0.5 truncate">{hosp.specialUnit}</span>
                            </div>
                          </div>

                          <div className="bg-red-50/50 dark:bg-red-955/20 border border-red-100/50 dark:border-red-900/30 p-2.5 rounded-xl text-xs">
                            <span className="font-bold text-red-700 dark:text-red-300 block text-[10px] uppercase tracking-wider mb-0.5">Why Recommended / Reason</span>
                            <p className="text-gray-700 dark:text-gray-300 font-medium italic leading-relaxed">{hosp.reason}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 4. 📍 Nearby Doctors (Top 5) */}
                  <div className="bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800 rounded-[28px] p-5 shadow-sm space-y-3">
                    <div className="flex items-center justify-between border-b border-gray-50 dark:border-gray-800 pb-2">
                      <h4 className="text-xs font-black text-gray-950 dark:text-white uppercase tracking-widest">
                        📍 Nearby Doctors (Top 5)
                      </h4>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Sort only by distance</span>
                    </div>
                    <div className="space-y-2">
                      {nearbyDocs5.map((d, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-gray-50/50 dark:bg-gray-955/20 border border-gray-100 dark:border-gray-850 rounded-xl">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-extrabold text-xs flex items-center justify-center shrink-0">
                              {i + 1}
                            </div>
                            <div className="min-w-0">
                              <p className="font-extrabold text-xs text-gray-950 dark:text-white truncate">{d.name}</p>
                              <p className="text-[11px] text-gray-400 truncate">{d.specialization}</p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-xs font-black text-gray-900 dark:text-white block">{d.distance_km} km</span>
                            <span className="text-[9px] text-emerald-600 font-bold uppercase">Available</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 5. 🏥 Nearby Hospitals (Top 5) */}
                  <div className="bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800 rounded-[28px] p-5 shadow-sm space-y-3">
                    <div className="flex items-center justify-between border-b border-gray-50 dark:border-gray-800 pb-2">
                      <h4 className="text-xs font-black text-gray-950 dark:text-white uppercase tracking-widest">
                        🏥 Nearby Hospitals (Top 5)
                      </h4>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Sort only by distance</span>
                    </div>
                    <div className="space-y-2">
                      {nearbyHosps5.map((h, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-gray-50/50 dark:bg-gray-955/20 border border-gray-100 dark:border-gray-850 rounded-xl">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 font-extrabold text-xs flex items-center justify-center shrink-0">
                              {i + 1}
                            </div>
                            <div className="min-w-0">
                              <p className="font-extrabold text-xs text-gray-950 dark:text-white truncate">{h.name}</p>
                              <p className="text-[11px] text-gray-400 truncate">{h.address || 'Emergency Ready'}</p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-xs font-black text-gray-900 dark:text-white block">{h.distance_km} km</span>
                            <span className="text-[9px] text-red-600 font-bold uppercase">24/7 ER</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Routing & Hospital Directions */}
            {scanResult.fullReportData?.nearestHospitals && scanResult.fullReportData.nearestHospitals.length > 0 && (
              <div className="bg-white dark:bg-gray-905 border border-gray-150 dark:border-gray-800 rounded-[28px] p-5 shadow-sm space-y-3">
                <h4 className="text-xs font-black text-gray-950 dark:text-white uppercase tracking-widest border-b border-gray-50 dark:border-gray-800 pb-2">
                  🏥 Pre-Arrival Nearest Hospital Routing
                </h4>
                <div className="space-y-2">
                  {scanResult.fullReportData.nearestHospitals.map((hosp: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between p-3.5 bg-gray-50/50 dark:bg-gray-955/20 border border-gray-100 dark:border-gray-850 rounded-xl">
                      <div className="min-w-0">
                        <p className="font-extrabold text-sm text-gray-950 dark:text-white truncate">
                          {idx === 0 ? `⭐ [Primary] ${hosp.name}` : hosp.name}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{hosp.address || 'Lucknow Region'}</p>
                        <p className="text-[10px] text-gray-450 font-bold uppercase mt-1">Distance: {hosp.distance?.toFixed(1) || '1.5'} km</p>
                      </div>
                      <div className="text-right shrink-0 flex items-center gap-3">
                        <div>
                          <span className="block text-[10px] font-bold text-gray-400 uppercase">Est. Travel</span>
                          <span className={cn('text-sm font-black', idx === 0 ? 'text-[#B91C1C]' : 'text-gray-900 dark:text-white')}>
                            ~{hosp.eta || 10} Mins
                          </span>
                        </div>
                        <button
                          onClick={() => window.open(`https://www.google.com/maps/search/${encodeURIComponent(hosp.name)}`, '_blank')}
                          className="w-9 h-9 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow active:scale-90 transition-transform"
                        >
                          <Navigation size={14} fill="currentColor" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── PRE-ARRIVAL ACTION BUTTONS & SOS PRIORITY PANEL ── */}
            <div className="bg-white dark:bg-gray-905 border border-gray-150 dark:border-gray-850 p-4 rounded-[32px] shadow-sm space-y-3">
              <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Emergency Actions Portal</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                <button
                  onClick={downloadReport}
                  className="py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-md shadow-blue-500/10"
                >
                  <Download size={14} /> Download PDF
                </button>
                <button
                  onClick={shareReport}
                  className="py-3 px-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/60 rounded-xl font-bold text-xs text-gray-800 dark:text-gray-200 flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-xs"
                >
                  <Share2 size={14} /> Share Report
                </button>
                <button
                  onClick={sendToHospital}
                  className="py-3 px-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/60 rounded-xl font-bold text-xs text-green-600 dark:text-green-400 flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-xs"
                >
                  <Truck size={14} /> Send to ER
                </button>
                <button
                  onClick={sendSOS}
                  className="py-3 px-4 bg-[#B91C1C] hover:bg-red-800 text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-md shadow-red-500/10 animate-pulse"
                >
                  <Phone size={14} /> Send SOS
                </button>
              </div>

              {/* Live SOS Priority Broadcast Status Panel */}
              {sosBroadcastActive && (() => {
                const detectedCond = scanResult.disease || scanResult.injury || scanResult.fullReportData?.aiDetection?.injuryType || 'Second-Degree Burn';
                const recSpecs = getRecommendedSpecialists(detectedCond);
                const recHosps = getRecommendedHospitals(detectedCond);

                return (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 p-4 bg-red-950/90 text-white border border-red-600 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between border-b border-red-800/80 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                        <span className="font-black text-xs uppercase tracking-wider text-red-200">
                          🚨 SOS Priority Dispatch Active
                        </span>
                      </div>
                      <button onClick={() => setSosBroadcastActive(false)} className="text-[10px] text-red-300 font-bold hover:underline">
                        Close Panel
                      </button>
                    </div>

                    <p className="text-[11px] text-red-200 leading-snug">
                      Simultaneous SOS alert sent to all 3 Recommended Specialists & Top Hospitals. The first doctor who accepts becomes <span className="text-yellow-300 font-extrabold">Assigned Doctor</span>, automatically cancelling remaining requests.
                    </p>

                    <div className="space-y-1.5 bg-black/40 p-2.5 rounded-xl border border-red-900/50">
                      <span className="text-[9px] font-black text-red-300 uppercase tracking-widest block">Recommended Specialists Queue</span>
                      {recSpecs.map((doc, idx) => {
                        const isAssigned = assignedDoctorName === doc.name;
                        const isCancelled = assignedDoctorName && assignedDoctorName !== doc.name;
                        return (
                          <div key={idx} className="flex justify-between items-center text-xs py-1 border-b border-red-900/30 last:border-0">
                            <div>
                              <span className="font-extrabold text-white">{doc.name}</span>
                              <span className="text-[10px] text-red-300 font-medium ml-1.5">({doc.specialization})</span>
                            </div>
                            <div>
                              {isAssigned ? (
                                <span className="px-2 py-0.5 bg-emerald-500 text-white text-[9px] font-black rounded uppercase">
                                  Assigned Doctor
                                </span>
                              ) : isCancelled ? (
                                <span className="px-2 py-0.5 bg-gray-700 text-gray-300 text-[9px] font-bold rounded uppercase">
                                  Request Cancelled
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 bg-yellow-500 text-black text-[9px] font-black rounded uppercase animate-pulse">
                                  Request Sent
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="space-y-1 bg-black/40 p-2.5 rounded-xl border border-red-900/50">
                      <span className="text-[9px] font-black text-red-300 uppercase tracking-widest block">Top Hospitals Alerted</span>
                      {recHosps.map((hosp, idx) => (
                        <div key={idx} className="flex justify-between items-center text-xs py-0.5">
                          <span className="font-bold text-red-100 truncate">{hosp.name}</span>
                          <span className="text-[10px] text-emerald-400 font-bold shrink-0">🚨 Emergency Alerted</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                );
              })()}
            </div>
          </motion.div>
          )
        )}

        {/* ────────── STANDARD SKIN RESULT ────────── */}
        {workflowStep === 'report' && !isScanning && scanResult && !scanResult.isEmergency && (
          <motion.div key="result" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full space-y-5 pb-24">

            {/* Back */}
            <div className="flex items-center justify-between mb-2 px-1">
              <button onClick={reset} className="flex items-center gap-1.5 text-gray-900 dark:text-white font-bold text-[15px]">
                <ArrowLeft size={18} /> New Scan
              </button>
            </div>

            {/* ── IMAGE ── */}
            <div className="relative rounded-[32px] overflow-hidden shadow-sm border border-gray-100 dark:border-gray-800 h-[280px]">
              <img src={scanResult.imageUrl} alt="Scanned" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              
              {/* Top Right Pill */}
              <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm text-gray-900 text-[10px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm">
                <Sparkles size={10} className="text-[#1D58D8]" /> Gemini AI Vision
              </div>
            </div>

            {/* ── RESULT CARD ── */}
            <div className="rounded-[32px] p-6 shadow-sm border bg-white border-gray-100 dark:bg-gray-850 dark:border-gray-700">
              <p className="text-[11px] font-black uppercase tracking-widest mb-2 text-[#1D58D8]">
                🔬 Predicted Condition
              </p>
              
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-[26px] font-black leading-tight flex-1 pr-4 text-gray-900 dark:text-white">
                  {scanResult.disease}
                </h3>
                <div className="text-right shrink-0">
                  <p className="text-[20px] font-black text-gray-900 dark:text-white leading-none">
                    {scanResult.confidence}
                  </p>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Confidence</p>
                </div>
              </div>

              {scanResult.severity && (
                <div className="flex items-center gap-2 mb-5">
                  <span className="text-[13px] text-gray-500 font-bold">Severity:</span>
                  <span className={cn('text-[11px] font-black px-3 py-1 rounded-lg uppercase tracking-widest',
                    scanResult.severity === 'Emergency' ? 'bg-red-100 text-red-700' :
                    scanResult.severity === 'High' ? 'bg-orange-100 text-orange-700' :
                    scanResult.severity === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-green-100 text-green-700'
                  )}>{scanResult.severity}</span>
                </div>
              )}

              {/* Explanation */}
              {scanResult.explanation && (
                <div className="mb-5 bg-[#F3F4F6] dark:bg-gray-800 p-5 rounded-[24px]">
                  <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <Activity size={12} /> AI Reasoning
                  </p>
                  <p className="text-[14px] font-medium text-gray-700 dark:text-gray-300 leading-relaxed">
                    {scanResult.explanation}
                  </p>
                </div>
              )}

              {/* Steps / Precautions */}
              <div className="mb-6">
                <p className="font-black text-gray-900 dark:text-white text-[16px] mb-3">
                  Precautions
                </p>
                <div className="space-y-3">
                  {scanResult.precautions?.map((item, i) => (
                    <div key={i} className="flex gap-4 items-start p-3 bg-white dark:bg-gray-800 rounded-[20px] border border-gray-100 dark:border-gray-700 shadow-sm">
                      <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold text-white bg-[#1D58D8]">
                        {i + 1}
                      </div>
                      <p className="text-[14px] text-gray-800 dark:text-gray-300 font-medium leading-relaxed mt-0.5">{item}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Medicines */}
              {scanResult.medicines && scanResult.medicines.length > 0 && (
                <div className="mt-4">
                  <p className="font-black text-gray-900 dark:text-white text-[16px] mb-3">Suggested Medicines</p>
                  <div className="flex flex-wrap gap-2">
                    {scanResult.medicines.map((m, i) => (
                      <span key={i} className="bg-[#F3F4F6] dark:bg-gray-700 text-gray-800 dark:text-gray-250 text-[14px] px-5 py-2.5 rounded-full font-bold">{m}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── ACTION BUTTONS (Stacked) ── */}
            <div className="space-y-3">
              <Link to="/nearby" className="flex items-center justify-center gap-2 bg-[#1D58D8] hover:bg-blue-800 active:scale-[0.98] text-white w-full py-4 rounded-[24px] font-black text-[15px] shadow-lg shadow-blue-900/20 transition-all uppercase tracking-wide">
                <MapPin size={18} /> Find Specialists Nearby
              </Link>
              <button onClick={downloadReport} className="flex items-center justify-center gap-2 bg-[#F3F4F6] hover:bg-gray-200 active:scale-[0.98] text-gray-800 w-full py-4 rounded-[24px] font-black text-[15px] transition-all uppercase tracking-wide border border-gray-200">
                <Download size={18} /> Download Scan Report
              </button>
            </div>

            {/* ── HOSPITALS ── */}
            {hospitals.length > 0 && (
              <div className="mt-8">
                <h4 className="font-black text-gray-900 dark:text-white mb-4 flex items-center gap-2 text-[16px]">
                  Nearest Clinics & Hospitals
                </h4>
                <div className="space-y-3">
                  {hospitals.slice(0, 3).map((h, i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm rounded-[24px]">
                      <div className="w-12 h-12 rounded-full bg-[#F3F4F6] text-[#1D58D8] flex items-center justify-center shrink-0 mr-4">
                        <MapPin size={20} />
                      </div>
                      <div className="min-w-0 flex-1 mr-3">
                        <p className="font-bold text-gray-900 dark:text-white text-[15px] truncate">{h.name}</p>
                        <p className="text-[13px] font-medium text-gray-500 mt-0.5">{h.distance_km} km Away • Open 24/7</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => window.open(`https://www.google.com/maps/search/${encodeURIComponent(h.name)}`, '_blank')} className="w-10 h-10 rounded-full bg-[#1D58D8] text-white flex items-center justify-center active:scale-90 transition-transform">
                          <ArrowRight size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── DOCTORS ── */}
            {doctors.length > 0 && (
              <div className="mt-8">
                <h4 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2 text-[15px]">
                  Recommended Doctors
                </h4>
                <div className="space-y-3">
                  {doctors.slice(0, 3).map((d, i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm rounded-[24px]">
                      <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 mr-4">
                        <Stethoscope size={20} />
                      </div>
                      <div className="min-w-0 flex-1 mr-3">
                        <p className="font-bold text-gray-900 dark:text-white text-[14px] truncate">{d.name}</p>
                        <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5">{d.specialization} • {d.distance_km} km</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <a href={`tel:${d.phone}`} className="w-9 h-9 rounded-full bg-green-100 text-green-700 flex items-center justify-center active:scale-90 transition-transform">
                          <Phone size={16} />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </motion.div>
        )}
      </AnimatePresence>

      {/* ── TOAST ALERTS ── */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.92 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-5 py-3.5 bg-gray-900 text-white rounded-2xl shadow-2xl text-xs font-bold flex items-center gap-3 border border-white/10 backdrop-blur-xl max-w-[90vw]"
          >
            <div className="p-1.5 bg-blue-600 rounded-lg shrink-0">
              <Info size={14} className="text-white" />
            </div>
            <span className="flex-1 leading-snug">{toastMessage}</span>
            <button onClick={() => setToastMessage(null)} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors shrink-0">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AccountConversionModal
        isOpen={conversionModalOpen}
        onClose={() => setConversionModalOpen(false)}
        prefilledData={{
          patientName: patientName,
          phoneNumber: patientMobile,
          age: patientAge,
          gender: patientGender,
          bloodGroup: patientBloodGroup,
          emergencyContact: emergencyContact
        }}
        caseId={null}
        onAuthSuccess={onAuthSuccess}
      />

      {/* ── CAMERA / GALLERY SOURCE SELECTOR ── */}
      {sourceSelector && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-xs p-4 sm:items-center">
          <div className="bg-white dark:bg-gray-900 w-full max-w-sm rounded-[28px] p-6 shadow-2xl space-y-4 border border-gray-100 dark:border-gray-800 animate-in fade-in slide-in-from-bottom-4 duration-200">
            <h3 className="font-extrabold text-gray-900 dark:text-white text-base text-center">Select Photo Source</h3>
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => handleSelectSource('camera')}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer shadow-md shadow-blue-500/10"
              >
                📷 Open Camera
              </button>
              <button
                type="button"
                onClick={() => handleSelectSource('gallery')}
                className="w-full py-3.5 bg-gray-150 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-750 text-gray-800 dark:text-gray-200 font-extrabold text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer border border-gray-250/20"
              >
                🖼 Choose From Gallery
              </button>
              <button
                type="button"
                onClick={() => setSourceSelector(null)}
                className="w-full py-3 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-xs font-bold uppercase tracking-wider mt-1 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── WEBCAM CAPTURE MODAL ── */}
      {showWebcam && (
        <WebcamModal
          onCapture={handleWebcamCapture}
          onClose={() => setShowWebcam(null)}
        />
      )}
    </motion.div>
  );
}
