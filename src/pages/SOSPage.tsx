import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Phone, MapPin, Loader2, CheckCircle, Clock, User, Shield, BriefcaseMedical, Navigation, Building2, Upload } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { io, Socket } from 'socket.io-client';
import { cn } from '../lib/utils';
import { API_BASE_URL } from '../config';
import AccountConversionModal from '../components/AccountConversionModal';

const SOCKET_URL = (import.meta as any).env?.VITE_API_URL || '/';
const API_BASE = API_BASE_URL;

type CaseStatus = 'idle' | 'locating' | 'sending' | 'pending' | 'accepted' | 'error';

export default function SOSPage({ user, onAuthSuccess }: { user: any; onAuthSuccess: (user: any) => void }) {
  const [status, setStatus] = useState<CaseStatus>('idle');
  const [description, setDescription] = useState('');
  const [patientName, setPatientName] = useState(user?.displayName || '');
  const [patientPhone, setPatientPhone] = useState('');
  const [emergencyType, setEmergencyType] = useState('General Medical');
  const [urgencyLevel, setUrgencyLevel] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('CRITICAL');
  const [caseId, setCaseId] = useState<string | null>(null);
  const [acceptedBy, setAcceptedBy] = useState<any>(null);
  const [doctorInfo, setDoctorInfo] = useState<any>(null);
  const [hospitalInfo, setHospitalInfo] = useState<any>(null);
  const [ambulanceInfo, setAmbulanceInfo] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [geo, setGeo] = useState<{ lat: number; lng: number; address: string } | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [escalationInfo, setEscalationInfo] = useState<any>(null);
  const [notifiedCount, setNotifiedCount] = useState({ doctors: 0, hospitals: 0 });
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [conversionModalOpen, setConversionModalOpen] = useState(false);

  // Generate guestSessionId if guest
  useEffect(() => {
    if (!user) {
      let gid = localStorage.getItem('guestSessionId');
      if (!gid) {
        const uuid = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : 'guest_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now().toString(36);
        localStorage.setItem('guestSessionId', uuid);
        console.log('[GUEST SESSION CREATED] generated guestSessionId:', uuid);
      } else {
        console.log('[GUEST SESSION RESTORED] guestSessionId:', gid);
      }
    }
  }, [user]);

  // Timer for pending state
  useEffect(() => {
    if (status !== 'pending') return;
    const interval = setInterval(() => setElapsedSeconds(p => p + 1), 1000);
    return () => clearInterval(interval);
  }, [status]);

  // Socket.io connection for patient tracking
  useEffect(() => {
    if (!caseId) return;

    const guestSessionId = localStorage.getItem('guestSessionId');
    const queryParams: any = {};
    if (user?.uid || user?.id) {
      queryParams.userId = user.uid || user.id;
    } else if (guestSessionId) {
      queryParams.guestSessionId = guestSessionId;
    }

    const sock = io(SOCKET_URL, { query: queryParams });
    setSocket(sock);

    sock.on('connect', () => {
      console.log('[GUEST SOCKET CONNECTED] Socket connected. caseId:', caseId);
      sock.emit('track_emergency', caseId);

      if (user?.uid || user?.id) {
        sock.emit('user:online', { userId: user.uid || user.id, role: 'user' });
        console.log('[PATIENT SOCKET ONLINE] emitted user:online with userId:', user.uid || user.id);
      } else if (guestSessionId) {
        sock.emit('user:online', { guestSessionId });
        console.log('[GUEST SOCKET ONLINE] emitted user:online with guestSessionId:', guestSessionId);
        console.log('[GUEST ROOM JOINED] guest_' + guestSessionId);
      }
    });

    sock.on('doctor_accepted', (data: any) => {
      console.log('[SOSPAGE RECEIVED] doctor_accepted:', data);
      setStatus('accepted');
      if (data.acceptedDoctor || data.doctor) {
        setDoctorInfo(data.acceptedDoctor || {
          doctorName: data.doctor?.name || data.doctorName,
          phone: data.doctor?.phone || data.phone,
          specialization: data.doctor?.specialization || data.specialization,
          hospitalName: data.hospital?.name || data.hospitalName,
          hospitalAddress: data.hospital?.address || data.hospitalAddress
        });
      }
      if (data.accepted_hospital || data.hospital) {
        setHospitalInfo(data.accepted_hospital || data.hospital);
      }
      if (data.accepted_ambulance || data.ambulance) {
        setAmbulanceInfo(data.accepted_ambulance || data.ambulance);
      }
    });

    sock.on('doctor:accepted', (data: any) => {
      console.log('[PATIENT NOTIFIED] doctor:accepted received. Payload:', data);
      setStatus('accepted');
      setDoctorInfo(data);
    });

    sock.on('doctor_request_accepted', (data: any) => {
      if (user?.uid || user?.id) {
        console.log('[PATIENT EVENT RECEIVED] doctor_request_accepted event payload:', data);
      } else {
        console.log('[GUEST EVENT RECEIVED] doctor_request_accepted event payload:', data);
      }

      setStatus('accepted');
      setDoctorInfo({
        doctorName: data.doctor?.name,
        phone: data.doctor?.phone,
        specialization: data.doctor?.specialization,
        hospitalName: data.hospital?.name,
        hospitalAddress: data.hospital?.address
      });
      if (data.hospital) {
        setHospitalInfo(data.hospital);
      }
      if (data.ambulance) {
        setAmbulanceInfo({
          driverName: data.ambulance.driver,
          driverPhone: data.ambulance.phone || '+91XXXXXXXXXX',
          vehicleNumber: data.ambulance.vehicle,
          distanceKm: data.ambulance.distanceKm || 'N/A',
          etaMinutes: data.ambulance.eta || '8 minutes',
          liveStatus: data.ambulance.status || 'Dispatched'
        });
      }
      console.log('[UI UPDATED] doctor_request_accepted processed successfully');
    });

    sock.on('sos:accepted', (data: any) => {
      setStatus('accepted');
      setAcceptedBy(data.accepted_by || data);
      if (data.doctorDetails) setDoctorInfo(data.doctorDetails);
      if (data.hospitalDetails) setHospitalInfo(data.hospitalDetails);
    });

    const handleAmbulanceAssigned = (data: any) => {
      console.log('[SOSPAGE RECEIVED] ambulance_assigned:', data);
      setAmbulanceInfo({
        driverName: data.driverName || data.ambulance?.driverName || data.ambulance?.name,
        driverPhone: data.driverPhone || data.ambulance?.driverPhone || data.ambulance?.phone,
        vehicleNumber: data.vehicleNumber || data.ambulance?.vehicleNumber,
        distanceKm: data.distanceKm,
        etaMinutes: data.etaMinutes || data.eta,
        liveStatus: data.liveStatus || 'Assigned'
      });
    };

    sock.on('ambulance_assigned', handleAmbulanceAssigned);
    sock.on('ambulance:assigned', handleAmbulanceAssigned);
    sock.on('sos:ambulance_assigned', (data: any) => {
      if (data.ambulance) setAmbulanceInfo(data.ambulance);
    });

    const handleAmbulanceStarted = (data: any) => {
      setAmbulanceInfo(prev => ({
        ...prev,
        distanceKm: data.distanceKm ?? prev?.distanceKm,
        etaMinutes: data.etaMinutes ?? prev?.etaMinutes,
        liveStatus: data.liveStatus || 'On Route'
      }));
    };

    sock.on('ambulance_started', handleAmbulanceStarted);
    sock.on('ambulance:location:update', handleAmbulanceStarted);
    sock.on('tracking:update', handleAmbulanceStarted);

    const handleAmbulanceArrived = (data: any) => {
      console.log('[SOSPAGE RECEIVED] ambulance_arrived:', data);
      setAmbulanceInfo(prev => ({
        ...prev,
        liveStatus: 'Arrived'
      }));
    };

    sock.on('ambulance_arrived', handleAmbulanceArrived);
    sock.on('ambulance:arrived', handleAmbulanceArrived);

    const handleHospitalAssigned = (data: any) => {
      console.log('[SOSPAGE RECEIVED] hospital_assigned:', data);
      if (data.accepted_hospital || data.hospital) {
        setHospitalInfo(data.accepted_hospital || data.hospital);
      }
    };

    sock.on('hospital_assigned', handleHospitalAssigned);
    sock.on('sos:hospital_assigned', handleHospitalAssigned);

    sock.on('case_completed', () => {
      console.log('[SOSPAGE RECEIVED] case_completed');
      localStorage.removeItem('guestSessionId');
      localStorage.removeItem('sos_case_id');
    });

    sock.on('sos:escalated', (data: any) => {
      setEscalationInfo(data);
    });

    sock.on('case:resolved', () => {
      localStorage.removeItem('guestSessionId');
      localStorage.removeItem('sos_case_id');
      console.log('[GUEST MIGRATION COMPLETED] guestSessionId cleared on resolution');
    });

    // ── Patient Live Location Broadcast ──
    let patientWatchId: number | null = null;
    let lastPatientLoc: { lat: number; lng: number } | null = null;

    if ('geolocation' in navigator) {
      console.log('[GPS STARTED] Patient location watcher initiated on SOSPage for caseId:', caseId);
      patientWatchId = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords;
          
          // Ignore movement under 10 meters
          if (lastPatientLoc) {
            const R = 6371000;
            const dLat = (latitude - lastPatientLoc.lat) * Math.PI / 180;
            const dLng = (longitude - lastPatientLoc.lng) * Math.PI / 180;
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                      Math.cos(lastPatientLoc.lat * Math.PI / 180) * Math.cos(latitude * Math.PI / 180) *
                      Math.sin(dLng / 2) * Math.sin(dLng / 2);
            const delta = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            if (delta < 10) return;
          }

          lastPatientLoc = { lat: latitude, lng: longitude };

          if (sock.connected) {
            const payload = { caseId, lat: latitude, lng: longitude, accuracy, timestamp: Date.now() };
            console.log('[PATIENT LOCATION UPDATED] Emitting patient:location:update:', payload);
            sock.emit('patient:location:update', payload);
          }
        },
        (err) => console.warn('[GPS ERROR] Patient location watch error:', err.message),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }

    return () => {
      sock.close();
      if (patientWatchId !== null) navigator.geolocation.clearWatch(patientWatchId);
    };
  }, [caseId]);

  // Get location
  const getLocation = useCallback((): Promise<{ lat: number; lng: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        err => reject(err),
        { enableHighAccuracy: true, timeout: 15000 }
      );
    });
  }, []);

  // Trigger SOS
  const triggerSOS = async () => {
    console.log('[SOS] Button Clicked');
    if (!patientName.trim()) {
      setErrorMsg('Patient name is required.');
      return;
    }
    if (!patientPhone.trim()) {
      setErrorMsg('Phone number is required.');
      return;
    }

    setStatus('locating');
    setErrorMsg('');
    setElapsedSeconds(0);

    try {
      const coords = await getLocation();
      let resolvedAddress = '';

      // Try reverse geocode using immediate local variables
      try {
        const geoRes = await fetch(`${API_BASE}/api/location/reverse-geocode?latitude=${coords.lat}&longitude=${coords.lng}`);
        if (geoRes.ok) {
          const geoData = await geoRes.json();
          if (geoData.success && geoData.location?.display_name) {
            resolvedAddress = geoData.location.display_name;
          }
        }
      } catch (e) {
        console.warn('Reverse geocode failed:', e);
      }

      setGeo({ ...coords, address: resolvedAddress });
      setStatus('sending');

      const formData = new FormData();
      formData.append('userId', user?.uid || user?.id || 'anonymous');
      const guestSessionId = localStorage.getItem('guestSessionId');
      if (guestSessionId) {
        formData.append('guestSessionId', guestSessionId);
      }
      formData.append('patientName', patientName);
      formData.append('patient_phone', patientPhone);
      formData.append('lat', coords.lat.toString());
      formData.append('lng', coords.lng.toString());
      formData.append('emergencyDescription', description);
      formData.append('injuryType', emergencyType);
      formData.append('severity', urgencyLevel);
      formData.append('patient_location_address', resolvedAddress);
      if (photo) {
        formData.append('photo', photo);
      }

      console.log('[SOS] Request Sent');
      const res = await fetch(`${API_BASE}/api/sos/create`, {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      console.log('[SOS] Response Received', data);
      if (!data.success) throw new Error(data.error || 'Failed to create SOS.');

      setCaseId(data.caseId);
      setNotifiedCount({ doctors: data.notifiedDoctors || 0, hospitals: data.notifiedHospitals || 0 });
      setStatus('pending');

      if (!user) {
        setConversionModalOpen(true);
      }

    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message || 'Failed to send SOS. Please try again.');
    }
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const getRelativeTime = (timeStr: string | Date) => {
    if (!timeStr) return '';
    const diffMs = new Date().getTime() - new Date(timeStr).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins === 1) return '1 minute ago';
    return `${diffMins} minutes ago`;
  };

  const emergencyTypes = [
    'General Medical',
    'Cardiac Arrest',
    'Severe Bleeding / Trauma',
    'Difficulty Breathing',
    'Loss of Consciousness',
    'Accident / Collision',
    'Severe Burn',
    'Allergic Reaction',
    'Other Urgent Condition'
  ];

  return (
    <div className="space-y-4">
      {/* ─── IDLE / FORM ─────────────────────────────────────────────── */}
      {(status === 'idle' || status === 'error') && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {/* Title card */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-red-600 to-rose-600 px-5 py-5 text-center">
              <div className="w-14 h-14 mx-auto bg-white/20 rounded-2xl flex items-center justify-center mb-3">
                <AlertTriangle size={28} className="text-white" />
              </div>
              <h1 className="text-xl font-black text-white">Emergency SOS</h1>
              <p className="text-red-100 text-sm mt-1">Send immediate alert to nearby doctors & hospitals</p>
            </div>

            <div className="px-5 py-5 space-y-3.5">
              {errorMsg && (
                <div className="p-3 bg-red-50 dark:bg-red-950/20 text-red-700 rounded-xl text-xs font-bold flex items-center gap-2">
                  <AlertTriangle size={14} />{errorMsg}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Your Name</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3.5 text-gray-400" size={16} />
                  <input type="text" value={patientName} onChange={e => setPatientName(e.target.value)} placeholder="Full Name"
                    className="w-full pl-11 pr-4 py-3.5 bg-gray-50 dark:bg-gray-900 border border-transparent focus:border-red-500 rounded-2xl text-sm font-semibold focus:outline-none transition-all placeholder:text-gray-400" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-3.5 text-gray-400" size={16} />
                  <input type="tel" value={patientPhone} onChange={e => setPatientPhone(e.target.value)} placeholder="+91 9876543210"
                    className="w-full pl-11 pr-4 py-3.5 bg-gray-50 dark:bg-gray-900 border border-transparent focus:border-red-500 rounded-2xl text-sm font-semibold focus:outline-none transition-all placeholder:text-gray-400" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Emergency Type</label>
                <select value={emergencyType} onChange={e => setEmergencyType(e.target.value)}
                  className="w-full px-4 py-3.5 bg-gray-50 dark:bg-gray-900 border border-transparent focus:border-red-500 rounded-2xl text-sm font-semibold focus:outline-none transition-all cursor-pointer">
                  {emergencyTypes.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Urgency Level</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map(lvl => (
                    <button key={lvl} type="button" onClick={() => setUrgencyLevel(lvl)}
                      className={cn("py-2.5 rounded-xl text-xs font-bold transition-all border",
                        urgencyLevel === lvl
                          ? lvl === 'CRITICAL' ? "bg-red-500 text-white border-red-500 shadow-md shadow-red-500/20"
                            : lvl === 'HIGH' ? "bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-500/20"
                            : lvl === 'MEDIUM' ? "bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/20"
                            : "bg-blue-500 text-white border-blue-500 shadow-md shadow-blue-500/20"
                          : "bg-gray-50 dark:bg-gray-900 text-gray-400 border-transparent hover:bg-gray-100 dark:hover:bg-gray-800")}>
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Emergency Description (optional)</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the emergency situation..."
                  rows={3}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-transparent focus:border-red-500 rounded-2xl text-sm font-semibold focus:outline-none transition-all placeholder:text-gray-400 resize-none" />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Emergency Photo</label>
                <div className="flex items-center gap-3">
                  <input type="file" accept="image/*" onChange={e => {
                    const file = e.target.files?.[0] || null;
                    setPhoto(file);
                    if (file) {
                      setPhotoPreview(URL.createObjectURL(file));
                    } else {
                      setPhotoPreview(null);
                    }
                  }} className="hidden" id="sos-photo-input" />
                  <label htmlFor="sos-photo-input" className="px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-dashed border-gray-200 dark:border-gray-800 hover:border-red-500 dark:hover:border-red-500 rounded-2xl text-xs font-bold text-gray-500 dark:text-gray-400 cursor-pointer transition-all flex items-center gap-2">
                    <Upload size={14} /> Choose Photo
                  </label>
                  {photoPreview && (
                    <div className="w-12 h-12 rounded-xl overflow-hidden border border-gray-100 dark:border-gray-800 relative">
                      <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                      <button type="button" onClick={() => { setPhoto(null); setPhotoPreview(null); }} className="absolute inset-0 bg-black/50 text-white flex items-center justify-center text-[10px] font-bold">Remove</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* SOS Button */}
          <button onClick={triggerSOS}
            className="w-full py-5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-black text-lg rounded-2xl flex items-center justify-center gap-3 active:scale-[0.97] transition-all shadow-2xl shadow-red-500/30">
            <AlertTriangle size={24} />
            SEND SOS ALERT
          </button>
        </motion.div>
      )}

      {/* ─── LOCATING / SENDING ──────────────────────────────────────── */}
      {(status === 'locating' || status === 'sending') && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16 space-y-4">
          <div className="w-16 h-16 mx-auto bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
            <Loader2 size={32} className="text-red-500 animate-spin" />
          </div>
          <p className="text-lg font-bold text-gray-900 dark:text-white">
            {status === 'locating' ? 'Acquiring GPS Location...' : 'Dispatching SOS Alert...'}
          </p>
          <p className="text-sm text-gray-400">Please wait, this won't take long.</p>
        </motion.div>
      )}

      {/* ─── PENDING ─────────────────────────────────────────────────── */}
      {status === 'pending' && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-amber-200 dark:border-amber-900/40 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-4 text-center">
              <div className="w-12 h-12 mx-auto bg-white/20 rounded-xl flex items-center justify-center mb-2">
                <Clock size={24} className="text-white" />
              </div>
              <h2 className="text-lg font-black text-white">Waiting for Response</h2>
              <p className="text-amber-100 text-xs font-semibold mt-1">SOS alert sent to nearby responders</p>
            </div>

            <div className="px-5 py-4 space-y-3">
              {/* Timer */}
              <div className="text-center">
                <span className="text-3xl font-mono font-black text-gray-900 dark:text-white">{formatTime(elapsedSeconds)}</span>
                <p className="text-xs text-gray-400 mt-1">Elapsed time</p>
              </div>

              {/* Notified count */}
              <div className="flex gap-3">
                <div className="flex-1 bg-emerald-50 dark:bg-emerald-900/15 rounded-xl px-3 py-2.5 text-center">
                  <BriefcaseMedical size={18} className="mx-auto text-emerald-500 mb-1" />
                  <p className="text-lg font-black text-emerald-600">{notifiedCount.doctors}</p>
                  <p className="text-[10px] font-bold text-emerald-500 uppercase">Doctors</p>
                </div>
                <div className="flex-1 bg-blue-50 dark:bg-blue-900/15 rounded-xl px-3 py-2.5 text-center">
                  <Building2 size={18} className="mx-auto text-blue-500 mb-1" />
                  <p className="text-lg font-black text-blue-600">{notifiedCount.hospitals}</p>
                  <p className="text-[10px] font-bold text-blue-500 uppercase">Hospitals</p>
                </div>
              </div>

              {/* Escalation info */}
              {escalationInfo && (
                <div className="bg-amber-50 dark:bg-amber-900/10 rounded-xl px-3 py-2 border border-amber-100 dark:border-amber-900/30">
                  <p className="text-xs font-bold text-amber-600">🔄 Search expanded (Level {escalationInfo.escalation_level})</p>
                  <p className="text-xs text-gray-500 mt-0.5">+{escalationInfo.additionalDoctors} doctors, +{escalationInfo.additionalHospitals} hospitals notified</p>
                </div>
              )}

              {/* Pulsing indicator */}
              <div className="flex items-center justify-center gap-2 py-2">
                <div className="w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse" />
                <span className="text-xs font-semibold text-gray-500">Broadcasting to responders...</span>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ─── ACCEPTED ────────────────────────────────────────────────── */}
      {status === 'accepted' && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-emerald-200 dark:border-emerald-900/40 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-500 to-green-600 px-5 py-5 text-center">
              <div className="w-14 h-14 mx-auto bg-white/20 rounded-2xl flex items-center justify-center mb-2">
                <CheckCircle size={28} className="text-white" />
              </div>
              <h2 className="text-xl font-black text-white">Help is on the Way!</h2>
              <p className="text-emerald-100 text-sm mt-1">Your SOS has been accepted</p>
            </div>

            <div className="px-5 py-5 space-y-3">
              {(() => {
                const docName = doctorInfo?.doctorName || doctorInfo?.name || '';
                const docPhone = doctorInfo?.phone || '';
                const docSpec = doctorInfo?.specialization || 'Medical Specialist';
                const docHospital = doctorInfo?.hospitalName || doctorInfo?.hospital || '';
                const docDistance = doctorInfo?.distanceFromPatient ?? (doctorInfo?.distanceKm ? parseFloat(doctorInfo.distanceKm) : null);
                const docAcceptedAt = doctorInfo?.acceptedAt || null;

                return (
                  <>
                    {/* Doctor Accepted Success Card */}
                    {(doctorInfo || acceptedBy) && (
                      <div className="bg-emerald-50 dark:bg-emerald-900/15 border border-emerald-200 dark:border-emerald-900/40 rounded-2xl p-5 space-y-4">
                        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                          <BriefcaseMedical className="animate-bounce text-emerald-500" size={20} />
                          <h3 className="text-sm font-black uppercase tracking-wide">🩺 Doctor Accepted Your Emergency</h3>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Doctor Name</span>
                            <p className="font-extrabold text-sm text-slate-800 dark:text-slate-200 mt-0.5">
                              {docName}
                            </p>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Specialization</span>
                            <p className="font-bold text-slate-700 dark:text-slate-300 mt-0.5">
                              {docSpec}
                            </p>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Phone</span>
                            <p className="font-mono font-bold text-slate-700 dark:text-slate-300 mt-0.5">
                              {docPhone || 'N/A'}
                            </p>
                          </div>
                          {docHospital && (
                            <div>
                              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Hospital</span>
                              <p className="font-bold text-slate-700 dark:text-slate-300 mt-0.5">
                                {docHospital}
                              </p>
                            </div>
                          )}
                          {docDistance !== null && (
                            <div>
                              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Distance</span>
                              <p className="font-extrabold text-slate-800 dark:text-slate-200 mt-0.5">
                                {docDistance} km
                              </p>
                            </div>
                          )}
                          {docAcceptedAt && (
                            <div>
                              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Accepted</span>
                              <p className="font-semibold text-slate-600 dark:text-slate-400 mt-0.5">
                                {getRelativeTime(docAcceptedAt)}
                              </p>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2 pt-1.5">
                          {docPhone && (
                            <a href={`tel:${docPhone}`}
                              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1 shrink-0 shadow-sm active:scale-95 transition-all">
                              📞 Call Doctor
                            </a>
                          )}
                          {doctorInfo.hospitalAddress && (
                            <button
                              onClick={() => alert(`Hospital Address:\n${doctorInfo.hospitalAddress || 'Address not available'}`)}
                              className="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl flex items-center gap-1 active:scale-95 transition-all"
                            >
                              📍 View Hospital
                            </button>
                          )}
                          <Link to={`/tracker/${caseId}`}
                            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center gap-1 shrink-0 shadow-sm active:scale-95 transition-all">
                            🚑 Track Ambulance
                          </Link>
                        </div>
                      </div>
                    )}

                    {/* Hospital Card */}
                    {hospitalInfo && (
                      <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-900/15 rounded-xl">
                        <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center shrink-0">
                          <Building2 size={18} className="text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider mb-0.5">Receiving Hospital</p>
                          <p className="text-sm font-black text-gray-900 dark:text-white">{hospitalInfo.name}</p>
                          {hospitalInfo.address && <p className="text-xs text-gray-400 truncate">{hospitalInfo.address}</p>}
                          {hospitalInfo.distanceKm && <p className="text-xs text-blue-500 font-semibold">{hospitalInfo.distanceKm} km away</p>}
                        </div>
                        {hospitalInfo.phone && (
                          <a href={`tel:${hospitalInfo.phone}`}
                            className="px-3 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shrink-0 shadow-sm">
                            <Phone size={12} /> Call
                          </a>
                        )}
                      </div>
                    )}

                    {/* Ambulance Assigned Card */}
                    {ambulanceInfo ? (
                      <div className="bg-orange-50/50 dark:bg-orange-950/15 border border-orange-200/40 dark:border-orange-900/30 rounded-2xl p-5 space-y-4">
                        <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
                          <Navigation className="animate-pulse" size={20} />
                          <h3 className="text-sm font-black uppercase tracking-wide">🚑 Ambulance Assigned</h3>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Driver Name</span>
                            <p className="font-extrabold text-sm text-slate-800 dark:text-slate-200 mt-0.5">
                              {ambulanceInfo.driverName || ambulanceInfo.name || 'Ambulance Driver'}
                            </p>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Driver Phone</span>
                            <p className="font-mono font-bold text-slate-700 dark:text-slate-300 mt-0.5">
                              {ambulanceInfo.driverPhone || ambulanceInfo.phone || 'N/A'}
                            </p>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Vehicle Number</span>
                            <p className="font-mono font-extrabold text-slate-700 dark:text-slate-300 mt-0.5">
                              {ambulanceInfo.vehicleNumber || 'N/A'}
                            </p>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Distance Away</span>
                            <p className="font-extrabold text-slate-800 dark:text-slate-200 mt-0.5">
                              {ambulanceInfo.distanceKm !== undefined ? `${ambulanceInfo.distanceKm} km` : 'N/A'}
                            </p>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Estimated Arrival</span>
                            <p className="font-extrabold text-orange-600 dark:text-orange-400 mt-0.5">
                              {ambulanceInfo.etaMinutes !== undefined ? `${ambulanceInfo.etaMinutes} min` : (ambulanceInfo.eta ? `${ambulanceInfo.eta} min` : 'N/A')}
                            </p>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Live Status</span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="w-2 h-2 bg-orange-500 rounded-full animate-ping" />
                              <p className="font-black text-orange-600 dark:text-orange-400 uppercase tracking-wider text-[10px]">
                                {ambulanceInfo.liveStatus || 'Assigned'}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-2 pt-1.5">
                          {(ambulanceInfo.driverPhone || ambulanceInfo.phone) && (
                            <a href={`tel:${ambulanceInfo.driverPhone || ambulanceInfo.phone}`}
                              className="px-3.5 py-1.5 bg-orange-600 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shrink-0 shadow-sm active:scale-95 transition-all">
                              📞 Call Driver
                            </a>
                          )}
                          <Link to={`/tracker/${caseId}`}
                            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 active:scale-95 transition-all shadow-sm">
                            📍 Track Route
                          </Link>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 dark:bg-gray-800 rounded-xl">
                        <Loader2 size={14} className="text-gray-400 animate-spin" />
                        <span className="text-xs text-gray-400 font-semibold">Dispatching ambulance...</span>
                      </div>
                    )}
                  </>
                );
              })()}

              {/* View Live Tracker */}
              <Link to={`/tracker/${caseId}`}
                className="w-full py-3.5 bg-[#1D58D8] text-white font-black text-sm rounded-2xl flex items-center justify-center gap-2 hover:bg-blue-700 active:scale-[0.98] transition-all shadow-lg shadow-blue-500/20 mt-2">
                <Navigation size={16} /> View Live Tracker Map
              </Link>
            </div>
          </div>
        </motion.div>
      )}
      <AccountConversionModal
        isOpen={conversionModalOpen}
        onClose={() => setConversionModalOpen(false)}
        prefilledData={{
          patientName: patientName,
          phoneNumber: patientPhone,
          age: '',
          gender: '',
          bloodGroup: '',
          emergencyContact: ''
        }}
        caseId={caseId}
        onAuthSuccess={onAuthSuccess}
      />
    </div>
  );
}

const error = false; // Suppress TS unused warning
