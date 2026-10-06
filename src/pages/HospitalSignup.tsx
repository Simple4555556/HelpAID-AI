import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Mail, Lock, Eye, EyeOff, UserPlus, AlertCircle, Loader2, Building2, Phone, MapPin, Hash, Shield } from 'lucide-react';
import { cn } from '../lib/utils';
import { API_BASE_URL } from '../config';

const API_BASE = API_BASE_URL;

export default function HospitalSignup({ onAuthSuccess }: { onAuthSuccess: (user: any) => void }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const [hospitalName, setHospitalName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [emergencyContactNumber, setEmergencyContactNumber] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hospitalName.trim()) { setError('Hospital name is required.'); return; }
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
          displayName: hospitalName,
          role: 'hospital',
          phone,
          hospitalName,
          address,
          city,
          state,
          emergencyContactNumber,
          licenseNumber
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed.');

      if (data.token) localStorage.setItem('helpaid_token', data.token);
      if (data.user) localStorage.setItem('helpaid_user', JSON.stringify(data.user));

      const mappedUser = {
        uid: data.user.id,
        email: data.user.email,
        displayName: hospitalName,
        role: 'hospital',
        photoURL: `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`,
        hospitalProfileId: data.user.hospitalProfileId,
        ...data.user
      };
      onAuthSuccess(mappedUser);
      navigate('/hospital-sos');
    } catch (err: any) {
      setError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="min-h-[85vh] flex flex-col items-center justify-center px-4 py-6">
      <div className="flex items-center gap-2.5 mb-6">
        <div className="w-11 h-11 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200 dark:shadow-blue-900/30 text-white">
          <Building2 size={24} strokeWidth={2.5} />
        </div>
        <div>
          <span className="font-extrabold text-xl tracking-tight text-gray-900 dark:text-white">Hospital</span>
          <span className="text-blue-600 dark:text-blue-400 font-extrabold text-xl"> Registration</span>
        </div>
      </div>

      <div className="w-full max-w-md bg-white dark:bg-gray-950 rounded-[32px] border border-gray-100 dark:border-gray-800 shadow-2xl shadow-gray-200/40 dark:shadow-black/30 overflow-hidden">
        <div className="px-8 pt-7 pb-3">
          <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Register Hospital</h1>
          <p className="text-sm text-gray-400 mt-1">Receive real-time emergency SOS dispatches.</p>
        </div>

        <form onSubmit={handleRegister} className="px-8 pb-6 space-y-3.5">
          {error && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
              className="p-3 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 rounded-2xl text-xs font-bold flex items-center gap-2 border border-red-100 dark:border-red-900/30">
              <AlertCircle size={15} className="shrink-0" /><span>{error}</span>
            </motion.div>
          )}

          <Field icon={Building2} label="Hospital Name" value={hospitalName} onChange={setHospitalName} placeholder="City General Hospital" />
          <div className="grid grid-cols-2 gap-3">
            <Field icon={Phone} label="Mobile Number" value={phone} onChange={setPhone} placeholder="+91 98765..." type="tel" />
            <Field icon={Phone} label="Emergency Contact" value={emergencyContactNumber} onChange={setEmergencyContactNumber} placeholder="+91 11223..." type="tel" />
          </div>
          <Field icon={Mail} label="Email Address" value={email} onChange={setEmail} placeholder="admin@hospital.com" type="email" />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 text-gray-400" size={16} />
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••"
                  className="w-full pl-11 pr-10 py-3.5 bg-gray-50 dark:bg-gray-900 border border-transparent focus:border-blue-500 rounded-2xl text-sm font-semibold focus:outline-none transition-all placeholder:text-gray-400" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3.5 text-gray-400">
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Confirm</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 text-gray-400" size={16} />
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••"
                  className="w-full pl-11 pr-4 py-3.5 bg-gray-50 dark:bg-gray-900 border border-transparent focus:border-blue-500 rounded-2xl text-sm font-semibold focus:outline-none transition-all placeholder:text-gray-400" />
              </div>
            </div>
          </div>
          <Field icon={MapPin} label="Address" value={address} onChange={setAddress} placeholder="123 Medical Lane, Sector 5" />
          <div className="grid grid-cols-2 gap-3">
            <Field icon={MapPin} label="City" value={city} onChange={setCity} placeholder="Mumbai" />
            <Field icon={MapPin} label="State" value={state} onChange={setState} placeholder="Maharashtra" />
          </div>
          <Field icon={Hash} label="Hospital License Number" value={licenseNumber} onChange={setLicenseNumber} placeholder="HL-2024-12345" />

          <button type="submit" disabled={loading}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg shadow-blue-500/20 mt-2">
            {loading ? (<><Loader2 size={16} className="animate-spin" /> Registering...</>) : (<><UserPlus size={16} /> Register Hospital</>)}
          </button>
        </form>

        <div className="px-8 pb-6">
          <p className="text-center text-sm text-gray-400">
            Already registered?{' '}<Link to="/login" className="font-bold text-blue-600 dark:text-blue-400 hover:underline">Sign In</Link>
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function Field({ icon: Icon, label, value, onChange, placeholder, type = 'text' }: {
  icon: any; label: string; value: string; onChange: (v: string) => void; placeholder: string; type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">{label}</label>
      <div className="relative">
        <Icon className="absolute left-3.5 top-3.5 text-gray-400" size={16} />
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className="w-full pl-11 pr-4 py-3.5 bg-gray-50 dark:bg-gray-900 border border-transparent focus:border-blue-500 rounded-2xl text-sm font-semibold focus:outline-none transition-all placeholder:text-gray-400" />
      </div>
    </div>
  );
}
