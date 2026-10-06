import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Mail, Lock, Eye, EyeOff, LogIn, AlertCircle, Loader2, Activity, ArrowRight, CheckCircle2, Smartphone, BriefcaseMedical, Building2, Truck } from 'lucide-react';
import { loginWithEmail, signIn } from '../firebase';
import { cn } from '../lib/utils';
import { API_BASE_URL } from '../config';

const API_BASE = API_BASE_URL;

export default function Login({ onAuthSuccess }: { onAuthSuccess: (user: any) => void }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<'user' | 'doctor' | 'hospital' | 'ambulance'>('user');

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }
    setLoading(true);
    setError(null);

    const isProvider = selectedRole !== 'user';

    if (isProvider) {
      try {
        const res = await fetch(`${API_BASE}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Login failed.');
        if (data.token) localStorage.setItem('helpaid_token', data.token);
        if (data.user) localStorage.setItem('helpaid_user', JSON.stringify(data.user));
        const mappedUser = {
          uid: data.user.id,
          email: data.user.email,
          displayName: data.user.displayName || 'HelpAid User',
          photoURL: `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.user.email}`,
          role: data.user.role
        };
        onAuthSuccess(mappedUser);
        const role = data.user.role;
        if (role === 'doctor') navigate('/doctor-sos');
        else if (role === 'hospital' || role === 'hospital_admin') navigate('/hospital-sos');
        else if (role === 'ambulance_driver' || role === 'ambulance') navigate('/ambulance-dashboard');
        else navigate('/');
        return;
      } catch (backendErr: any) {
        setError(backendErr.message || 'Authentication failed.');
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      // Try Firebase Auth first
      const cred = await loginWithEmail(email, password, rememberMe);
      if (cred.user) {
        onAuthSuccess(cred.user);
        navigate('/');
        return;
      }
    } catch (firebaseErr: any) {
      // If Firebase fails, try backend JWT auth
      try {
        const res = await fetch(`${API_BASE}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Login failed.');
        if (data.token) localStorage.setItem('helpaid_token', data.token);
        if (data.user) localStorage.setItem('helpaid_user', JSON.stringify(data.user));
        const mappedUser = {
          uid: data.user.id,
          email: data.user.email,
          displayName: data.user.displayName || 'HelpAid User',
          photoURL: `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.user.email}`,
          role: data.user.role
        };
        onAuthSuccess(mappedUser);
        const role = data.user.role;
        if (role === 'doctor') navigate('/doctor-sos');
        else if (role === 'hospital' || role === 'hospital_admin') navigate('/hospital-sos');
        else if (role === 'ambulance_driver' || role === 'ambulance') navigate('/ambulance-dashboard');
        else navigate('/');
        return;
      } catch (backendErr: any) {
        const msg = firebaseErr?.code === 'auth/user-not-found' ? 'No account found with this email.'
          : firebaseErr?.code === 'auth/wrong-password' ? 'Incorrect password.'
          : firebaseErr?.code === 'auth/invalid-credential' ? 'Invalid email or password.'
          : firebaseErr?.code === 'auth/too-many-requests' ? 'Too many failed attempts. Try again later.'
          : backendErr.message || 'Authentication failed.';
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await signIn();
      if (result.user) {
        onAuthSuccess(result.user);
        navigate('/');
      }
    } catch (err: any) {
      setError(err.message || 'Google Sign-In failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-[85vh] flex flex-col items-center justify-center px-4"
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 mb-10">
        <img
          src="/logo.svg"
          alt="HelpAid AI Logo"
          className="w-11 h-11 rounded-2xl shadow-lg shadow-blue-200 dark:shadow-blue-900/30 object-contain"
        />
        <div>
          <span className="font-extrabold text-xl tracking-tight text-gray-900 dark:text-white">HelpAid</span>
          <span className="text-blue-600 dark:text-blue-400 font-extrabold text-xl"> AI</span>
        </div>
      </div>

      {/* Card */}
      <div className="w-full max-w-md bg-white dark:bg-gray-950 rounded-[32px] border border-gray-100 dark:border-gray-800 shadow-2xl shadow-gray-200/40 dark:shadow-black/30 overflow-hidden">
        {/* Header */}
        <div className="px-8 pt-8 pb-4">
          <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Welcome Back</h1>
          <p className="text-sm text-gray-400 mt-1">Sign in to access your medical passport.</p>
        </div>

        {/* Role Selector Tabs */}
        <div className="px-8 pb-3 flex gap-1.5 sm:gap-2">
          {[
            { id: 'user' as const, label: 'Patient', icon: Smartphone, color: 'blue' },
            { id: 'doctor' as const, label: 'Doctor', icon: BriefcaseMedical, color: 'emerald' },
            { id: 'hospital' as const, label: 'Hospital', icon: Building2, color: 'indigo' },
            { id: 'ambulance' as const, label: 'Ambulance', icon: Truck, color: 'amber' },
          ].map(role => (
            <button key={role.id} type="button" onClick={() => setSelectedRole(role.id)}
              className={cn("flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all border",
                selectedRole === role.id
                  ? role.color === 'blue' ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 border-blue-200 dark:border-blue-800"
                    : role.color === 'emerald' ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 border-emerald-200 dark:border-emerald-800"
                    : role.color === 'indigo' ? "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 border-indigo-200 dark:border-indigo-800"
                    : "bg-amber-50 dark:bg-amber-900/20 text-amber-600 border-amber-200 dark:border-amber-800"
                  : "bg-gray-50 dark:bg-gray-900 text-gray-400 border-transparent")}>
              <role.icon size={14} />
              {role.label}
            </button>
          ))}
        </div>


        {/* Form */}
        <form onSubmit={handleEmailLogin} className="px-8 pb-4 space-y-4">
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

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3.5 text-gray-400" size={16} />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="name@helpaid.com"
                className="w-full pl-11 pr-4 py-3.5 bg-gray-50 dark:bg-gray-900 border border-transparent focus:border-blue-500 rounded-2xl text-sm font-semibold focus:outline-none transition-all placeholder:text-gray-400"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3.5 text-gray-400" size={16} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-11 pr-12 py-3.5 bg-gray-50 dark:bg-gray-900 border border-transparent focus:border-blue-500 rounded-2xl text-sm font-semibold focus:outline-none transition-all placeholder:text-gray-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-3.5 text-gray-400 hover:text-gray-600 transition-colors"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <div
                onClick={() => setRememberMe(!rememberMe)}
                className={cn(
                  "w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all cursor-pointer",
                  rememberMe
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "border-gray-300 dark:border-gray-600"
                )}
              >
                {rememberMe && <CheckCircle2 size={12} />}
              </div>
              <span className="text-xs font-bold text-gray-500">Remember me</span>
            </label>
            <Link to="/forgot-password" className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline">
              Forgot Password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-[#1D58D8] hover:bg-blue-700 text-white font-bold text-sm rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg shadow-blue-500/20"
          >
            {loading ? (
              <><Loader2 size={16} className="animate-spin" /> Signing in...</>
            ) : (
              <><LogIn size={16} /> Sign In</>
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="px-8 flex items-center gap-4 py-2">
          <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Or continue with</span>
          <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
        </div>

        {/* Social */}
        <div className="px-8 pb-8 space-y-3">
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full py-3.5 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-bold text-xs rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-center gap-3 active:scale-[0.98] transition-all"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Sign in with Google
          </button>

          {/* Sign up link */}
          <p className="text-center text-sm text-gray-400 pt-2">
            Don't have an account?{' '}
            {selectedRole === 'doctor' ? (
              <Link to="/doctor-signup" className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline">
                Register as Doctor <ArrowRight size={12} className="inline" />
              </Link>
            ) : selectedRole === 'hospital' ? (
              <Link to="/hospital-signup" className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
                Register Hospital <ArrowRight size={12} className="inline" />
              </Link>
            ) : selectedRole === 'ambulance' ? (
              <Link to="/ambulance-signup" className="font-bold text-amber-600 dark:text-amber-400 hover:underline">
                Register Ambulance <ArrowRight size={12} className="inline" />
              </Link>
            ) : (
              <Link to="/signup" className="font-bold text-blue-600 dark:text-blue-400 hover:underline">
                Create Account <ArrowRight size={12} className="inline" />
              </Link>
            )}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
