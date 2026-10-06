import { useState, useEffect } from 'react';
import { AlertTriangle, Phone, MapPin, CheckCircle, XCircle, Forward, X, Clock, Loader2, User } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { io, Socket } from 'socket.io-client';
import { cn } from '../lib/utils';
import { API_BASE_URL } from '../config';

const SOCKET_URL = (import.meta as any).env?.VITE_API_URL || '/';
const API_BASE = API_BASE_URL;

type SOSAlert = {
  caseId: string;
  patientName: string;
  patient_phone: string;
  injuryType: string;
  severity: string;
  emergencyDescription: string;
  aiReportSummary: string;
  lat: number;
  lng: number;
  distanceKm: string;
  patient_location_address: string;
  forwarded?: boolean;
  forwardedBy?: string;
  escalated?: boolean;
  imageUrl?: string;
  pdfReportUrl?: string;
  reportSummary?: string;
};

// Singleton Siren Audio
const siren = new Audio('/sounds/emergency-siren.mp3');
siren.loop = true;

const playSiren = () => {
  const isEnabled = JSON.parse(localStorage.getItem('helpaid_siren_enabled') ?? 'true');
  if (isEnabled) {
    siren.play().catch(() => {});
    if (navigator.vibrate) navigator.vibrate([500, 250, 500, 250, 500]);
  }
  if (Notification.permission === 'granted') {
    new Notification('🚨 EMERGENCY SOS', {
      body: 'Immediate response required',
      icon: '/favicon.ico'
    });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission();
  }
};

const stopSiren = () => {
  siren.pause();
  siren.currentTime = 0;
};

