import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Upload, Database, Shield, Lock, FileText, CheckCircle, AlertTriangle, Activity, Users, Store, HeartPulse, Building2, Eye, EyeOff, RefreshCw
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { API_BASE_URL } from '../config';

const API_BASE = API_BASE_URL + '/api';

interface Stats {
  hospitals: number;
  hospitalsVerified: number;
  hospitalsUnverified: number;
  doctors: number;
  doctorsVerified: number;
  doctorsUnverified: number;
  bloodBanks: number;
  bloodBanksVerified: number;
  bloodBanksUnverified: number;
  medicalStores: number;
  medicalStoresVerified: number;
  medicalStoresUnverified: number;
  policeStations: number;
  policeStationsVerified: number;
  policeStationsUnverified: number;
}

export default function AdminDashboard() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('adminToken'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Dashboard Stats & Upload States
  const [stats, setStats] = useState<Stats | null>(null);
  const [lastImportTime, setLastImportTime] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [selectedType, setSelectedType] = useState('hospitals');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [uploadResult, setUploadResult] = useState<string>('');

  // Live OSM Sync States
  const [syncProgress, setSyncProgress] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [syncResult, setSyncResult] = useState<string>('');

  // Security & Tab States
  const [activeTab, setActiveTab] = useState<'infrastructure' | 'security'>('infrastructure');
  const [consentLogs, setConsentLogs] = useState<any[]>([]);
  const [loadingConsentLogs, setLoadingConsentLogs] = useState(false);

  useEffect(() => {
    if (token) {
      fetchStats();
      fetchConsentLogs();
    }
  }, [token]);

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401 || res.status === 403) {
        handleLogout();
        return;
      }
      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
        setLastImportTime(data.lastImportTime);
        setImportErrors(data.importErrors);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  const fetchConsentLogs = async () => {
    setLoadingConsentLogs(true);
    try {
      const res = await fetch(`${API_BASE}/admin/consent-logs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401 || res.status === 403) {
        handleLogout();
        return;
      }
      const data = await res.json();
      if (data.success) {
        setConsentLogs(data.logs);
      }
    } catch (err) {
      console.error('Failed to fetch consent logs:', err);
    } finally {
      setLoadingConsentLogs(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.setItem('adminToken', data.token);
        setToken(data.token);
      } else {
        setAuthError(data.error || 'Authentication failed. Please check credentials.');
      }
    } catch (err) {
      setAuthError('Connection to server failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    setToken(null);
    setStats(null);
    setSelectedFile(null);
    setUploadProgress('idle');
    setSyncProgress('idle');
    setSyncResult('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setUploadProgress('idle');
      setUploadResult('');
    }
  };

  const handleImportCSV = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setUploadProgress('uploading');
    setUploadResult('');

    const formData = new FormData();
    formData.append('image', selectedFile); // Backend maps raw buffer from multer field 'image'

    try {
      const res = await fetch(`${API_BASE}/import-csv?type=${selectedType}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUploadProgress('success');
        setUploadResult(data.message || 'Dataset imported successfully!');
        fetchStats(); // Refresh dashboard counts
        setSelectedFile(null);
      } else {
        setUploadProgress('error');
        setUploadResult(data.error || 'Failed to import CSV dataset.');
        fetchStats(); // Refresh to show failure log errors
      }
    } catch (err) {
      setUploadProgress('error');
      setUploadResult('Failed to connect to server during upload.');
    }
  };

  const handleOSMSync = async () => {
    setSyncProgress('syncing');
    setSyncResult('');
    try {
      const res = await fetch(`${API_BASE}/sync-osm`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSyncProgress('success');
        setSyncResult(data.message || 'Real-time sync complete!');
        fetchStats(); // Refresh counts
      } else {
        setSyncProgress('error');
        setSyncResult(data.error || 'OSM synchronization failed.');
        fetchStats(); // Refresh to see error log
      }
    } catch (err) {
      setSyncProgress('error');
      setSyncResult('Failed to connect to sync server.');
    }
  };

  // ────────── LOGIN SCREEN ──────────
  if (!token) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl border border-gray-100 dark:border-gray-800 rounded-3xl p-8 shadow-2xl shadow-blue-500/10"
        >
          <div className="flex flex-col items-center mb-6">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center text-blue-600 dark:text-blue-400 mb-3">
              <Shield size={24} />
            </div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white">Admin Terminal</h1>
            <p className="text-gray-500 dark:text-gray-400 text-xs mt-1">HelpAid AI Core Control Panel</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@helpaid.com"
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-gray-950/50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-gray-950/50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {authError && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 text-red-600 bg-red-50 dark:bg-red-950/20 text-xs p-3 rounded-xl border border-red-100 dark:border-red-900/30"
              >
                <AlertTriangle size={14} />
                <span>{authError}</span>
              </motion.div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#1D58D8] text-white font-bold text-sm py-3.5 rounded-2xl shadow-lg shadow-blue-500/25 active:scale-98 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Lock size={15} />
              {isLoading ? 'Authenticating...' : 'Sign In as Administrator'}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  // ────────── DASHBOARD SCREEN ──────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center bg-white/40 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-850 p-4 rounded-3xl backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold text-xs uppercase tracking-widest">
            <Activity size={14} />
            <span>Admin Terminal</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white leading-none mt-1">Core Infrastructure Settings</h1>
        </div>
        <button
          onClick={handleLogout}
          className="text-xs font-bold text-gray-500 hover:text-red-500 bg-gray-100 dark:bg-gray-800 dark:hover:bg-red-900/20 px-4 py-2 rounded-2xl active:scale-95 transition-all"
        >
          Sign Out
        </button>
      </div>

      {/* Tabs Control */}
      <div className="flex gap-2 p-1 bg-gray-150/80 dark:bg-gray-800/40 rounded-2xl w-fit border border-slate-200/40 dark:border-slate-800">
        <button
          onClick={() => setActiveTab('infrastructure')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'infrastructure'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10'
              : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          Infrastructure Directory
        </button>
        <button
          onClick={() => { setActiveTab('security'); fetchConsentLogs(); }}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'security'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10'
              : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          Security & Consent Auditor
        </button>
      </div>

      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { key: 'hospitals', label: 'Hospitals', icon: Building2, val: stats?.hospitals, color: 'text-blue-500 bg-blue-50 dark:bg-blue-900/20' },
          { key: 'doctors', label: 'Doctors', icon: Users, val: stats?.doctors, color: 'text-green-500 bg-green-50 dark:bg-green-900/20' },
          { key: 'bloodBanks', label: 'Blood Banks', icon: HeartPulse, val: stats?.bloodBanks, color: 'text-red-500 bg-red-50 dark:bg-red-900/20' },
          { key: 'medicalStores', label: 'Medical Stores', icon: Store, val: stats?.medicalStores, color: 'text-purple-500 bg-purple-50 dark:bg-purple-900/20' },
          { key: 'policeStations', label: 'Police Stations', icon: Shield, val: stats?.policeStations, color: 'text-orange-500 bg-orange-50 dark:bg-orange-900/20' }
        ].map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.key} className="bg-white/60 dark:bg-gray-900/60 backdrop-blur-md rounded-2xl p-4 border border-gray-100 dark:border-gray-850 flex flex-col justify-between min-h-[120px]">
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-extrabold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{c.label}</span>
                <div className={`p-1.5 rounded-lg ${c.color}`}>
                  <Icon size={14} />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-black text-gray-950 dark:text-white block">
                  {c.val !== undefined ? c.val : '...'}
                </span>
                <div className="flex gap-2 text-[9px] text-gray-450 dark:text-gray-500 font-bold uppercase mt-1">
                  <span className="text-emerald-600 dark:text-emerald-400">V: {stats?.[`${c.key}Verified` as keyof Stats] ?? 0}</span>
                  <span className="text-red-500 dark:text-red-400">U: {stats?.[`${c.key}Unverified` as keyof Stats] ?? 0}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main CSV Uploader & Controls / Consent Logs Toggle */}
      {activeTab === 'infrastructure' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* CSV Import */}
          <div className="bg-white/60 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-850 rounded-3xl p-6 backdrop-blur-md space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Database className="text-blue-600" size={18} />
              <h2 className="text-base font-black text-gray-900 dark:text-white">Offline CSV Importer</h2>
            </div>

            <form onSubmit={handleImportCSV} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Select Target Collection</label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { value: 'hospitals', label: 'Hospitals' },
                    { value: 'doctors', label: 'Doctors' },
                    { value: 'blood_banks', label: 'Blood Banks' },
                    { value: 'medical_stores', label: 'Pharmacies' },
                    { value: 'police_stations', label: 'Police' }
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => { setSelectedType(opt.value); setUploadProgress('idle'); setUploadResult(''); }}
                      className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                        selectedType === opt.value
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-650 dark:text-gray-300 hover:bg-gray-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Drag & Drop Area */}
              <div className="border border-dashed border-gray-200 dark:border-gray-800 rounded-2xl p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:border-blue-500 transition-colors bg-white/30 dark:bg-black/10 relative min-h-[100px]">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Upload size={28} className="text-gray-400 dark:text-gray-500 mb-2" />
                {selectedFile ? (
                  <div>
                    <p className="text-xs font-bold text-blue-600 dark:text-blue-400">{selectedFile.name}</p>
                    <p className="text-[9px] text-gray-450">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs font-bold text-gray-700 dark:text-gray-350">Click or drag CSV file</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">Supports {selectedType.replace('_', ' ')}.csv</p>
                  </div>
                )}
              </div>

              {/* Upload results */}
              <AnimatePresence mode="wait">
                {uploadProgress === 'uploading' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 text-blue-650 bg-blue-50 dark:bg-blue-955/20 text-[10px] p-2.5 rounded-xl">
                    <Activity className="animate-spin" size={12} />
                    <span>Seeding records...</span>
                  </motion.div>
                )}

                {uploadProgress === 'success' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 text-green-600 bg-green-50 dark:bg-green-950/20 text-[10px] p-2.5 rounded-xl border border-green-100">
                    <CheckCircle size={12} />
                    <span className="line-clamp-2">{uploadResult}</span>
                  </motion.div>
                )}

                {uploadProgress === 'error' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 text-red-650 bg-red-50 dark:bg-red-950/20 text-[10px] p-2.5 rounded-xl border border-red-100">
                    <AlertTriangle size={12} />
                    <span className="line-clamp-2">{uploadResult}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                type="submit"
                disabled={!selectedFile || uploadProgress === 'uploading'}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2.5 rounded-xl disabled:opacity-50 transition-colors shadow-md shadow-blue-500/20 flex items-center justify-center gap-1.5"
              >
                <Database size={13} />
                Import CSV Records
              </button>
            </form>
          </div>

          {/* Real-time sync OSM */}
          <div className="bg-white/60 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-850 rounded-3xl p-6 backdrop-blur-md space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <RefreshCw className="text-green-655" size={18} />
              <h2 className="text-base font-black text-gray-900 dark:text-white">OSM Real-Time Sync</h2>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              Query the OpenStreetMap (OSM) Overpass API directly to gather real, active healthcare facilities, pharmacies, blood banks, and police stations within the boundaries of:
            </p>
            <div className="bg-gray-50/50 dark:bg-gray-950/40 rounded-2xl p-3 text-[10px] font-bold text-gray-650 dark:text-gray-400 grid grid-cols-2 gap-1 border border-gray-100/50 dark:border-gray-800">
              <span>✓ Lucknow</span>
              <span>✓ Kanpur Nagar</span>
              <span>✓ Kanpur Dehat</span>
              <span>✓ Unnao</span>
              <span>✓ Nawabganj</span>
            </div>

            <button
              onClick={handleOSMSync}
              disabled={syncProgress === 'syncing'}
              className="w-full py-2.5 bg-emerald-650 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl disabled:opacity-50 transition-colors shadow-md shadow-emerald-500/10 flex items-center justify-center gap-1.5 active:scale-[0.98]"
            >
              <RefreshCw size={13} className={syncProgress === 'syncing' ? 'animate-spin' : ''} />
              {syncProgress === 'syncing' ? 'Syncing Live OSM Data...' : 'Sync Live Directory Data'}
            </button>

            {syncResult && (
              <div className={`p-3 rounded-xl text-[10px] font-bold border ${
                syncProgress === 'success' ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-700 border-red-100'
              }`}>
                {syncResult}
              </div>
            )}
          </div>

          {/* Database Quick links / guides */}
          <div className="bg-white/60 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-850 rounded-3xl p-6 backdrop-blur-md space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="text-blue-600" size={18} />
              <h2 className="text-base font-black text-gray-900 dark:text-white">Importing Rules</h2>
            </div>

            <div className="space-y-3 text-xs text-gray-600 dark:text-gray-400">
              <p>Records are validated strictly. Files with duplicate titles or empty coordinates/addresses are rejected with logs.</p>
              
              <div className="border-t border-gray-100 dark:border-gray-800 pt-2">
                <span className="font-bold text-gray-900 dark:text-white">Hospitals Schema:</span>
                <p className="bg-gray-100 dark:bg-black/30 p-1.5 rounded-lg text-[8px] font-mono mt-1 overflow-x-auto whitespace-nowrap">
                  name,type,address,city,district,state,pincode,phone,latitude,longitude,specializations,emergencyAvailable,open24x7
                </p>
              </div>

              <div>
                <span className="font-bold text-gray-900 dark:text-white">Doctors Schema:</span>
                <p className="bg-gray-100 dark:bg-black/30 p-1.5 rounded-lg text-[8px] font-mono mt-1 overflow-x-auto whitespace-nowrap">
                  name,specialization,clinic,hospital,phone,city,district,experience,availability
                </p>
              </div>

              <div>
                <span className="font-bold text-gray-900 dark:text-white">Blood Banks Schema:</span>
                <p className="bg-gray-100 dark:bg-black/30 p-1.5 rounded-lg text-[8px] font-mono mt-1 overflow-x-auto whitespace-nowrap">
                  name,address,city,district,phone,latitude,longitude,availableBloodGroups,open24x7
                </p>
              </div>
            </div>
          </div>

          {/* Validation Logs section */}
          <div className="lg:col-span-3 bg-white/60 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-850 rounded-3xl p-6 backdrop-blur-md space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="text-blue-600" size={18} />
                <h2 className="text-base font-black text-gray-900 dark:text-white">Validation Errors & Import Logs</h2>
              </div>
              {lastImportTime && (
                <span className="text-[10px] text-gray-405 font-bold uppercase tracking-wider">
                  Last Seeding Event: {new Date(lastImportTime).toLocaleString()}
                </span>
              )}
            </div>

            {importErrors.length > 0 ? (
              <div className="space-y-2">
                <span className="text-[10px] font-black text-red-500 uppercase tracking-widest block">Validation Failures Recorded ({importErrors.length})</span>
                <div className="max-h-48 overflow-y-auto border border-red-100/50 dark:border-red-950/20 rounded-2xl p-4 bg-red-50/10 dark:bg-red-950/5 font-mono text-[10px] text-red-650 dark:text-red-400 space-y-1.5">
                  {importErrors.map((err, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-red-400 shrink-0">●</span>
                      <p>{err}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-6 bg-emerald-50/10 dark:bg-emerald-955/5 border border-emerald-100/20 rounded-2xl text-center">
                <p className="text-xs text-emerald-700 dark:text-emerald-400 font-bold">
                  ✓ No import or validation errors. All systems operational.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white/60 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-850 rounded-3xl p-6 backdrop-blur-md space-y-4">
          <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Shield className="text-blue-650" size={18} />
              <h2 className="text-base font-black text-gray-900 dark:text-white">Security & Consent Logs Auditor</h2>
            </div>
            <button
              onClick={fetchConsentLogs}
              className="text-[10px] font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1 bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-xl hover:bg-blue-100 transition-all"
            >
              <RefreshCw size={10} className={loadingConsentLogs ? 'animate-spin' : ''} />
              Refresh Audits
            </button>
          </div>

          {loadingConsentLogs ? (
            <div className="py-20 flex justify-center"><RefreshCw className="animate-spin text-blue-600" size={24} /></div>
          ) : consentLogs.length === 0 ? (
            <div className="p-16 text-center text-xs text-slate-400 font-semibold border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
              No consent audit logs recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-100 dark:border-slate-800 rounded-2xl">
              <table className="w-full text-left border-collapse text-[10px]">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 font-bold uppercase tracking-wider">
                    <th className="p-3">Timestamp</th>
                    <th className="p-3">User ID</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Case ID</th>
                    <th className="p-3">IP Address</th>
                    <th className="p-3">User Agent</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                  {consentLogs.map((log) => (
                    <tr key={log._id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 text-slate-700 dark:text-slate-350">
                      <td className="p-3 font-semibold">{new Date(log.timestamp).toLocaleString()}</td>
                      <td className="p-3 truncate max-w-[120px]" title={log.userId}>{log.userId}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-bold">
                          {log.consentType}
                        </span>
                      </td>
                      <td className="p-3 truncate max-w-[100px] text-slate-400" title={log.caseId}>{log.caseId || 'N/A'}</td>
                      <td className="p-3 text-slate-500">{log.ipAddress || 'Unknown'}</td>
                      <td className="p-3 truncate max-w-[200px] text-slate-400" title={log.userAgent}>{log.userAgent || 'Unknown'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}



