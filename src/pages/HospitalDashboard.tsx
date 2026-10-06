import React, { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { Bell, MapPin, Activity, CheckCircle, XCircle, Clock, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { API_BASE_URL } from '../config';

// Using the same URL as the API
const SOCKET_URL = (import.meta as any).env.VITE_API_URL || '/';

export default function HospitalDashboard({ user }: { user: any }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [pendingCases, setPendingCases] = useState<any[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  // Use hospital id from user profile; do not fall back to mock ids
  const hospitalId = user?.hospitalId || (localStorage.getItem('helpaid_user') ? JSON.parse(localStorage.getItem('helpaid_user') || '{}').hospitalId : null);

  useEffect(() => {
    // Connect to WebSockets
    const newSocket = io(SOCKET_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setIsConnected(true);
      // Inform server we're online so it joins rooms and updates DB
      const stored = JSON.parse(localStorage.getItem('helpaid_user') || '{}');
      newSocket.emit('user:online', { userId: user?.id || stored.id, role: 'hospital', profileId: hospitalId });
      console.log('SOCKET_CONNECTED', { socketId: newSocket.id, hospitalId });
      fetchPendingCases(); // Initial fetch
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
    });

    // Listen for new emergency alerts
    newSocket.on('sos:new', (caseData) => {
      console.log('SOS_RECEIVED', caseData.caseId, caseData.patientName);
      setPendingCases(prev => {
        // Prevent duplicates
        if (prev.find(c => c.caseId === caseData.caseId)) return prev;
        return [caseData, ...prev];
      });
      
      // Play alert sound
      try {
        const audio = new Audio('/alert.mp3');
        audio.play().catch(e => console.log('Audio play blocked by browser.'));
      } catch (e) {}
    });

    newSocket.on('case_locked', (data) => {
      console.log('Case locked by another hospital:', data);
      setPendingCases(prev => prev.filter(c => c.caseId !== data.caseId));
    });

    return () => {
      newSocket.close();
    };
  }, [hospitalId]);

  const fetchPendingCases = async () => {
    try {
      const token = localStorage.getItem('helpaid_token');
      const res = await fetch(`${API_BASE_URL}/api/emergency/pending?hospitalId=${hospitalId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.cases) {
        // Map db fields to dashboard fields
        const mapped = data.cases.map((c: any) => ({
          caseId: c._id,
          patientName: c.patientName,
          injuryType: c.injuryType,
          severity: c.severity,
          lat: c.lat,
          lng: c.lng,
          reportData: c.reportData
        }));
        setPendingCases(mapped);
      }
    } catch (err) {
      console.error('Failed to fetch pending cases', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (caseId: string, action: 'accept' | 'reject') => {
    try {
      const token = localStorage.getItem('helpaid_token');
      if (action === 'accept') {
        const res = await fetch(`${API_BASE_URL}/api/sos/accept-hospital`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}` 
          },
          body: JSON.stringify({ caseId })
        });
        const data = await res.json();
        if (!data.success) {
          console.error('[HospitalDashboard] Accept failed:', data.error);
        }
      } else if (action === 'reject') {
        const res = await fetch(`${API_BASE_URL}/api/sos/reject`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}` 
          },
          body: JSON.stringify({ caseId })
        });
        const data = await res.json();
        if (!data.success) {
          console.error('[HospitalDashboard] Reject failed:', data.error);
        }
      }
      
      // Remove from pending list regardless
      setPendingCases(prev => prev.filter(c => c.caseId !== caseId));

    } catch (err) {
      console.error(`Failed to ${action} case`, err);
    }
  };

  if (loading) return <div className="p-8">Loading Dashboard...</div>;

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <header className="mb-8 flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Activity className="text-red-600" /> Emergency Response Portal
          </h1>
          <p className="text-slate-500 text-sm font-semibold">Hospital ID: {hospitalId}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-lg border border-slate-200">
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
            <span className="text-sm font-bold text-slate-600">{isConnected ? 'System Active' : 'Disconnected'}</span>
          </div>
          <button className="relative p-2 bg-blue-50 text-blue-600 rounded-lg">
            <Bell size={20} />
            {pendingCases.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {pendingCases.length}
              </span>
            )}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Alerts Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-lg font-black text-slate-800 flex items-center gap-2 mb-4">
            <ShieldAlert className="text-orange-500" /> Incoming Alerts ({pendingCases.length})
          </h2>

          <AnimatePresence>
            {pendingCases.length === 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white p-8 rounded-xl text-center border border-slate-200 border-dashed text-slate-400">
                <CheckCircle size={32} className="mx-auto mb-2 opacity-50 text-green-500" />
                <p className="font-semibold text-sm">No pending emergencies.</p>
                <p className="text-xs mt-1">Listening for incoming dispatch alerts...</p>
              </motion.div>
            ) : (
              pendingCases.map(c => (
                <motion.div 
                  key={c.caseId}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="bg-white border border-red-200 shadow-md rounded-xl p-4 relative overflow-hidden"
                >
                  <div className="absolute top-0 left-0 w-1 h-full bg-red-600 animate-pulse"></div>
                  
                  <div className="flex justify-between items-start mb-3 pl-2">
                    <div>
                      <span className="inline-block px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-black tracking-widest uppercase rounded mb-1">
                        {c.severity}
                      </span>
                      <h3 className="font-bold text-slate-900">{c.injuryType}</h3>
                    </div>
                    <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
                      <Clock size={12} /> {c.distanceKm || '?'} km away
                    </span>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-lg text-sm mb-4 border border-slate-100">
                    <p className="font-semibold text-slate-700">Patient: <span className="font-normal">{c.patientName}</span></p>
                    <p className="font-semibold text-slate-700 truncate mt-1">
                      <MapPin size={12} className="inline mr-1 text-slate-400" />
                      Location: {c.lat.toFixed(4)}, {c.lng.toFixed(4)}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleAction(c.caseId, 'accept')}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-2 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
                    >
                      <CheckCircle size={16} /> Accept
                    </button>
                    <button 
                      onClick={() => handleAction(c.caseId, 'reject')}
                      className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
                    >
                      <XCircle size={16} /> Reject
                    </button>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>

        {/* Selected Case Details (Mocked Layout) */}
        <div className="lg:col-span-2">
          {pendingCases.length > 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden h-full">
              <div className="bg-slate-800 text-white p-4">
                <h2 className="font-bold text-lg">AI Diagnosis Pre-Arrival Report</h2>
                <p className="text-slate-400 text-xs">Generated by HelpAid AI Vision Engine</p>
              </div>
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-orange-50 border border-orange-100 rounded-xl">
                    <p className="text-xs font-bold text-orange-800 uppercase tracking-wider mb-1">Detected Injury</p>
                    <p className="text-lg font-black text-orange-900">{pendingCases[0].reportData?.injuryType || pendingCases[0].injuryType}</p>
                  </div>
                  <div className="p-4 bg-red-50 border border-red-100 rounded-xl">
                    <p className="text-xs font-bold text-red-800 uppercase tracking-wider mb-1">Blood Loss Risk</p>
                    <p className="text-lg font-black text-red-900">{pendingCases[0].reportData?.riskFactors?.bloodLossRisk || 'Unknown'}</p>
                  </div>
                </div>

                <div>
                  <h3 className="font-bold text-slate-800 mb-2">Recommended Preparations</h3>
                  <ul className="space-y-2">
                    {pendingCases[0].reportData?.firstAidRecommendations?.map((rec: string, i: number) => (
                      <li key={i} className="flex gap-2 text-sm text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <CheckCircle size={16} className="text-blue-500 shrink-0" />
                        {rec}
                      </li>
                    )) || <li className="text-sm text-slate-500">Prepare trauma bay.</li>}
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 rounded-xl border border-slate-200 border-dashed h-full flex items-center justify-center text-slate-400">
              <p className="font-semibold">Select an incoming alert to view AI report details.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
