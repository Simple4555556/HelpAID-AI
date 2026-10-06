import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  User, 
  BriefcaseMedical, 
  Activity, 
  FileText, 
  ShieldAlert, 
  Clock, 
  Phone, 
  Mail, 
  Calendar, 
  AlertTriangle, 
  Compass, 
  Check, 
  Heart,
  Eye,
  Loader2,
  Lock
} from 'lucide-react';
import { cn } from '../lib/utils';
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '../config';

const SOCKET_URL = (import.meta as any).env.VITE_API_URL || '/';

interface TimelineEvent {
  eventType: 'INJURY' | 'CHAT' | 'SYMPTOM' | 'CONSULTATION';
  eventTitle: string;
  eventDate: string;
  referenceId: string;
}

interface PatientSummary {
  profile: {
    uid: string;
    publicId: string;
    fullName: string;
    displayName: string;
    age: number | null;
    gender: string;
    mobileNumber: string;
    email: string;
    bloodGroup: string;
    profilePhoto: string;
    allergies: string[];
    diseases: string[];
    chronicConditions: string[];
    previousInjuries: string[];
    medications: string[];
    medicalNotes: string;
    emergencyContacts: { name: string; phone: string }[];
  };
  reports: any[];
  chats: any[];
  symptomHistory: any[];
  injuryHistory: any[];
  timeline: TimelineEvent[];
}

