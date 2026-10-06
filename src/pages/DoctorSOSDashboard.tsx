import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Clock, CheckCircle, XCircle, MapPin, Phone, AlertTriangle, Loader2, Wifi, WifiOff, RefreshCw, BriefcaseMedical, Shield, Volume2, VolumeX, Navigation } from 'lucide-react';
import { cn } from '../lib/utils';
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '../config';

const SOCKET_URL = (import.meta as any).env?.VITE_API_URL || '/';
const API_BASE = API_BASE_URL;

type TabId = 'pending' | 'accepted' | 'rejected' | 'forwarded';

export default function DoctorSOSDashboard({ user }: { user: any }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('pending');
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return JSON.parse(localStorage.getItem('helpaid_siren_enabled') ?? 'true');
  });

  const toggleSound = () => {
    const nextState = !soundEnabled;
    setSoundEnabled(nextState);
    localStorage.setItem('helpaid_siren_enabled', JSON.stringify(nextState));
  };

  const stored = JSON.parse(localStorage.getItem('helpaid_user') || '{}');
  const userId = user?.uid || user?.id || stored.id;
  const profileId = stored.doctorProfileId;
  const getToken = () => localStorage.getItem('helpaid_token') || '';

  const acceptedCaseIdRef = useRef<string | null>(null);

  // Socket connection
  useEffect(() => {
    const sock = io(SOCKET_URL);
    setSocket(sock);

    const connectOnline = (lat?: number, lng?: number) => {
      sock.emit('user:online', { userId, role: 'doctor', profileId, lat, lng });
    };

    sock.on('connect', () => {
      console.log('[SOCKET CONNECTED] Doctor socket connected, socketId:', sock.id);
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          pos => { connectOnline(pos.coords.latitude, pos.coords.longitude); },
          () => { connectOnline(); },
          { enableHighAccuracy: true, timeout: 5000 }
        );
      } else {
        connectOnline();
      }
      fetchCases();
    });

    sock.on('doctor:profile_resolved', (resolved: any) => {
      console.log('[SOCKET RECEIVED] doctor:profile_resolved:', resolved);
      if (resolved?.profileId && resolved.profileId !== profileId) {
        try {
          const storedUser = JSON.parse(localStorage.getItem('helpaid_user') || '{}');
          storedUser.doctorProfileId = resolved.profileId;
          localStorage.setItem('helpaid_user', JSON.stringify(storedUser));
        } catch {}
      }
    });

    sock.on('reconnect', () => {
      console.log('[SOCKET] Doctor socket reconnected, refreshing pending cases...');
      connectOnline();
      fetchCases();
    });

    const handleDoctorRequest = (eventName: string, data?: any) => {
      console.log(`[REQUEST RECEIVED] Socket event ${eventName} received for doctor ${profileId || userId}:`, data);
      fetchCases();
      try { new Audio('/alert.mp3').play().catch(() => {}); } catch {}
    };

    sock.on('doctor:sos', (data) => handleDoctorRequest('doctor:sos', data));
    sock.on('doctor_request_created', (data) => handleDoctorRequest('doctor_request_created', data));
    sock.on('sos:new', (data) => handleDoctorRequest('sos:new', data));
    sock.on('sos:received', (data) => handleDoctorRequest('sos:received', data));
    sock.on('sos:closed', () => fetchCases());
    sock.on('sos:accepted', () => fetchCases());
    sock.on('case_locked', (data: any) => {
      console.log('[DOCTOR] Case locked by another specialist:', data);
      fetchCases();
    });
    sock.on('sos_cancelled_accepted_by_other', (data: any) => {
      console.log('[DOCTOR] Case accepted by another doctor:', data);
      fetchCases();
    });

    sock.on('tracking:update', (data: any) => {
      console.log('[DOCTOR RECEIVED] tracking:update:', data);
      setCases(prev => prev.map(c => {
        if (c._id === data.caseId) {
          return {
            ...c,
            distanceKm: data.distanceKm,
            etaMinutes: data.etaMinutes,
            liveStatus: data.liveStatus,
            status: data.status
          };
        }
        return c;
      }));
    });

    sock.on('ambulance:location:update', (data: any) => {
      console.log('[DOCTOR RECEIVED] ambulance:location:update:', data);
      setCases(prev => prev.map(c => {
        if (c._id === data.caseId) {
          return {
            ...c,
            distanceKm: data.distanceKm,
            etaMinutes: data.etaMinutes,
            liveStatus: data.liveStatus
          };
        }
        return c;
      }));
    });

    const resetActiveCase = () => {
      console.log('[DOCTOR] Active case closed/completed, clearing active case ID');
      acceptedCaseIdRef.current = null;
    };

    sock.on('case_completed', resetActiveCase);
    sock.on('tracking:completed', resetActiveCase);
    sock.on('case:resolved', resetActiveCase);

    // ── Doctor Live Location Broadcast ──────────────────────────────────
    let doctorWatchId: number | null = null;
    let caseCheckInterval: ReturnType<typeof setInterval> | null = null;

    // Check for an accepted case from the server periodically — stops once found
    const checkAcceptedCase = async () => {
      try {
        const token = getToken();
        if (!token) return;
        const res = await fetch(`${API_BASE}/api/sos/active`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success && data.cases) {
          const myCase = (data.cases as any[]).find((c: any) =>
            (c.status === 'DOCTOR_ACCEPTED' || c.status === 'AMBULANCE_ASSIGNED' || c.status === 'HOSPITAL_ACCEPTED' || c.status === 'ACCEPTED') && c.accepted_doctor?.doctorId === profileId
          );
          if (myCase && myCase._id !== acceptedCaseIdRef.current) {
            acceptedCaseIdRef.current = myCase._id;
            console.log('[GPS STARTED] Doctor active accepted case found and synced via polling:', myCase._id);
            // Stop polling once we have our accepted case
            if (caseCheckInterval !== null) {
              clearInterval(caseCheckInterval);
              caseCheckInterval = null;
            }
          }
        }
      } catch {}
    };

    caseCheckInterval = setInterval(checkAcceptedCase, 5000);
    // Also run immediately so we don't wait 5 seconds on mount
    checkAcceptedCase();


    if ('geolocation' in navigator) {
      console.log('[GPS STARTED] Geolocation watcher initiated on Doctor dashboard');
      doctorWatchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (acceptedCaseIdRef.current && sock.connected) {
            const payload = { caseId: acceptedCaseIdRef.current, lat: pos.coords.latitude, lng: pos.coords.longitude };
            console.log('[DOCTOR LOCATION SENT] Doctor emitting doctor:location:update:', payload);
            sock.emit('doctor:location:update', payload);
          }
        },
        (err) => console.warn('[LIVE LOCATION] Doctor location error:', err.message),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }

    return () => {
      sock.emit('user:offline', { userId, role: 'doctor', profileId });
      sock.close();
      if (caseCheckInterval !== null) clearInterval(caseCheckInterval);
      if (doctorWatchId !== null) navigator.geolocation.clearWatch(doctorWatchId);
    };
  }, [userId, profileId]);

  // Fetch cases
  const fetchCases = async () => {
    try {
      const token = getToken();
      if (!token) return;
      let res = await fetch(`${API_BASE}/api/doctor/pending-emergencies`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        res = await fetch(`${API_BASE}/api/sos/active`, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      const data = await res.json();
      console.log('[REQUEST RECEIVED] Pending cases fetched from MongoDB:', data);
      if (data.success && data.cases) {
        setCases(data.cases);
        console.log(`[REQUEST DISPLAYED] Displaying ${data.cases.length} case(s) on Doctor Dashboard.`);
      }
    } catch (err: any) {
      console.warn('Failed to fetch doctor pending cases:', err.message);
    }
    setLoading(false);
  };

  useEffect(() => { fetchCases(); }, []);

  // Toggle online status
  const toggleOnline = () => {
    if (isOnline) {
      socket?.emit('user:offline', { userId, role: 'doctor', profileId });
    } else {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          pos => {
            socket?.emit('user:online', { userId, role: 'doctor', profileId, lat: pos.coords.latitude, lng: pos.coords.longitude });
          },
          () => {
            socket?.emit('user:online', { userId, role: 'doctor', profileId });
          },
          { enableHighAccuracy: true, timeout: 5000 }
        );
      } else {
        socket?.emit('user:online', { userId, role: 'doctor', profileId });
      }
    }
    setIsOnline(!isOnline);
  };

  const handleAccept = async (caseId: string) => {
    console.log(`[ACCEPT CLICKED] Doctor clicked Accept button for caseId: ${caseId}`);
    setRespondingTo(caseId);
    try {
      const token = getToken();
      console.log(`[API REQUEST] Sending POST /api/sos/accept with caseId: ${caseId}`);
      const res = await fetch(`${API_BASE}/api/sos/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ caseId })
      });
      const data = await res.json();
      console.log(`[API RESPONSE] POST /api/sos/accept returned status:`, res.status, 'Payload:', JSON.stringify(data));
      
      if (res.ok && data.success) {
        console.log(`[MONGO UPDATED] Case ${caseId} status updated to DOCTOR_ACCEPTED in database`);
        acceptedCaseIdRef.current = caseId;
        
        // Join case room to receive tracking updates (ambulance location, ETA, etc.)
        if (socket) {
          socket.emit('track_emergency', caseId);
          console.log(`[TRACKING UPDATED] Doctor joined case room: case_${caseId}`);
        }

        // Move case from Incoming -> Accepted in local state instantly without page reload
        setCases(prev => prev.map(c => {
          if (c._id === caseId) {
            return {
              ...c,
              status: 'DOCTOR_ACCEPTED',
              assignedDoctorId: profileId,
              accepted_by: { userId }
            };
          }
          return c;
        }));
        console.log(`[DASHBOARD UPDATED] Local state updated synchronously to show case as accepted`);
      } else {
        alert(data.error || 'Failed to accept case.');
      }
      fetchCases();
    } catch (err: any) {
      console.error('[ACCEPT FAILED] Error during acceptance processing:', err.message, err.stack);
    }
    setRespondingTo(null);
  };

  const handleReject = async (caseId: string) => {
    setRespondingTo(caseId);
    try {
      await fetch(`${API_BASE}/api/sos/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ caseId })
      });
      fetchCases();
    } catch {}
    setRespondingTo(null);
  };

  const pendingCases = cases.filter(c => (c.status === 'PENDING' || c.status === 'ESCALATED') && !c.myResponse);
  const acceptedCases = cases.filter(c => 
    (c.status === 'DOCTOR_ACCEPTED' || c.status === 'ACCEPTED' || c.status === 'AMBULANCE_ASSIGNED' || c.status === 'HOSPITAL_ACCEPTED') && 
    (c.accepted_by?.userId === userId || c.assignedDoctorId === profileId)
  );
  const rejectedCases = cases.filter(c => c.myResponse?.action === 'REJECTED');
  const forwardedCases = cases.filter(c => c.myResponse?.action === 'FORWARDED');

  const TABS = [
    { id: 'pending' as TabId, label: 'Active', count: pendingCases.length, color: 'text-amber-600' },
    { id: 'accepted' as TabId, label: 'Accepted', count: acceptedCases.length, color: 'text-emerald-600' },
    { id: 'rejected' as TabId, label: 'Rejected', count: rejectedCases.length, color: 'text-red-600' },
    { id: 'forwarded' as TabId, label: 'Forwarded', count: forwardedCases.length, color: 'text-blue-600' },
  ];

  const displayCases = activeTab === 'pending' ? pendingCases : activeTab === 'accepted' ? acceptedCases : activeTab === 'rejected' ? rejectedCases : forwardedCases;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md">
            <BriefcaseMedical size={20} strokeWidth={2.5} />
          </div>
          <div className="flex-1">
            <h1 className="text-base font-black text-gray-900 dark:text-white">Doctor SOS Dashboard</h1>
            <p className="text-[11px] text-gray-400">{stored.displayName || user?.displayName || 'Doctor'}</p>
          </div>

          {/* Sound toggle */}
          <button onClick={toggleSound}
            className={cn("flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all",
              soundEnabled ? "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600" : "bg-gray-100 dark:bg-gray-800 text-gray-400")}>
            {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
            {soundEnabled ? 'Siren ON' : 'Siren OFF'}
          </button>
          
          {/* Online toggle */}
          <button onClick={toggleOnline}
            className={cn("flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all",
              isOnline ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600" : "bg-gray-100 dark:bg-gray-800 text-gray-400")}>
            {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
            {isOnline ? 'Online' : 'Offline'}
          </button>
          <button onClick={fetchCases} className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-400 hover:text-blue-500 transition-all">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-100 dark:border-gray-800">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={cn("flex-1 py-3 text-xs font-bold text-center relative transition-all",
                activeTab === tab.id ? tab.color : "text-gray-400")}>
              {tab.label}
              {tab.count > 0 && (
                <span className={cn("ml-1 px-1.5 py-0.5 text-[10px] rounded-full",
                  activeTab === tab.id ? "bg-current/10" : "bg-gray-100 dark:bg-gray-800")}>
                  {tab.count}
                </span>
              )}
              {activeTab === tab.id && <div className="absolute bottom-0 left-2 right-2 h-[2px] bg-current rounded-full" />}
            </button>
          ))}
        </div>

        {/* Cases list */}
        <div className="divide-y divide-gray-50 dark:divide-gray-800/60">
          {loading && (
            <div className="flex items-center justify-center gap-3 py-12">
              <Loader2 size={20} className="animate-spin text-emerald-500" />
              <span className="text-sm text-gray-500">Loading cases...</span>
            </div>
          )}

          {!loading && displayCases.length === 0 && (
            <div className="text-center py-12 space-y-2">
              <div className="w-12 h-12 mx-auto rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                <CheckCircle size={20} className="text-gray-400" />
              </div>
              <p className="text-sm font-semibold text-gray-500">No {activeTab} cases</p>
            </div>
          )}

          {displayCases.map(c => (
            <div key={c._id} className="px-4 py-3.5 space-y-2.5">
              {/* Patient header */}
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
                  <AlertTriangle size={16} className="text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{c.patientName}</p>
                  <p className="text-[11px] text-gray-400">{c.injuryType} · {c.severity}</p>
                </div>
                <span className={cn("text-[10px] font-bold px-2 py-1 rounded-full",
                  c.status === 'PENDING' || c.status === 'ESCALATED' ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                  c.status === 'ACCEPTED' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                  "bg-gray-100 text-gray-600"
                )}>
                  {c.status}
                </span>
              </div>

              {/* Description */}
              {c.emergencyDescription && (
                <p className="text-xs text-gray-500 bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2">{c.emergencyDescription}</p>
              )}

              <div className="flex gap-2 mt-2">
                {c.aiReportSummary && (
                  <button onClick={() => alert(c.aiReportSummary)} className="flex-1 py-2 bg-purple-50 text-purple-600 rounded-lg text-[11px] font-bold border border-purple-100 hover:bg-purple-100 transition-colors">
                    View Report
                  </button>
                )}
                <a href={`${API_BASE}/api/sos/pdf/${c._id}`} target="_blank" rel="noopener noreferrer" className="flex-1 py-2 flex items-center justify-center bg-indigo-50 text-indigo-600 rounded-lg text-[11px] font-bold border border-indigo-100 hover:bg-indigo-100 transition-colors">
                  View PDF
                </a>
                {c.imageUrl && (
                  <a href={c.imageUrl} target="_blank" rel="noopener noreferrer" className="flex-1 py-2 flex items-center justify-center bg-blue-50 text-blue-600 rounded-lg text-[11px] font-bold border border-blue-100 hover:bg-blue-100 transition-colors">
                    View Image
                  </a>
                )}
              </div>

              {/* Location */}
              {c.patient_location_address && (
                <div className="flex items-start gap-1.5">
                  <MapPin size={12} className="text-blue-500 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-gray-400">{c.patient_location_address}</p>
                </div>
              )}

              {/* Contact */}
              {c.patient_phone && (
                <div className="flex items-center gap-1.5">
                  <Phone size={12} className="text-emerald-500" />
                  <a href={`tel:${c.patient_phone}`} className="text-[11px] text-emerald-600 font-semibold">{c.patient_phone}</a>
                </div>
              )}

              {/* Doctor Accepted Active Track info */}
              {(c.status === 'DOCTOR_ACCEPTED' || c.status === 'ACCEPTED' || c.status === 'AMBULANCE_ASSIGNED' || c.status === 'HOSPITAL_ACCEPTED') && (
                <div className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-lg border border-slate-100 dark:border-slate-800/80 space-y-2 mt-2">
                  <div className="flex justify-between items-center text-[11px] font-bold text-slate-500">
                    <span>Ambulance Status</span>
                    <span className="text-orange-500 uppercase">{c.liveStatus || 'Assigned'}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400">ETA / Distance</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300">
                      {c.etaMinutes ? `${c.etaMinutes} mins` : '8 mins'} · {c.distanceKm ? `${c.distanceKm} km` : 'N/A'}
                    </span>
                  </div>
                  <Link to={`/tracker/${c._id}`} className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-[11px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all mt-1">
                    <Navigation size={12} /> Track Live Route
                  </Link>
                </div>
              )}

              {/* Actions for pending cases */}
              {(c.status === 'PENDING' || c.status === 'ESCALATED') && !c.myResponse && (
                <div className="flex gap-2 pt-1">
                  <button onClick={() => handleAccept(c._id)} disabled={respondingTo === c._id}
                    className="flex-1 py-2.5 bg-emerald-600 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all disabled:opacity-50">
                    {respondingTo === c._id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} Accept
                  </button>
                  <button onClick={() => handleReject(c._id)} disabled={respondingTo === c._id}
                    className="px-4 py-2.5 bg-red-100 dark:bg-red-900/20 text-red-600 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all">
                    <XCircle size={14} /> Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
