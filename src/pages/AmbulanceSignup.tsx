import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Mail, Lock, Eye, EyeOff, Truck, AlertCircle, Loader2, User, Phone, Activity, Hash, Building2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { API_BASE_URL } from '../config';

const API_BASE = API_BASE_URL;

const VEHICLE_TYPES = ['Basic Life Support (BLS)', 'Advanced Life Support (ALS)', 'Patient Transport', 'Neonatal', 'Air Ambulance', 'Other'];

export default function AmbulanceSignup({ onAuthSuccess }: { onAuthSuccess: (user: any) => void }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [vehicleType, setVehicleType] = useState('Basic Life Support (BLS)');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [hospitalAffiliation, setHospitalAffiliation] = useState('');

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Full name is required.'); return; }
    if (!phone.trim()) { setError('Mobile number is required.'); return; }
    if (!email.trim()) { setError('Email is required.'); return; }
    if (!password || password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          displayName: name,
          role: 'ambulance_driver',
          phone,
          name,
          vehicleType,
          vehicleNumber,
          hospitalAffiliation
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Registration failed.');

      const userData = {
        ...data.user,
        uid: data.user.id,
        displayName: data.user.displayName || name
      };

      localStorage.setItem('helpaid_token', data.token);
      localStorage.setItem('helpaid_user', JSON.stringify(userData));

      onAuthSuccess(userData);
      navigate('/ambulance-dashboard', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Registration failed.');
    }
    setLoading(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-md mx-auto py-8 px-4"
    >
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 mx-auto bg-amber-600 rounded-2xl flex items-center justify-center shadow-xl shadow-amber-500/30 mb-4">
          <Truck size={30} className="text-white" />
        </div>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">Ambulance Driver Signup</h1>
        <p className="text-gray-500 text-sm mt-1">Register your unit to receive emergency dispatches</p>
      </div>

      <form onSubmit={handleRegister} className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-xl p-6 space-y-4">
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 rounded-xl text-sm font-semibold border border-red-100 dark:border-red-900/30">
            <AlertCircle size={16} className="shrink-0" />
            {error}
          </div>
        )}

        {/* Name */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Driver Full Name</label>
          <div className="relative">
            <User className="absolute left-3.5 top-3.5 text-gray-400" size={16} />
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="John Doe"
              className="w-full pl-11 pr-4 py-3.5 bg-gray-50 dark:bg-gray-800 border border-transparent focus:border-amber-500 rounded-2xl text-sm font-semibold focus:outline-none transition-all" />
          </div>
        </div>

        {/* Phone */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Mobile Number</label>
          <div className="relative">
            <Phone className="absolute left-3.5 top-3.5 text-gray-400" size={16} />
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 9876543210"
              className="w-full pl-11 pr-4 py-3.5 bg-gray-50 dark:bg-gray-800 border border-transparent focus:border-amber-500 rounded-2xl text-sm font-semibold focus:outline-none transition-all" />
          </div>
        </div>

        {/* Vehicle Type */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Vehicle Type</label>
          <div className="relative">
            <Activity className="absolute left-3.5 top-3.5 text-gray-400" size={16} />
            <select value={vehicleType} onChange={e => setVehicleType(e.target.value)}
              className="w-full pl-11 pr-4 py-3.5 bg-gray-50 dark:bg-gray-800 border border-transparent focus:border-amber-500 rounded-2xl text-sm font-semibold focus:outline-none transition-all cursor-pointer appearance-none">
              {VEHICLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        {/* Vehicle Number */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Vehicle Registration Number</label>
          <div className="relative">
            <Hash className="absolute left-3.5 top-3.5 text-gray-400" size={16} />
            <input type="text" value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value)} placeholder="UP 32 AB 1234"
              className="w-full pl-11 pr-4 py-3.5 bg-gray-50 dark:bg-gray-800 border border-transparent focus:border-amber-500 rounded-2xl text-sm font-semibold focus:outline-none transition-all" />
          </div>
        </div>

        {/* Hospital Affiliation */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Hospital Affiliation <span className="text-gray-400 normal-case">(Optional)</span></label>
          <div className="relative">
            <Building2 className="absolute left-3.5 top-3.5 text-gray-400" size={16} />
            <input type="text" value={hospitalAffiliation} onChange={e => setHospitalAffiliation(e.target.value)} placeholder="E.g., City General Hospital"
              className="w-full pl-11 pr-4 py-3.5 bg-gray-50 dark:bg-gray-800 border border-transparent focus:border-amber-500 rounded-2xl text-sm font-semibold focus:outline-none transition-all" />
          </div>
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Email</label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-3.5 text-gray-400" size={16} />
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="driver@example.com"
              className="w-full pl-11 pr-4 py-3.5 bg-gray-50 dark:bg-gray-800 border border-transparent focus:border-amber-500 rounded-2xl text-sm font-semibold focus:outline-none transition-all" />
          </div>
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Password</label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-3.5 text-gray-400" size={16} />
            <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 6 characters"
              className="w-full pl-11 pr-12 py-3.5 bg-gray-50 dark:bg-gray-800 border border-transparent focus:border-amber-500 rounded-2xl text-sm font-semibold focus:outline-none transition-all" />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-3.5 text-gray-400 hover:text-gray-600">
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {/* Confirm Password */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Confirm Password</label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-3.5 text-gray-400" size={16} />
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Re-enter password"
              className="w-full pl-11 pr-4 py-3.5 bg-gray-50 dark:bg-gray-800 border border-transparent focus:border-amber-500 rounded-2xl text-sm font-semibold focus:outline-none transition-all" />
          </div>
        </div>

        <button type="submit" disabled={loading}
          className={cn(
            "w-full py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all shadow-lg mt-2",
            loading
              ? "bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed"
              : "bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/25 active:scale-[0.98]"
          )}
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : <Truck size={18} />}
          {loading ? 'Registering...' : 'Register Ambulance Unit'}
        </button>

        <p className="text-center text-xs text-gray-400 pt-2">
          Already registered?{' '}
          <Link to="/login" className="text-amber-500 font-bold hover:underline">Sign in here</Link>
        </p>
      </form>
    </motion.div>
  );
}
