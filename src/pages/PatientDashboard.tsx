import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Activity, User, Calendar, Phone, ShieldAlert, CheckCircle2,
  MapPin, Loader2, Download, Bell, Navigation, Heart, Info,
  Clock, ClipboardList, Check, Copy, Stethoscope, Building2
} from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '../config';

const SOCKET_URL = (import.meta as any).env?.VITE_API_URL || '/';

interface PatientDashboardProps {
  user: any;
}

export default function PatientDashboard({ user }: PatientDashboardProps) {
  const navigate = useNavigate();
  const [cases, setCases] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);

  // Load patient cases and notifications
  useEffect(() => {
    if (!user) return;
    
    const token = localStorage.getItem('helpaid_token');
    if (!token) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        const [casesRes, notifsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/sos/my-cases`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }),
          fetch(`${API_BASE_URL}/api/notifications`, {
            headers: { 'Authorization': `Bearer ${token}` }
          })
        ]);

        if (casesRes.ok) {
          const casesData = await casesRes.json();
          if (casesData.success) {
            setCases(casesData.cases || []);
          }
        }

        if (notifsRes.ok) {
          const notifsData = await notifsRes.json();
          if (notifsData.success) {
            setNotifications(notifsData.notifications || []);
          }
        }
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const pollInterval = setInterval(fetchData, 5000);
    return () => clearInterval(pollInterval);
  }, [user]);

  // Handle socket.io connection for the patient
  const activeCase = cases.find(c =>
    c.status !== 'RESOLVED' && c.status !== 'REJECTED'
  );

  useEffect(() => {
    if (!user) return;

    const sock = io(SOCKET_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
      transports: ['websocket', 'polling']
    });
    setSocket(sock);

    const userIdStr = user?.uid || user?.id || user?._id;

    sock.on('connect', () => {
      console.log('[PATIENT SOCKET CONNECTED]', sock.id);
      sock.emit('user:online', { userId: userIdStr, role: 'user' });
      if (activeCase?._id) {
        sock.emit('track_emergency', activeCase._id);
        console.log('[PATIENT SOCKET] tracking case:', activeCase._id);
      }
    });

    if (activeCase?._id && sock.connected) {
      sock.emit('track_emergency', activeCase._id);
    }

    const updateCasesState = (updater: (prevCase: any) => any, targetCaseId?: string) => {
      setCases(prevCases => prevCases.map(c => {
        const matches = targetCaseId ? c._id === targetCaseId : (activeCase?._id ? c._id === activeCase._id : true);
        return matches ? { ...c, ...updater(c) } : c;
      }));
    };

    // 1. doctor_accepted
    const handleDoctorAccepted = (data: any) => {
      console.log('[PATIENT DASHBOARD RECEIVED] doctor_accepted:', data);
      updateCasesState(prev => ({
        status: 'DOCTOR_ACCEPTED',
        acceptedDoctor: data.acceptedDoctor || {
          doctorName: data.doctor?.name || data.doctorName,
          phone: data.doctor?.phone || data.phone,
          specialization: data.doctor?.specialization || data.specialization,
          hospitalName: data.hospital?.name || data.hospitalName,
          hospitalAddress: data.hospital?.address || data.hospitalAddress
        },
        accepted_doctor: data.accepted_doctor || {
          doctorId: data.doctor?.id || data.doctorId,
          name: data.doctor?.name || data.doctorName,
          phone: data.doctor?.phone || data.phone,
          specialization: data.doctor?.specialization || data.specialization,
          hospital: data.hospital?.name || data.hospitalName
        },
        accepted_hospital: data.accepted_hospital || (data.hospital ? {
          hospitalId: data.hospital.id,
          name: data.hospital.name,
          phone: data.hospital.phone,
          address: data.hospital.address
        } : prev.accepted_hospital),
        accepted_ambulance: data.accepted_ambulance || (data.ambulance ? {
          driverName: data.ambulance.driver || data.ambulance.driverName,
          driverPhone: data.ambulance.phone || data.ambulance.driverPhone,
          vehicleNumber: data.ambulance.vehicle || data.ambulance.vehicleNumber,
          eta: data.ambulance.eta
        } : prev.accepted_ambulance)
      }), data.caseId);
      refreshNotifications();
    };

    sock.on('doctor_accepted', handleDoctorAccepted);
    sock.on('doctor:accepted', handleDoctorAccepted);
    sock.on('doctor_request_accepted', handleDoctorAccepted);
    sock.on('sos:accepted', handleDoctorAccepted);

    // 2. ambulance_assigned
    const handleAmbulanceAssigned = (data: any) => {
      console.log('[PATIENT DASHBOARD RECEIVED] ambulance_assigned:', data);
      updateCasesState(prev => ({
        status: 'AMBULANCE_ASSIGNED',
        accepted_ambulance: data.accepted_ambulance || {
          driverName: data.driverName || data.ambulance?.driverName || data.ambulance?.name,
          driverPhone: data.driverPhone || data.ambulance?.driverPhone || data.ambulance?.phone,
          vehicleNumber: data.vehicleNumber || data.ambulance?.vehicleNumber,
          vehicleType: data.vehicleType || data.ambulance?.vehicleType || 'Ambulance',
          eta: data.etaMinutes || data.eta || data.ambulance?.eta
        },
        etaMinutes: data.etaMinutes || data.eta || prev.etaMinutes,
        distanceKm: data.distanceKm || prev.distanceKm,
        liveStatus: data.liveStatus || 'Assigned'
      }), data.caseId);
      refreshNotifications();
    };

    sock.on('ambulance_assigned', handleAmbulanceAssigned);
    sock.on('ambulance:assigned', handleAmbulanceAssigned);
    sock.on('sos:ambulance_assigned', handleAmbulanceAssigned);

    // 3. ambulance_started
    const handleAmbulanceStarted = (data: any) => {
      console.log('[PATIENT DASHBOARD RECEIVED] ambulance_started / location update:', data);
      updateCasesState(prev => ({
        liveStatus: data.liveStatus || 'On Route',
        etaMinutes: data.etaMinutes ?? prev.etaMinutes,
        distanceKm: data.distanceKm ?? prev.distanceKm,
        accepted_ambulance: {
          ...(prev.accepted_ambulance || {}),
          liveStatus: data.liveStatus || 'On Route',
          eta: data.etaMinutes ?? prev.accepted_ambulance?.eta
        }
      }), data.caseId);
    };

    sock.on('ambulance_started', handleAmbulanceStarted);
    sock.on('ambulance:location:update', handleAmbulanceStarted);
    sock.on('tracking:update', handleAmbulanceStarted);

    // 4. ambulance_arrived
    const handleAmbulanceArrived = (data: any) => {
      console.log('[PATIENT DASHBOARD RECEIVED] ambulance_arrived:', data);
      updateCasesState(prev => ({
        liveStatus: 'Arrived',
        accepted_ambulance: {
          ...(prev.accepted_ambulance || {}),
          liveStatus: 'Arrived'
        }
      }), data.caseId);
      refreshNotifications();
    };

    sock.on('ambulance_arrived', handleAmbulanceArrived);
    sock.on('ambulance:arrived', handleAmbulanceArrived);

    // 5. hospital_assigned
    const handleHospitalAssigned = (data: any) => {
      console.log('[PATIENT DASHBOARD RECEIVED] hospital_assigned:', data);
      updateCasesState(prev => ({
        status: 'HOSPITAL_ACCEPTED',
        accepted_hospital: data.accepted_hospital || {
          hospitalId: data.hospital?.id || data.hospitalId,
          name: data.hospital?.name || data.hospitalName,
          phone: data.hospital?.phone || data.phone,
          address: data.hospital?.address || data.address
        }
      }), data.caseId);
      refreshNotifications();
    };

    sock.on('hospital_assigned', handleHospitalAssigned);
    sock.on('sos:hospital_assigned', handleHospitalAssigned);
    sock.on('hospital:accepted', handleHospitalAssigned);

    // 6. case_completed
    const handleCaseCompleted = (data: any) => {
      console.log('[PATIENT DASHBOARD RECEIVED] case_completed:', data);
      updateCasesState(prev => ({
        status: 'RESOLVED',
        liveStatus: 'Completed'
      }), data.caseId);
      refreshNotifications();
    };

    sock.on('case_completed', handleCaseCompleted);
    sock.on('tracking:completed', handleCaseCompleted);

    sock.on('sos:escalated', (data: any) => {
      updateCasesState(prev => ({
        status: 'ESCALATED',
        escalation_level: data.escalation_level || prev.escalation_level
      }), data.caseId);
      refreshNotifications();
    });

    // ── PATIENT LIVE LOCATION BROADCAST ──
    let locationWatchId: number | null = null;
    if ('geolocation' in navigator && activeCase?._id) {
      console.log('[GPS STARTED] Geolocation watcher initiated on Patient dashboard');
      locationWatchId = navigator.geolocation.watchPosition(
        (pos) => {
          const payload = {
            caseId: activeCase._id,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy
          };
          sock.emit('patient:location:update', payload);
        },
        (err) => {
          console.warn('[LIVE LOCATION] Patient location watch error:', err.message);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }

    return () => {
      sock.close();
      if (locationWatchId !== null) navigator.geolocation.clearWatch(locationWatchId);
    };
  }, [user, activeCase?._id]);

  const refreshNotifications = async () => {
    const token = localStorage.getItem('helpaid_token');
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/notifications`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const notifsData = await res.json();
        if (notifsData.success) {
          setNotifications(notifsData.notifications || []);
        }
      }
    } catch (err) {
      console.warn('Failed to refresh notifications:', err);
    }
  };

  const markAsRead = async (notifId: string) => {
    const token = localStorage.getItem('helpaid_token');
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/notifications/${notifId}/read`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (res.ok) {
        setNotifications(prev => prev.map(n => n._id === notifId ? { ...n, read: true } : n));
      }
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const markAllAsRead = async () => {
    const token = localStorage.getItem('helpaid_token');
    if (!token) return;
    const unread = notifications.filter(n => !n.read);
    try {
      await Promise.all(unread.map(n =>
        fetch(`${API_BASE_URL}/api/notifications/${n._id}/read`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        })
      ));
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const copyHelpAidId = () => {
    if (!user?.helpAidId) return;
    navigator.clipboard.writeText(user.helpAidId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadReport = async (emergencyCase: any) => {
    try {
      const token = localStorage.getItem('helpaid_token');
      const res = await fetch(`${API_BASE_URL}/api/download-emergency-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          caseId: emergencyCase._id,
          emergencyCase: emergencyCase,
          report: emergencyCase.reportData || {},
          image: emergencyCase.imageUrl || ''
        })
      });
      if (!res.ok) throw new Error('Failed to generate PDF');

      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `HelpAid_PreArrival_Report_${new Date(emergencyCase.createdAt).getTime()}.pdf`;
      a.click();
      URL.revokeObjectURL(downloadUrl);
    } catch (e) {
      console.error('PDF download failed:', e);
      alert('Failed to download report. Check backend service connectivity.');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <Loader2 size={36} className="text-blue-600 animate-spin" />
        <p className="text-sm font-semibold text-slate-500">Loading Patient Dashboard...</p>
      </div>
    );
  }

  // Formatting helpers
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const getRelativeTime = (timeStr: string | Date) => {
    if (!timeStr) return '';
    const diffMs = new Date().getTime() - new Date(timeStr).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins === 1) return '1 minute ago';
    return `${diffMins} minutes ago`;
  };

  // Determine active SOS tracker status text
  const getStatusDisplay = (status: string) => {
    switch (status.toUpperCase()) {
      case 'PENDING':
        return { label: 'Broadcasting Alert', color: 'text-amber-500 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/30' };
      case 'ACCEPTED':
      case 'DOCTOR_ACCEPTED':
        return { label: 'Medical Responder Accepted', color: 'text-blue-500 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/30' };
      case 'AMBULANCE_ASSIGNED':
        return { label: 'Ambulance En Route', color: 'text-orange-500 bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900/30' };
      case 'HOSPITAL_ACCEPTED':
        return { label: 'Destination Hospital Locked', color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/30' };
      case 'ESCALATED':
        return { label: 'Alert Escalated', color: 'text-red-500 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/30' };
      default:
        return { label: 'Responding', color: 'text-slate-500 bg-slate-50 dark:bg-slate-900/20 border-slate-200 dark:border-slate-800/30' };
    }
  };

  return (
    <div className="space-y-6">
      {/* ── HEADER & PROFILE CARD ── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-[32px] p-6 sm:p-8 shadow-xl">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl pointer-events-none" />
        
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4 z-10 relative">
          <div>
            <span className="text-[10px] font-black tracking-widest text-blue-100 uppercase">Registered Patient Profile</span>
            <h1 className="text-2xl sm:text-3xl font-black mt-1 leading-none">
              Welcome, {user?.displayName || user?.patientName || 'HelpAid Patient'}
            </h1>
            <p className="text-xs text-blue-200 font-semibold mt-1">Medical Vault and active emergency monitoring console.</p>
          </div>

          {user?.helpAidId && (
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/20 flex flex-col items-start gap-1">
              <span className="text-[9px] font-bold text-blue-100 uppercase tracking-wider">HelpAid ID</span>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-sm tracking-wider">{user.helpAidId}</span>
                <button onClick={copyHelpAidId} className="hover:bg-white/10 p-1 rounded transition-colors" title="Copy HelpAid ID">
                  {copied ? <Check size={14} className="text-emerald-300" /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Profile Attributes Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-white/15 text-sm">
          <div className="flex items-center gap-2 bg-white/5 rounded-xl p-2.5">
            <User size={16} className="text-blue-200" />
            <div>
              <p className="text-[9px] font-bold text-blue-200 uppercase leading-none">Age / Gender</p>
              <p className="font-bold mt-1 text-xs truncate">
                {user?.age ? `${user.age}Y` : 'N/A'} • {user?.gender || 'N/A'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-white/5 rounded-xl p-2.5">
            <Heart size={16} className="text-red-300 animate-pulse" />
            <div>
              <p className="text-[9px] font-bold text-blue-200 uppercase leading-none">Blood Group</p>
              <p className="font-bold mt-1 text-xs">{user?.bloodGroup || 'N/A'}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-white/5 rounded-xl p-2.5">
            <Phone size={16} className="text-blue-200" />
            <div>
              <p className="text-[9px] font-bold text-blue-200 uppercase leading-none">Primary Mobile</p>
              <p className="font-bold mt-1 text-xs">{user?.phone || 'N/A'}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-white/5 rounded-xl p-2.5">
            <ShieldAlert size={16} className="text-orange-300" />
            <div>
              <p className="text-[9px] font-bold text-blue-200 uppercase leading-none">Emergency Contact</p>
              <p className="font-bold mt-1 text-xs">{user?.emergencyContact || 'N/A'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── ACTIVE EMERGENCY TRACKER (PULSING DISPLAY) ── */}
      <AnimatePresence mode="wait">
        {activeCase && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="bg-white dark:bg-slate-900 border-2 border-red-500/20 dark:border-red-950/40 rounded-[32px] p-6 shadow-2xl space-y-5 relative overflow-hidden"
          >
            {/* Pulsing hazard glow background */}
            <div className="absolute inset-0 bg-red-500/3 dark:bg-red-950/5 pointer-events-none animate-pulse" />
            
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 relative z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 dark:bg-red-950/40 text-red-600 rounded-2xl flex items-center justify-center shrink-0">
                  <Activity className="animate-spin" size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900 dark:text-white leading-tight">Active Emergency</h2>
                  <p className="text-xs text-red-500 dark:text-red-400 font-bold mt-0.5">Alert Broadcast Registered</p>
                </div>
              </div>
              <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase border tracking-wider ${getStatusDisplay(activeCase.status).color}`}>
                {getStatusDisplay(activeCase.status).label}
              </span>
            </div>

            {/* Emergency Details Body */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 relative z-10 text-xs">
              <div className="bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800 p-4 rounded-2xl space-y-2">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Injury Details</span>
                <p className="font-extrabold text-sm text-slate-900 dark:text-white capitalize">{activeCase.injuryType}</p>
                <div className="flex gap-2">
                  <span className="px-2 py-0.5 bg-red-500 text-white rounded font-bold uppercase text-[9px] tracking-wide">{activeCase.severity}</span>
                  <span className="text-slate-500 dark:text-slate-400 font-semibold">{formatDate(activeCase.createdAt)}</span>
                </div>
                {activeCase.emergencyDescription && (
                  <p className="text-slate-600 dark:text-slate-400 mt-2 italic leading-relaxed border-t border-slate-200/40 pt-2">
                    "{activeCase.emergencyDescription}"
                  </p>
                )}
              </div>

              <div className="bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800 p-4 rounded-2xl space-y-2 flex flex-col justify-between">
                <div>
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Dispatched Location</span>
                  <p className="font-semibold text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">
                    {activeCase.patient_location_address || `${activeCase.lat.toFixed(5)}, ${activeCase.lng.toFixed(5)}`}
                  </p>
                </div>
                <Link
                  to={`/tracker/${activeCase._id}`}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-center rounded-xl flex items-center justify-center gap-1.5 active:scale-97 transition-all mt-3"
                >
                  <Navigation size={14} /> Open Live SOS Tracker Map
                </Link>
              </div>
            </div>

            {/* Doctor Accepted Success Card */}
            {activeCase.acceptedDoctor && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30 rounded-2xl p-5 space-y-4 relative z-10"
              >
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <Stethoscope className="animate-bounce" size={22} />
                  <h3 className="text-sm font-black uppercase tracking-wide">🩺 Doctor Accepted Your Emergency</h3>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Doctor Name</span>
                    <p className="font-extrabold text-sm text-slate-800 dark:text-slate-200 mt-0.5">
                      {activeCase.acceptedDoctor.doctorName}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Specialization</span>
                    <p className="font-bold text-slate-700 dark:text-slate-300 mt-0.5">
                      {activeCase.acceptedDoctor.specialization || 'Medical Specialist'}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Phone</span>
                    <p className="font-mono font-bold text-slate-700 dark:text-slate-300 mt-0.5">
                      {activeCase.acceptedDoctor.phone || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Hospital</span>
                    <p className="font-bold text-slate-700 dark:text-slate-300 mt-0.5">
                      {activeCase.acceptedDoctor.hospitalName || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Distance</span>
                    <p className="font-extrabold text-slate-800 dark:text-slate-200 mt-0.5">
                      {activeCase.acceptedDoctor.distanceFromPatient ? `${activeCase.acceptedDoctor.distanceFromPatient} km` : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Accepted</span>
                    <p className="font-semibold text-slate-600 dark:text-slate-400 mt-0.5">
                      {getRelativeTime(activeCase.acceptedDoctor.acceptedAt)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  {activeCase.acceptedDoctor.phone && (
                    <a
                      href={`tel:${activeCase.acceptedDoctor.phone}`}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 active:scale-95 transition-all shadow-sm"
                    >
                      📞 Call Doctor
                    </a>
                  )}
                  {activeCase.acceptedDoctor.hospitalAddress && (
                    <button
                      onClick={() => alert(`Hospital Address:\n${activeCase.acceptedDoctor.hospitalAddress || 'Address not available'}`)}
                      className="px-4 py-2 bg-slate-205 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs flex items-center gap-1.5 active:scale-95 transition-all"
                    >
                      📍 View Hospital
                    </button>
                  )}
                  <Link
                    to={`/tracker/${activeCase._id}`}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 active:scale-95 transition-all shadow-sm"
                  >
                    🚑 Track Ambulance
                  </Link>
                </div>
              </motion.div>
            )}

            {/* Ambulance Assigned Card */}
            {activeCase.status === 'AMBULANCE_ASSIGNED' && activeCase.accepted_ambulance?.driverName && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-orange-50/50 dark:bg-orange-950/15 border border-orange-200/40 dark:border-orange-900/30 rounded-2xl p-5 space-y-4 relative z-10"
              >
                <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
                  <Navigation className="animate-pulse" size={22} />
                  <h3 className="text-sm font-black uppercase tracking-wide">🚑 Ambulance Assigned</h3>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Driver Name</span>
                    <p className="font-extrabold text-sm text-slate-800 dark:text-slate-200 mt-0.5">
                      {activeCase.accepted_ambulance.driverName}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Driver Phone</span>
                    <p className="font-mono font-bold text-slate-700 dark:text-slate-300 mt-0.5">
                      {activeCase.accepted_ambulance.driverPhone || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Vehicle Number</span>
                    <p className="font-mono font-extrabold text-slate-700 dark:text-slate-300 mt-0.5">
                      {activeCase.accepted_ambulance.vehicleNumber || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Distance Away</span>
                    <p className="font-extrabold text-slate-800 dark:text-slate-200 mt-0.5">
                      {activeCase.distanceKm ? `${activeCase.distanceKm} km` : (activeCase.accepted_ambulance.distanceKm ? `${activeCase.accepted_ambulance.distanceKm} km` : 'N/A')}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Estimated Arrival</span>
                    <p className="font-extrabold text-orange-600 dark:text-orange-400 mt-0.5">
                      {activeCase.etaMinutes ? `${activeCase.etaMinutes} min` : (activeCase.accepted_ambulance.eta ? `${activeCase.accepted_ambulance.eta} min` : 'N/A')}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Live Status</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="w-2 h-2 bg-orange-500 rounded-full animate-ping" />
                      <p className="font-black text-orange-600 dark:text-orange-400 uppercase tracking-wider text-[10px]">
                        {activeCase.liveStatus || 'Assigned'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  {activeCase.accepted_ambulance.driverPhone && (
                    <a
                      href={`tel:${activeCase.accepted_ambulance.driverPhone}`}
                      className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 active:scale-95 transition-all shadow-sm"
                    >
                      📞 Call Driver
                    </a>
                  )}
                  <Link
                    to={`/tracker/${activeCase._id}`}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 active:scale-95 transition-all shadow-sm"
                  >
                    📍 Track Route
                  </Link>
                </div>
              </motion.div>
            )}

            {/* Responders information */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-slate-100 dark:border-slate-850 pt-5 relative z-10">
              {/* Doctor */}
              {activeCase.accepted_doctor?.name ? (
                <div className="flex items-start gap-2.5 p-3 bg-emerald-50/50 dark:bg-emerald-950/10 border border-emerald-100/40 rounded-xl">
                  <Stethoscope size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-black text-emerald-600 dark:text-emerald-455 uppercase tracking-wider leading-none">Accepted Doctor</p>
                    <p className="font-bold text-slate-800 dark:text-slate-200 text-xs mt-1 truncate">{activeCase.accepted_doctor.name}</p>
                    <p className="text-[10px] text-slate-450 dark:text-slate-550 truncate">{activeCase.accepted_doctor.specialization || 'Medical Responder'}</p>
                    <a href={`tel:${activeCase.accepted_doctor.phone}`} className="text-[10px] font-bold text-emerald-600 hover:underline mt-1 block">
                      Call Doctor
                    </a>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-950/20 rounded-xl border border-slate-100 dark:border-slate-800">
                  <Loader2 size={13} className="text-slate-400 animate-spin shrink-0" />
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">Locating doctors...</span>
                </div>
              )}

              {/* Hospital */}
              {activeCase.accepted_hospital?.name ? (
                <div className="flex items-start gap-2.5 p-3 bg-blue-50/50 dark:bg-blue-950/10 border border-blue-100/40 rounded-xl">
                  <Building2 size={16} className="text-blue-500 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-black text-blue-600 dark:text-blue-450 uppercase tracking-wider leading-none">Destination Locked</p>
                    <p className="font-bold text-slate-800 dark:text-slate-200 text-xs mt-1 truncate">{activeCase.accepted_hospital.name}</p>
                    <p className="text-[10px] text-slate-450 dark:text-slate-550 truncate">{activeCase.accepted_hospital.address || 'Medical Facility'}</p>
                    <a href={`tel:${activeCase.accepted_hospital.phone}`} className="text-[10px] font-bold text-blue-600 hover:underline mt-1 block">
                      Call ER Desk
                    </a>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-950/20 rounded-xl border border-slate-100 dark:border-slate-800">
                  <Loader2 size={13} className="text-slate-400 animate-spin shrink-0" />
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">Securing ER room...</span>
                </div>
              )}

              {/* Ambulance */}
              {activeCase.accepted_ambulance?.driverName ? (
                <div className="flex items-start gap-2.5 p-3 bg-orange-50/50 dark:bg-orange-950/10 border border-orange-100/40 rounded-xl">
                  <Navigation size={16} className="text-orange-500 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-black text-orange-600 dark:text-orange-455 uppercase tracking-wider leading-none">Ambulance ETA: ~{activeCase.accepted_ambulance.eta || 10}m</p>
                    <p className="font-bold text-slate-800 dark:text-slate-200 text-xs mt-1 truncate">{activeCase.accepted_ambulance.driverName}</p>
                    <p className="text-[10px] text-slate-450 dark:text-slate-550 truncate">No: {activeCase.accepted_ambulance.vehicleNumber || 'HA-AMB'}</p>
                    <a href={`tel:${activeCase.accepted_ambulance.driverPhone}`} className="text-[10px] font-bold text-orange-600 hover:underline mt-1 block">
                      Call Driver
                    </a>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-950/20 rounded-xl border border-slate-100 dark:border-slate-800">
                  <Loader2 size={13} className="text-slate-400 animate-spin shrink-0" />
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">Dispatching ambulance...</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* ── LIVE NOTIFICATION FEED ── */}
        <div className="md:col-span-1 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[28px] p-5 shadow-xs flex flex-col max-h-[500px]">
          <div className="flex items-center justify-between border-b border-slate-150 dark:border-slate-800 pb-3 mb-3 shrink-0">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-blue-600" />
              <h2 className="font-extrabold text-sm text-slate-900 dark:text-white">Live Alerts</h2>
              {notifications.filter(n => !n.read).length > 0 && (
                <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-ping" />
              )}
            </div>
            {notifications.filter(n => !n.read).length > 0 && (
              <button onClick={markAllAsRead} className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline">
                Mark all read
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1.5 custom-scrollbar">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400">
                <Bell size={24} className="opacity-30 mb-2" />
                <p className="text-[11px] font-semibold">No recent alerts or notifications.</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n._id}
                  onClick={() => !n.read && markAsRead(n._id)}
                  className={`p-3 rounded-xl border transition-all text-left flex gap-2.5 relative cursor-pointer ${
                    n.read
                      ? 'bg-slate-50/50 dark:bg-slate-950/20 border-slate-100 dark:border-slate-900/60 opacity-70'
                      : 'bg-blue-50/20 dark:bg-blue-950/10 border-blue-100/40 dark:border-blue-900/20 shadow-xs'
                  }`}
                >
                  {!n.read && (
                    <span className="absolute top-3.5 right-3 w-1.5 h-1.5 bg-blue-500 rounded-full" />
                  )}
                  <div className="flex-1 min-w-0 text-xs">
                    <p className="font-bold text-slate-850 dark:text-slate-200 pr-3">{n.title}</p>
                    <p className="text-slate-550 dark:text-slate-400 font-medium mt-0.5 leading-snug">{n.message}</p>
                    <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-slate-400">
                      <Clock size={10} />
                      <span>{formatDate(n.createdAt)}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── EMERGENCY HISTORY ── */}
        <div className="md:col-span-2 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[28px] p-5 shadow-xs flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-150 dark:border-slate-800 pb-3 mb-3 shrink-0">
            <div className="flex items-center gap-2">
              <ClipboardList size={16} className="text-blue-600" />
              <h2 className="font-extrabold text-sm text-slate-900 dark:text-white">Emergency Incident History</h2>
            </div>
            <span className="text-[10px] font-bold text-slate-450 uppercase">{cases.length} records</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3.5 custom-scrollbar max-h-[500px]">
            {cases.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-455">
                <ShieldAlert size={36} className="opacity-30 mb-2 text-slate-400" />
                <p className="text-xs font-bold">No emergency incidents on file.</p>
                <p className="text-[11px] text-slate-400 mt-1 max-w-xs text-center leading-relaxed">
                  Your SOS transmissions and clinical reports will compile automatically and register here.
                </p>
              </div>
            ) : (
              cases.map((c) => (
                <div key={c._id} className="p-4 bg-slate-50/50 dark:bg-slate-950/20 border border-slate-100 dark:border-slate-850 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-slate-900 dark:text-white capitalize">{c.injuryType}</span>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide border ${
                        c.severity === 'CRITICAL' || c.severity === 'HIGH'
                          ? 'bg-red-50 dark:bg-red-950/15 border-red-200 dark:border-red-900/30 text-red-500'
                          : 'bg-blue-50 dark:bg-blue-950/15 border-blue-200 dark:border-blue-900/30 text-blue-500'
                      }`}>
                        {c.severity}
                      </span>
                    </div>

                    <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 leading-relaxed flex items-center gap-1.5">
                      <Calendar size={11} />
                      {formatDate(c.createdAt)}
                    </p>

                    {c.patient_location_address && (
                      <p className="text-[10px] text-slate-400 leading-snug truncate max-w-xs flex items-center gap-1">
                        <MapPin size={10} />
                        {c.patient_location_address}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2.5 sm:self-center">
                    <button
                      onClick={() => downloadReport(c)}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 border border-slate-200/50 dark:border-slate-700/50"
                    >
                      <Download size={12} />
                      <span>PDF Report</span>
                    </button>
                    {c.status === 'RESOLVED' ? (
                      <span className="px-2.5 py-1.5 bg-emerald-50 dark:bg-emerald-950/15 text-emerald-600 dark:text-emerald-450 border border-emerald-100 dark:border-emerald-900/20 rounded-xl text-[10px] font-bold uppercase tracking-wider">
                        Resolved
                      </span>
                    ) : (
                      <Link
                        to={`/tracker/${c._id}`}
                        className="px-2.5 py-1.5 bg-blue-550 hover:bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider active:scale-95 transition-all shadow-xs"
                      >
                        Track Live
                      </Link>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