export default function SOSNotification({ user }: { user: any }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [alerts, setAlerts] = useState<SOSAlert[]>([]);
  const [closedCases, setClosedCases] = useState<Set<string>>(new Set());
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [showForward, setShowForward] = useState<string | null>(null);
  const [onlineDoctors, setOnlineDoctors] = useState<any[]>([]);

  const userRole = user?.role || localStorage.getItem('helpaid_user') && JSON.parse(localStorage.getItem('helpaid_user') || '{}').role;
  const userId = user?.uid || user?.id || (localStorage.getItem('helpaid_user') && JSON.parse(localStorage.getItem('helpaid_user') || '{}').id);
  const isResponder = userRole === 'doctor' || userRole === 'hospital' || userRole === 'hospital_admin';

  useEffect(() => {
    if (!isResponder || !userId) return;

    const newSocket = io(SOCKET_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      const stored = JSON.parse(localStorage.getItem('helpaid_user') || '{}');
      newSocket.emit('user:online', {
        userId,
        role: userRole,
        profileId: stored.doctorProfileId || stored.hospitalProfileId || stored.hospitalId
      });
      console.log('SOCKET_CONNECTED', { socketId: newSocket.id, userId, role: userRole });
    });

    newSocket.on('sos:new', (data: SOSAlert) => {
      console.log('SOS_RECEIVED', data.caseId, data.patientName, data.severity);
      setAlerts(prev => {
        if (prev.find(a => a.caseId === data.caseId)) return prev;
        return [data, ...prev];
      });
      playSiren();
    });

    newSocket.on('sos:received', (data: SOSAlert) => {
      console.log('SOS_RECEIVED (sos:received event)', data.caseId);
      setAlerts(prev => {
        if (prev.find(a => a.caseId === data.caseId)) return prev;
        return [data, ...prev];
      });
      playSiren();
    });

    newSocket.on('sos:closed', (data: { caseId: string }) => {
      setClosedCases(prev => new Set(prev).add(data.caseId));
    });

    newSocket.on('sos:accepted', (data: { caseId: string }) => {
      setClosedCases(prev => new Set(prev).add(data.caseId));
    });

    return () => {
      const stored = JSON.parse(localStorage.getItem('helpaid_user') || '{}');
      newSocket.emit('user:offline', {
        userId,
        role: userRole,
        profileId: stored.doctorProfileId || stored.hospitalProfileId || stored.hospitalId
      });
      newSocket.close();
    };
  }, [isResponder, userId, userRole]);

  const getToken = () => localStorage.getItem('helpaid_token') || '';

  const handleAccept = async (caseId: string) => {
    setRespondingTo(caseId);
    try {
      const endpoint = (userRole === 'hospital' || userRole === 'hospital_admin')
        ? `${API_BASE}/api/sos/accept-hospital`
        : `${API_BASE}/api/sos/accept`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ caseId })
      });
      const data = await res.json();
      if (data.success) {
        setClosedCases(prev => new Set(prev).add(caseId));
      }
    } catch { /* handle error */ }
    setRespondingTo(null);
    stopSiren();
  };

  const handleReject = async (caseId: string) => {
    setRespondingTo(caseId);
    try {
      await fetch(`${API_BASE}/api/sos/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ caseId })
      });
      setAlerts(prev => prev.filter(a => a.caseId !== caseId));
    } catch { /* handle error */ }
    setRespondingTo(null);
    stopSiren();
  };

  const handleForward = async (caseId: string, forwardToId: string) => {
    try {
      await fetch(`${API_BASE}/api/sos/forward`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ caseId, forwardToId })
      });
      setAlerts(prev => prev.filter(a => a.caseId !== caseId));
      setShowForward(null);
    } catch { /* handle error */ }
  };

  const loadOnlineDoctors = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/sos/online-doctors`);
      const data = await res.json();
      if (data.success) setOnlineDoctors(data.doctors || []);
    } catch { /* handle error */ }
  };

  if (!isResponder) return null;

  const activeAlerts = alerts;

  return (
    <AnimatePresence>
      {activeAlerts.map((alert) => (
        <motion.div
          key={alert.caseId}
          initial={{ opacity: 0, y: -60, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -60, scale: 0.9 }}
          className="fixed inset-x-3 top-20 z-[100] max-w-lg mx-auto"
        >
          <div className="bg-white dark:bg-gray-950 rounded-3xl border-2 border-red-200 dark:border-red-900/50 shadow-2xl shadow-red-200/40 dark:shadow-red-900/20 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-red-600 to-rose-600 px-5 py-3.5 flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <AlertTriangle size={22} className="text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-white font-black text-base">🚨 EMERGENCY SOS</h3>
                <p className="text-red-100 text-xs font-semibold">
                  {alert.forwarded ? `Forwarded by ${alert.forwardedBy}` : 'Immediate response required'}
                </p>
              </div>
              <button onClick={() => {
                  setAlerts(prev => prev.filter(a => a.caseId !== alert.caseId));
                  stopSiren();
                }}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/15 text-white/80 hover:bg-white/25">
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 space-y-3">
              {/* Patient Info */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
                  <User size={18} className="text-red-500" />
                </div>
                <div>
                  <p className="text-sm font-black text-gray-900 dark:text-white">{alert.patientName || 'Unknown Patient'}</p>
                  <p className="text-xs text-gray-400">{alert.patient_phone || 'No phone'}</p>
                </div>
                {alert.distanceKm && (
                  <div className="ml-auto px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-full">
                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{alert.distanceKm} km</span>
                  </div>
                )}
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-2 gap-2">
                <InfoChip label="Type" value={alert.injuryType || 'Emergency'} color="red" />
                <InfoChip label="Severity" value={alert.severity || 'CRITICAL'} color="amber" />
              </div>

              {/* Location */}
              {alert.patient_location_address && (
                <div className="flex items-start gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-900 rounded-xl">
                  <MapPin size={14} className="text-blue-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-gray-600 dark:text-gray-300">{alert.patient_location_address}</p>
                </div>
              )}

              {/* Description */}
              {alert.emergencyDescription && (
                <p className="text-xs text-gray-500 bg-gray-50 dark:bg-gray-900 rounded-xl px-3 py-2 leading-relaxed">
                  {alert.emergencyDescription}
                </p>
              )}

              {/* Photo */}
              {alert.imageUrl && (
                <div className="rounded-xl overflow-hidden max-h-48 border border-gray-100 dark:border-gray-800 shadow-xs">
                  <img src={alert.imageUrl} alt="Emergency Photo" className="w-full h-auto max-h-48 object-cover mx-auto" />
                </div>
              )}

              {/* AI Report */}
              {(alert.reportSummary || alert.aiReportSummary) && (
                <div className="px-3 py-2 bg-violet-50 dark:bg-violet-900/10 rounded-xl border border-violet-100 dark:border-violet-900/30">
                  <p className="text-[10px] font-bold text-violet-500 uppercase mb-1">AI Analysis</p>
                  <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">{alert.reportSummary || alert.aiReportSummary}</p>
                </div>
              )}

              {/* View Full Report */}
              {alert.pdfReportUrl && (
                <a
                  href={alert.pdfReportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-2.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl text-xs font-bold border border-indigo-100 dark:border-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
                >
                  📄 View PDF Report
                </a>
              )}
            </div>

            {/* Actions */}
            {showForward === alert.caseId ? (
              <div className="px-5 pb-5">
                <p className="text-xs font-bold text-gray-500 mb-2">Select doctor to forward to:</p>
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {onlineDoctors.map(doc => (
                    <button key={doc._id} onClick={() => handleForward(alert.caseId, doc._id)}
                      className="w-full text-left px-3 py-2 bg-gray-50 dark:bg-gray-900 rounded-xl text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                      Dr. {doc.name} — {doc.specialization}
                    </button>
                  ))}
                  {onlineDoctors.length === 0 && <p className="text-xs text-gray-400 text-center py-2">No other doctors online</p>}
                </div>
                <button onClick={() => setShowForward(null)} className="mt-2 text-xs font-bold text-gray-400 hover:text-gray-600">Cancel</button>
              </div>
            ) : closedCases.has(alert.caseId) ? (
              <div className="px-5 pb-5">
                <div className="w-full py-3 bg-gray-100 dark:bg-gray-800 text-gray-400 rounded-2xl text-center text-xs font-black tracking-wider border border-gray-200 dark:border-gray-700">
                  CASE ALREADY ACCEPTED
                </div>
              </div>
            ) : (
              <div className="px-5 pb-5 flex gap-2.5">
                <button onClick={() => handleAccept(alert.caseId)} disabled={respondingTo === alert.caseId}
                  className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/20">
                  {respondingTo === alert.caseId ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                  ACCEPT
                </button>
                <button onClick={() => handleReject(alert.caseId)} disabled={respondingTo === alert.caseId}
                  className="px-5 py-3.5 bg-red-100 dark:bg-red-900/20 text-red-600 font-bold text-sm rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all">
                  <XCircle size={16} /> REJECT
                </button>
                {(userRole === 'doctor' || userRole === 'hospital' || userRole === 'hospital_admin') && (
                  <button onClick={() => { loadOnlineDoctors(); setShowForward(alert.caseId); }}
                    className="px-4 py-3.5 bg-blue-100 dark:bg-blue-900/20 text-blue-600 font-bold text-sm rounded-2xl flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all"
                    title="Forward SOS Alert"
                  >
                    <Forward size={16} />
                  </button>
                )}
              </div>
            )}
          </div>
        </motion.div>
      ))}
    </AnimatePresence>
  );
}

function InfoChip({ label, value, color }: { label: string; value: string; color: string }) {
  const colors: any = {
    red: 'bg-red-50 dark:bg-red-900/15 text-red-600 dark:text-red-400',
    amber: 'bg-amber-50 dark:bg-amber-900/15 text-amber-600 dark:text-amber-400',
    blue: 'bg-blue-50 dark:bg-blue-900/15 text-blue-600 dark:text-blue-400',
  };
  return (
    <div className={cn("px-3 py-2 rounded-xl", colors[color] || colors.red)}>
      <p className="text-[10px] font-bold uppercase opacity-60">{label}</p>
      <p className="text-xs font-bold truncate">{value}</p>
    </div>
  );
}