export default function DoctorDashboard({ user }: { user?: any }) {
  const [searchId, setSearchId] = useState('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [emergencyAlerts, setEmergencyAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<PatientSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeConsultations, setActiveConsultations] = useState<any[]>([]);
  const [consultsLoading, setConsultsLoading] = useState(false);

  // Load pending consultation requests and initialize socket
  useEffect(() => {
    fetchConsultations();

    const stored = localStorage.getItem('helpaid_user');
    const parsed = stored ? JSON.parse(stored) : {};
    const doctorProfileId = user?.doctorId || parsed.doctorProfileId || parsed.doctorId || null;
    const newSocket = io(SOCKET_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      // Inform server we're online so server joins appropriate rooms and updates DB
      newSocket.emit('user:online', { userId: user?.id || parsed.id || user?.uid, role: 'doctor', profileId: doctorProfileId });
      console.log('SOCKET_CONNECTED', { socketId: newSocket.id, role: 'doctor', profileId: doctorProfileId });
    });

    const handleIncomingSOS = (eventName: string, data: any) => {
      console.log(`[REQUEST RECEIVED] ${eventName}:`, data);
      setEmergencyAlerts(prev => {
        if (prev.find(a => a.caseId === data.caseId)) return prev;
        return [data, ...prev];
      });
      try {
        const audio = new Audio('/alert.mp3');
        audio.play().catch(() => {});
      } catch (e) {}
    };

    newSocket.on('doctor:sos', (data) => handleIncomingSOS('doctor:sos', data));
    newSocket.on('doctor_request_created', (data) => handleIncomingSOS('doctor_request_created', data));
    newSocket.on('sos:new', (data) => handleIncomingSOS('sos:new', data));
    newSocket.on('sos:received', (data) => handleIncomingSOS('sos:received', data));

    return () => {
      newSocket.close();
    };
  }, [user]);

  const fetchConsultations = async () => {
    setConsultsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/consultations`);
      if (res.ok) {
        const data = await res.json();
        // Since we want doctor view, we get all consultations
        setActiveConsultations(data);
      }
    } catch (e) {
      console.error('Error fetching consultations:', e);
    } finally {
      setConsultsLoading(false);
    }
  };

  const handleSearch = async (targetId?: string) => {
    const queryId = targetId || searchId;
    if (!queryId.trim()) return;

    setLoading(true);
    setError(null);
    setSummary(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/doctor/patient-summary?helpAidId=${queryId.trim()}`);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Patient not found');
      }
      const data = await res.json();
      setSummary(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to load patient summary.');
    } finally {
      setLoading(false);
    }
  };

  const viewReport = (report: any) => {
    alert(`Report Content:\n\n${JSON.stringify(report.result || report, null, 2)}`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full space-y-6 pb-32"
    >
      {/* ── HEADER ── */}
      <div>
        <h1 className="text-[28px] font-black text-gray-900 dark:text-white tracking-tight leading-none mb-1">
          Clinical Portal
        </h1>
        <p className="text-[13px] text-gray-500 font-medium">
          Doctor Triage, Pre-Arrival Briefings & Patient Summary Records
        </p>
      </div>

      {/* ── PATIENT ID SEARCH ── */}
      <div className="bg-white dark:bg-gray-950 rounded-[32px] border border-gray-100 dark:border-gray-900 p-6 shadow-sm">
        <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">
          Search Patient HelpAid ID
        </label>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              placeholder="E.g., HA-2026-123456"
              className="w-full pl-12 pr-4 py-4 bg-gray-50 dark:bg-gray-900 border border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-black text-[14px] font-semibold rounded-[20px] focus:outline-none transition-all placeholder:text-gray-400 uppercase"
            />
          </div>
          <button
            onClick={() => handleSearch()}
            disabled={loading}
            className="px-6 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-[20px] font-bold text-[13px] uppercase tracking-wider flex items-center justify-center gap-2 active:scale-95 transition-all"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : 'Lookup'}
          </button>
        </div>

        {error && (
          <div className="mt-4 p-4.5 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 text-xs font-bold rounded-2xl flex items-center gap-2 border border-red-100 dark:border-red-950/40">
            <AlertTriangle size={15} />
            {error}
          </div>
        )}
      </div>

      {/* ── EMERGENCY DISPATCH ALERTS ── */}
      <AnimatePresence>
        {emergencyAlerts.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <h3 className="font-black text-red-600 text-sm flex items-center gap-2 uppercase tracking-widest"><ShieldAlert /> Critical Dispatches</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {emergencyAlerts.map((alert, i) => (
                <div key={i} className="bg-red-50 border border-red-200 p-5 rounded-2xl shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-red-600 animate-pulse"></div>
                  <h4 className="font-black text-red-700">{alert.injuryType}</h4>
                  <p className="text-xs text-red-600 font-bold mb-3">{alert.distanceKm} km away • {alert.severity} Severity</p>
                  <p className="text-sm text-gray-700 font-medium mb-3">Patient: {alert.patientName}</p>
                  <button onClick={() => setEmergencyAlerts(prev => prev.filter((_, idx) => idx !== i))} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-xl">Acknowledge Alert</button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {/* ── NO ACTIVE PATIENT: DISPLAY PENDING REQUESTS ── */}
        {!summary && !loading && (
          <motion.div
            key="pending-list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <h3 className="font-extrabold text-[12px] text-gray-400 uppercase tracking-wider leading-none">
              Shared Patient Consultations ({activeConsultations.length})
            </h3>

            {consultsLoading ? (
              <div className="py-12 flex justify-center items-center">
                <Loader2 size={24} className="animate-spin text-blue-500" />
              </div>
            ) : activeConsultations.length === 0 ? (
              <div className="bg-gray-50 dark:bg-gray-950 border border-dashed border-gray-200 dark:border-gray-800 rounded-[32px] p-12 text-center">
                <Lock className="mx-auto text-gray-300 dark:text-gray-700 mb-3" size={32} />
                <h4 className="font-bold text-[14px] text-gray-700 dark:text-gray-300">No Consultation Shares Active</h4>
                <p className="text-[12px] text-gray-400 mt-1 max-w-xs mx-auto">
                  When a patient triggers a "Consult Doctor" request, their HelpAid ID and medical history brief will populate here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeConsultations.map((consult) => (
                  <div
                    key={consult.consultationId}
                    className="bg-white dark:bg-gray-950 rounded-[28px] border border-gray-100 dark:border-gray-900 p-5 flex flex-col justify-between gap-4 shadow-xs hover:border-blue-200 dark:hover:border-blue-900 transition-all"
                  >
                    <div>
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] font-black text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2.5 py-1 rounded">
                          {consult.consultationId}
                        </span>
                        <span className="text-[10px] font-black text-amber-600 bg-amber-50 dark:bg-amber-950/20 px-2 py-0.5 rounded uppercase tracking-wider">
                          {consult.status}
                        </span>
                      </div>
                      <p className="text-[12px] font-bold text-gray-500 mt-3">
                        Internal ID Reference: <span className="text-gray-900 dark:text-white">{consult.userId}</span>
                      </p>
                      {consult.medicalSummary && (
                        <p className="text-[12px] font-medium text-gray-600 dark:text-gray-400 mt-1.5 italic">
                          "{consult.medicalSummary}"
                        </p>
                      )}
                    </div>

                    <button
                      onClick={() => {
                        // In mock mode, if we don't have publicId direct, let's query patient summary by ID
                        // Let's assume patients have profiles; we look up based on user ID
                        // We will prompt the doctor to input the HelpAid ID or look it up directly:
                        alert(`Patient User ID: ${consult.userId}\nReports shared: ${consult.reportsShared.join(', ')}`);
                      }}
                      className="w-full py-2.5 bg-gray-50 dark:bg-gray-900 hover:bg-blue-50 dark:hover:bg-blue-950/20 text-blue-600 font-extrabold text-[11px] uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5 active:scale-95"
                    >
                      <Eye size={13} />
                      View Shared Records
                    </button>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* ── PATIENT SUMMARY BRIEFING RENDER ── */}
        {summary && (
          <motion.div
            key="patient-summary"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* PATIENT PROFILE CARD */}
            <div className="bg-white dark:bg-gray-950 rounded-[32px] border border-gray-100 dark:border-gray-900 p-6 flex flex-col md:flex-row items-center gap-6 shadow-xs">
              <div className="w-20 h-20 bg-blue-50 dark:bg-blue-950 rounded-full flex items-center justify-center text-blue-600 shrink-0 shadow-inner overflow-hidden">
                {summary.profile.profilePhoto ? (
                  <img src={summary.profile.profilePhoto} alt="Patient Avatar" className="w-full h-full object-cover" />
                ) : (
                  <User size={36} />
                )}
              </div>
              <div className="flex-1 min-w-0 text-center md:text-left">
                <div className="flex flex-wrap justify-center md:justify-start items-center gap-2">
                  <span className="px-3 py-1 bg-red-600 text-white text-[10px] font-black uppercase tracking-widest rounded-md">
                    {summary.profile.publicId}
                  </span>
                  <span className="px-2.5 py-1 bg-gray-100 dark:bg-gray-900 text-gray-500 text-[10px] font-bold rounded">
                    Blood: {summary.profile.bloodGroup || 'N/A'}
                  </span>
                </div>
                <h2 className="text-[20px] font-black text-gray-900 dark:text-white mt-2 leading-none">
                  {summary.profile.fullName || summary.profile.displayName || 'Unnamed Patient'}
                </h2>
                <div className="flex flex-wrap justify-center md:justify-start gap-x-4 gap-y-1 text-[12px] text-gray-500 font-semibold mt-2">
                  <span className="flex items-center gap-1">
                    <Calendar size={13} /> Age {summary.profile.age || 'N/A'} ({summary.profile.gender || 'N/A'})
                  </span>
                  <span className="flex items-center gap-1">
                    <Phone size={13} /> {summary.profile.mobileNumber || 'N/A'}
                  </span>
                  <span className="flex items-center gap-1">
                    <Mail size={13} /> {summary.profile.email || 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            {/* CLINICAL VAULT: PERMANENT HEALTH PROFILE */}
            <div className="bg-white dark:bg-gray-950 rounded-[32px] border border-gray-100 dark:border-gray-900 p-6 space-y-5 shadow-xs">
              <div className="flex items-center gap-2 pb-2.5 border-b border-gray-50 dark:border-gray-900">
                <BriefcaseMedical size={15} className="text-red-500" />
                <h3 className="font-extrabold text-gray-900 dark:text-white text-[13px] uppercase tracking-wider leading-none">
                  Permanent Medical Record
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">
                      Drug / Environmental Allergies
                    </span>
                    {summary.profile.allergies?.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {summary.profile.allergies.map(a => (
                          <span key={a} className="px-2.5 py-1 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 text-[11px] font-extrabold rounded-md border border-red-100/50">
                            {a}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[12px] text-gray-400 font-medium italic">No known allergies logged.</span>
                    )}
                  </div>

                  <div>
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">
                      Chronic Diseases & Conditions
                    </span>
                    {summary.profile.diseases?.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {summary.profile.diseases.map(d => (
                          <span key={d} className="px-2.5 py-1 bg-orange-50 dark:bg-orange-950/20 text-orange-600 dark:text-amber-500 text-[11px] font-extrabold rounded-md border border-orange-100/30">
                            {d}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[12px] text-gray-400 font-medium italic">No chronic diseases logged.</span>
                    )}
                  </div>

                  <div>
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">
                      Active Medications & Prescriptions
                    </span>
                    {summary.profile.medications?.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {summary.profile.medications.map(m => (
                          <span key={m} className="px-2.5 py-1 bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 text-[11px] font-extrabold rounded-md border border-blue-100/50">
                            {m}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[12px] text-gray-400 font-medium italic">No active medications registered.</span>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">
                      Past Injuries & Traumas
                    </span>
                    {summary.profile.previousInjuries?.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {summary.profile.previousInjuries.map(i => (
                          <span key={i} className="px-2.5 py-1 bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-300 text-[11px] font-extrabold rounded-md">
                            {i}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[12px] text-gray-400 font-medium italic">No previous major injuries logged.</span>
                    )}
                  </div>

                  <div>
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">
                      Clinical Brief & Notes
                    </span>
                    <p className="text-[12.5px] text-gray-700 dark:text-gray-350 leading-relaxed font-medium bg-gray-50 dark:bg-gray-900 p-3 rounded-[16px] border border-gray-50/50 dark:border-gray-800">
                      {summary.profile.medicalNotes || 'No permanent notes registered for this profile.'}
                    </p>
                  </div>

                  <div>
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">
                      Emergency Contacts
                    </span>
                    {summary.profile.emergencyContacts?.length > 0 ? (
                      <div className="space-y-1.5">
                        {summary.profile.emergencyContacts.map(c => (
                          <div key={c.phone} className="flex justify-between text-[12px] font-bold text-gray-700 dark:text-gray-300">
                            <span>{c.name}:</span>
                            <span className="text-red-600">{c.phone}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[12px] text-gray-400 font-medium italic">No emergency contacts logged.</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* PATIENT DIAGNOSTIC RECORDS GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Symptomchecker predictions */}
              <div className="bg-white dark:bg-gray-950 rounded-[32px] border border-gray-100 dark:border-gray-900 p-5 space-y-4 shadow-xs">
                <div className="flex items-center gap-2 pb-1.5 border-b border-gray-50 dark:border-gray-900">
                  <Activity size={14} className="text-gray-400" />
                  <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest leading-none">Symptom Diagnostic Runs ({summary.symptomHistory?.length || 0})</span>
                </div>
                <div className="space-y-2.5 max-h-[250px] overflow-y-auto pr-1">
                  {summary.symptomHistory?.length === 0 ? (
                    <p className="text-[12px] text-gray-400 italic">No disease predictions logged yet.</p>
                  ) : (
                    summary.symptomHistory.map((rep, idx) => (
                      <div key={idx} className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-[20px] border border-gray-50/50">
                        <div className="flex justify-between items-baseline">
                          <span className="font-extrabold text-[13px] text-gray-900 dark:text-white">{rep.predictedDisease}</span>
                          <span className="text-blue-600 font-bold text-[11px]">{rep.confidenceScore}%</span>
                        </div>
                        <p className="text-[11.5px] text-gray-500 mt-1">Symptoms: {rep.symptoms}</p>
                        <span className="text-[9px] text-gray-400 block mt-2">{new Date(rep.date).toLocaleDateString()} ({rep.severity} Severity)</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Injury reports */}
              <div className="bg-white dark:bg-gray-950 rounded-[32px] border border-gray-100 dark:border-gray-900 p-5 space-y-4 shadow-xs">
                <div className="flex items-center gap-2 pb-1.5 border-b border-gray-50 dark:border-gray-900">
                  <ShieldAlert size={14} className="text-gray-400" />
                  <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest leading-none">Injury Photo Scans ({summary.injuryHistory?.length || 0})</span>
                </div>
                <div className="space-y-2.5 max-h-[250px] overflow-y-auto pr-1">
                  {summary.injuryHistory?.length === 0 ? (
                    <p className="text-[12px] text-gray-400 italic">No injury scans uploaded yet.</p>
                  ) : (
                    summary.injuryHistory.map((rep, idx) => (
                      <div key={idx} className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-[20px] border border-gray-50/50 flex gap-3">
                        {rep.imageUrl && (
                          <img src={rep.imageUrl} alt="scan preview" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <h5 className="font-extrabold text-[12.5px] text-gray-900 dark:text-white truncate">{rep.injuryType}</h5>
                          <span className="text-[10px] font-bold text-red-600 block uppercase tracking-wide mt-0.5">{rep.severity} Severity</span>
                          <button
                            onClick={() => viewReport(rep)}
                            className="text-[10px] font-bold text-blue-600 hover:underline uppercase tracking-wider mt-2 block"
                          >
                            View Raw Analysis
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* MEDICAL TIMELINE (Timeline of Diagnostic history) */}
            <div className="bg-white dark:bg-gray-950 rounded-[32px] border border-gray-100 dark:border-gray-900 p-6 space-y-4 shadow-sm">
              <div className="flex items-center gap-2 pb-1 border-b border-gray-50 dark:border-gray-900">
                <Clock size={15} className="text-blue-500" />
                <h3 className="font-extrabold text-gray-900 dark:text-white text-[13px] uppercase tracking-wider leading-none">
                  HelpAid Medical Timeline
                </h3>
              </div>

              <div className="relative pl-6 border-l-2 border-blue-500/20 space-y-6 pt-2 ml-3">
                {summary.timeline?.length === 0 ? (
                  <p className="text-[12px] text-gray-400 italic">Timeline is empty.</p>
                ) : (
                  summary.timeline.map((event, idx) => (
                    <div key={idx} className="relative">
                      {/* Node point */}
                      <div className={cn(
                        "absolute -left-[31px] top-1 w-4.5 h-4.5 rounded-full border-2 border-white dark:border-gray-950 flex items-center justify-center shadow-sm text-white",
                        event.eventType === 'INJURY' ? "bg-red-600" :
                        event.eventType === 'SYMPTOM' ? "bg-amber-500" :
                        event.eventType === 'CHAT' ? "bg-blue-600" :
                        "bg-green-600"
                      )}>
                        <span className="text-[7px] font-bold">●</span>
                      </div>
                      <div>
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                          {new Date(event.eventDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <h4 className="font-bold text-[13.5px] text-gray-900 dark:text-white leading-tight mt-0.5">
                          {event.eventTitle}
                        </h4>
                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block mt-0.5">
                          Type: {event.eventType} (Ref: {event.referenceId})
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
