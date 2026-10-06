import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Mail, Lock, Eye, EyeOff, Truck, AlertCircle, Loader2, Activity } from 'lucide-react';
import { cn } from '../lib/utils';
import { API_BASE_URL } from '../config';

export default function AmbulanceLogin({ onAuthSuccess }: { onAuthSuccess: (user: any) => void }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError('Email is required.'); return; }
    if (!password) { setError('Password is required.'); return; }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed.');

      if (data.user?.role !== 'ambulance_driver' && data.user?.role !== 'ambulance') {
        throw new Error('This login page is for ambulance drivers only. Please use the main login page.');
      }

      const userData = {
        ...data.user,
        uid: data.user.id,
        displayName: data.user.displayName || 'Ambulance Driver',
        photoURL: `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.user.email}`
      };

      localStorage.setItem('helpaid_token', data.token);
      localStorage.setItem('helpaid_user', JSON.stringify(userData));

      onAuthSuccess(userData);
      navigate('/ambulance-dashboard', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-[85vh] flex flex-col items-center justify-center px-4 py-6"
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 mb-8">
        <img
          src="/logo.svg"
          alt="HelpAid Logo"
          className="w-11 h-11 rounded-2xl shadow-lg shadow-amber-200 dark:shadow-amber-900/30 object-contain"
        />
        <div>
          <span className="font-extrabold text-xl tracking-tight text-gray-900 dark:text-white">HelpAid</span>
          <span className="text-amber-600 dark:text-amber-400 font-extrabold text-xl"> Ambulance</span>
        </div>
      </div>

      {/* Card */}
      <div className="w-full max-w-md bg-white dark:bg-gray-950 rounded-[32px] border border-gray-100 dark:border-gray-800 shadow-2xl shadow-gray-200/40 dark:shadow-black/30 overflow-hidden">
        {/* Header */}
        <div className="px-8 pt-8 pb-5">
          <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Driver Login</h1>
          <p className="text-sm text-gray-400 mt-1">Sign in to your ambulance dispatch panel</p>
        </div>

        {/* Urgent Banner */}
        <div className="mx-8 mb-5 p-3.5 bg-amber-50 dark:bg-amber-950/20 rounded-2xl border border-amber-100 dark:border-amber-900/30 flex items-center gap-3">
          <div className="w-8 h-8 bg-amber-500 rounded-xl flex items-center justify-center shrink-0">
            <Activity size={16} className="text-white" />
          </div>
          <p className="text-[11px] font-bold text-amber-800 dark:text-amber-300 leading-snug">
            Your dashboard receives live emergency dispatches. Log in to start accepting emergency runs.
          </p>
        </div>

        <form onSubmit={handleLogin} className="px-8 pb-6 space-y-4">
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3.5 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 rounded-2xl text-xs font-bold flex items-center gap-2 border border-red-100 dark:border-red-900/30"
            >
              <AlertCircle size={15} className="shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}

          {/* Email */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3.5 text-gray-400" size={16} />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="driver@helpaid.com"
                className="w-full pl-11 pr-4 py-3.5 bg-gray-50 dark:bg-gray-900 border border-transparent focus:border-amber-500 rounded-2xl text-sm font-semibold focus:outline-none transition-all placeholder:text-gray-400"
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3.5 text-gray-400" size={16} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••"
                className="w-full pl-11 pr-12 py-3.5 bg-gray-50 dark:bg-gray-900 border border-transparent focus:border-amber-500 rounded-2xl text-sm font-semibold focus:outline-none transition-all placeholder:text-gray-400"
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-3.5 text-gray-400 hover:text-gray-600">
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={cn(
              "w-full py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all shadow-lg mt-2",
              loading
                ? "bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed"
                : "bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/25 active:scale-[0.98]"
            )}
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Truck size={18} />}
            {loading ? 'Signing In...' : 'Sign In to Dashboard'}
          </button>
        </form>

        {/* Footer */}
        <div className="px-8 pb-6 space-y-3">
          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Or</span>
            <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
          </div>
          <p className="text-center text-sm text-gray-400">
            New driver?{' '}
            <Link to="/ambulance-signup" className="font-bold text-amber-500 hover:underline">Register your unit</Link>
          </p>
          <p className="text-center text-xs text-gray-400 mt-1">
            Not a driver?{' '}
            <Link to="/login" className="font-bold text-blue-600 dark:text-blue-400 hover:underline">Main Login</Link>
          </p>
        </div>
      </div>
    </motion.div>
  );
}
