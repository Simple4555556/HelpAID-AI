import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Clock, CheckCircle, XCircle, MapPin, Phone, AlertTriangle, Loader2, Wifi, WifiOff, RefreshCw, Shield, Volume2, VolumeX, Navigation } from 'lucide-react';
import { cn } from '../lib/utils';
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '../config';

const SOCKET_URL = (import.meta as any).env?.VITE_API_URL || '/';
const API_BASE = API_BASE_URL;

type TabId = 'incoming' | 'accepted' | 'rejected' | 'queue';

export default function HospitalSOSDashboard({ user }: { user: any }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [acceptingEmergency, setAcceptingEmergency] = useState(true);
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('incoming');
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
  const profileId = stored.hospitalProfileId || stored.hospitalId;
  const getToken = () => localStorage.getItem('helpaid_token') || '';

  useEffect(() => {
    const sock = io(SOCKET_URL);
    setSocket(sock);

    const connectOnline = (lat?: number, lng?: number) => {
      sock.emit('user:online', { userId, role: 'hospital', profileId, lat, lng });
      if (profileId) sock.emit('join_hospital_room', profileId);
    };

    sock.on('connect', () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          pos => {
            connectOnline(pos.coords.latitude, pos.coords.longitude);
          },
          () => {
            connectOnline();
          },
          { enableHighAccuracy: true, timeout: 5000 }
        );
      } else {
        connectOnline();
      }
    });

    sock.on('sos:new', () => fetchCases());
    sock.on('sos:closed', () => fetchCases());
    sock.on('sos:accepted', () => fetchCases());
    sock.on('new_emergency', () => fetchCases());
    sock.on('case_locked', () => fetchCases());

    // Canonical updates — refresh on any case state change
    sock.on('emergency_updated', (data: any) => {
      console.log('[HOSPITAL DASHBOARD RECEIVED] emergency_updated:', data);
      const ec = data.emergencyCase || data;
      const caseId = data.caseId || ec._id?.toString();
      if (!caseId) return;
      setCases(prev => {
        const exists = prev.find(c => c._id === caseId || c._id?.toString() === caseId);
        if (exists) {
          return prev.map(c => (c._id === caseId || c._id?.toString() === caseId)
            ? { ...c, status: ec.status || c.status, liveStatus: ec.liveStatus || c.liveStatus, acceptedDoctor: data.doctor || ec.acceptedDoctor || c.acceptedDoctor }
            : c
          );
        }
        return prev;
      });
    });
    sock.on('emergency_case_updated', () => fetchCases());
    sock.on('doctor_accepted', () => fetchCases());
    sock.on('hospital_accepted', () => fetchCases());

    sock.on('tracking:update', (data: any) => {
      console.log('[HOSPITAL RECEIVED] tracking:update:', data);
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
      console.log('[HOSPITAL RECEIVED] ambulance:location:update:', data);
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

    return () => {
      sock.emit('user:offline', { userId, role: 'hospital', profileId });
      sock.close();
    };
  }, [userId, profileId]);

  const fetchCases = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/sos/active`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const data = await res.json();
      console.log("HOSPITAL_RECEIVED", data);
      if (data.success) setCases(data.cases || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchCases(); }, []);

  const toggleOnline = () => {
    if (isOnline) {
      socket?.emit('user:offline', { userId, role: 'hospital', profileId });
    } else {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          pos => {
            socket?.emit('user:online', { userId, role: 'hospital', profileId, lat: pos.coords.latitude, lng: pos.coords.longitude });
          },
          () => {
            socket?.emit('user:online', { userId, role: 'hospital', profileId });
          },
          { enableHighAccuracy: true, timeout: 5000 }
        );
      } else {
        socket?.emit('user:online', { userId, role: 'hospital', profileId });
      }
    }
    setIsOnline(!isOnline);
  };

  const handleAccept = async (caseId: string) => {
    setRespondingTo(caseId);
    try {
      await fetch(`${API_BASE}/api/sos/accept-hospital`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ caseId })
      });
      fetchCases();
    } catch {}
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

  const incomingCases = cases.filter(c => (c.status === 'PENDING' || c.status === 'ESCALATED') && !c.myResponse);
  const acceptedCases = cases.filter(c => (c.status === 'HOSPITAL_ACCEPTED' || c.status === 'ACCEPTED' || c.status === 'DOCTOR_ACCEPTED') && (c.accepted_by?.userId === userId || c.assignedHospitalId));
  const rejectedCases = cases.filter(c => c.myResponse?.action === 'REJECTED');
  const queueCases = cases.filter(c => c.status === 'PENDING' || c.status === 'ESCALATED' || c.status === 'DOCTOR_ACCEPTED');

  const TABS = [
    { id: 'incoming' as TabId, label: 'Incoming', count: incomingCases.length, color: 'text-red-600' },
    { id: 'accepted' as TabId, label: 'Accepted', count: acceptedCases.length, color: 'text-emerald-600' },
    { id: 'rejected' as TabId, label: 'Rejected', count: rejectedCases.length, color: 'text-gray-500' },
    { id: 'queue' as TabId, label: 'Queue', count: queueCases.length, color: 'text-blue-600' },
  ];

  const displayCases = activeTab === 'incoming' ? incomingCases : activeTab === 'accepted' ? acceptedCases : activeTab === 'rejected' ? rejectedCases : queueCases;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white shadow-md">
            <Building2 size={20} strokeWidth={2.5} />
          </div>
          <div className="flex-1">
            <h1 className="text-base font-black text-gray-900 dark:text-white">Hospital SOS Dashboard</h1>
            <p className="text-[11px] text-gray-400">{stored.displayName || user?.displayName || 'Hospital'}</p>
          </div>

          {/* Sound toggle */}
          <button onClick={toggleSound}
            className={cn("flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all",
              soundEnabled ? "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600" : "bg-gray-100 dark:bg-gray-800 text-gray-400")}>
            {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
            {soundEnabled ? 'Siren ON' : 'Siren OFF'}
          </button>

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

        {/* Emergency toggle */}
        <div className="px-4 pb-3">
          <button onClick={() => setAcceptingEmergency(!acceptingEmergency)}
            className={cn("w-full py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all",
              acceptingEmergency ? "bg-emerald-50 dark:bg-emerald-900/15 text-emerald-600 border border-emerald-200 dark:border-emerald-800" : "bg-red-50 dark:bg-red-900/15 text-red-600 border border-red-200 dark:border-red-800")}>
            <Shield size={14} />
            {acceptingEmergency ? 'Accepting Emergencies' : 'Not Accepting Emergencies'}
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

        <div className="divide-y divide-gray-50 dark:divide-gray-800/60">
          {loading && (
            <div className="flex items-center justify-center gap-3 py-12">
              <Loader2 size={20} className="animate-spin text-blue-500" />
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
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
                  <AlertTriangle size={16} className="text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{c.patientName}</p>
                  <p className="text-[11px] text-gray-400">{c.injuryType} · {c.severity}</p>
                </div>
                <span className={cn("text-[10px] font-bold px-2 py-1 rounded-full",
                  c.status === 'PENDING' || c.status === 'ESCALATED' ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                  c.status === 'ACCEPTED' ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600")}>
                  {c.status}
                </span>
              </div>

              {c.emergencyDescription && (
                <p className="text-xs text-gray-500 bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2">{c.emergencyDescription}</p>
              )}

              {/* Doctor Status Badge */}
              <div className="flex items-center justify-between text-[11px] px-3 py-1.5 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-300 rounded-lg border border-amber-100 dark:border-amber-900/30">
                <span className="font-bold">Doctor Status:</span>
                <span className="font-black">
                  {c.accepted_doctor?.name || c.acceptedDoctor?.doctorName || c.assignedDoctorName
                    ? `Assigned: Dr. ${c.accepted_doctor?.name || c.acceptedDoctor?.doctorName || c.assignedDoctorName}`
                    : 'Parallel Specialist SOS Broadcasted'}
                </span>
              </div>

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

              {c.patient_location_address && (
                <div className="flex items-start gap-1.5">
                  <MapPin size={12} className="text-blue-500 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-gray-400">{c.patient_location_address}</p>
                </div>
              )}

              {c.patient_phone && (
                <div className="flex items-center gap-1.5">
                  <Phone size={12} className="text-emerald-500" />
                  <a href={`tel:${c.patient_phone}`} className="text-[11px] text-emerald-600 font-semibold">{c.patient_phone}</a>
                </div>
              )}

              {/* Hospital Accepted / Dispatch active tracking info */}
              {(c.status === 'HOSPITAL_ACCEPTED' || c.status === 'ACCEPTED' || c.status === 'AMBULANCE_ASSIGNED' || c.status === 'DOCTOR_ACCEPTED') && (
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
