import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Lock, Eye, EyeOff, ShieldAlert, Sparkles, CheckCircle2, User, Phone, Heart, Calendar, ArrowRight, Loader2, LogIn, AlertCircle } from 'lucide-react';
import { registerWithEmail, loginWithEmail } from '../firebase';
import { API_BASE_URL } from '../config';

interface AccountConversionModalProps {
  isOpen: boolean;
  onClose: () => void;
  prefilledData: {
    patientName: string;
    phoneNumber: string;
    age: string;
    gender: string;
    bloodGroup: string;
    emergencyContact: string;
  };
  caseId: string | null;
  onAuthSuccess: (user: any) => void;
}

export default function AccountConversionModal({
  isOpen,
  onClose,
  prefilledData,
  caseId,
  onAuthSuccess
}: AccountConversionModalProps) {
  const navigate = useNavigate();
  const [isLoginMode, setIsLoginMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please fill in all fields.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    setError(null);

    const guestCaseIds = caseId ? [caseId] : [];

    if (isLoginMode) {
      // Login flow
      try {
        const guestSessionId = localStorage.getItem('guestSessionId');
        // 1. Firebase login
        try {
          await loginWithEmail(email, password);
        } catch (fbErr: any) {
          console.warn('[Modal] Firebase login skipped:', fbErr.message);
        }
        
        // 2. Backend login
        const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, guestCaseIds, guestSessionId })
        });
        const data = await res.json();
        
        if (res.ok && data.user) {
          localStorage.setItem('helpaid_token', data.token);
          localStorage.setItem('helpaid_user', JSON.stringify(data.user));

          // Explicit guest migration call
          if (guestCaseIds.length > 0 || guestSessionId) {
            try {
              await fetch(`${API_BASE_URL}/api/sos/migrate-guest`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${data.token}`
                },
                body: JSON.stringify({ caseIds: guestCaseIds, guestSessionId })
              });
            } catch (migrateErr) {
              console.warn('[Modal] Guest migration API call failed:', migrateErr);
            }
          }

          // Clear guestSessionId
          localStorage.removeItem('guestSessionId');
          console.log('[GUEST MIGRATION COMPLETED] guestSessionId cleared after login');

          onAuthSuccess({
            uid: data.user.id,
            id: data.user.id,
            email: data.user.email,
            displayName: data.user.displayName,
            role: data.user.role || 'user',
            helpAidId: data.user.helpAidId
          });

          onClose();
          navigate('/patient-dashboard');
        } else {
          throw new Error(data.error || 'Failed to authenticate on backend.');
        }
      } catch (err: any) {
        setError(err.message || 'Login failed. Check your credentials.');
      } finally {
        setLoading(false);
      }
    } else {
      // Signup/Register flow
      try {
        const guestSessionId = localStorage.getItem('guestSessionId');
        let firebaseUid = `local_${Date.now()}`;
        
        // 1. Try Firebase Register first
        try {
          const cred = await registerWithEmail(email, password, prefilledData.patientName);
          firebaseUid = cred.user.uid;
        } catch (fbErr: any) {
          console.warn('Firebase register skipped, falling back to local registration:', fbErr.message);
        }

        // 2. Call backend register API
        const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            password,
            displayName: prefilledData.patientName,
            patientName: prefilledData.patientName,
            phone: prefilledData.phoneNumber, // Correct field name phone
            age: prefilledData.age,
            gender: prefilledData.gender,
            bloodGroup: prefilledData.bloodGroup,
            emergencyContact: prefilledData.emergencyContact,
            guestCaseIds,
            guestSessionId
          })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to register account on database.');

        if (data.token) localStorage.setItem('helpaid_token', data.token);
        if (data.user) {
          localStorage.setItem('helpaid_user', JSON.stringify({
            ...data.user,
            uid: firebaseUid
          }));
        }

        // Explicit guest migration call
        if (data.token && (guestCaseIds.length > 0 || guestSessionId)) {
          try {
            await fetch(`${API_BASE_URL}/api/sos/migrate-guest`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${data.token}`
              },
              body: JSON.stringify({ caseIds: guestCaseIds, guestSessionId })
            });
          } catch (migrateErr) {
            console.warn('[Modal] Post-register guest migration call failed:', migrateErr);
          }
        }

        // Clear guestSessionId
        localStorage.removeItem('guestSessionId');
        console.log('[GUEST MIGRATION COMPLETED] guestSessionId cleared after registration');

        onAuthSuccess({
          uid: firebaseUid,
          id: data.user?.id,
          email: email,
          displayName: prefilledData.patientName,
          role: 'user',
          helpAidId: data.user?.helpAidId
        });

        onClose();
        navigate('/patient-dashboard');
      } catch (err: any) {
        setError(err.message || 'Registration failed.');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop blur */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
        />

        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-[32px] border border-slate-100 dark:border-slate-800 shadow-2xl overflow-hidden z-10 max-h-[90vh] flex flex-col"
        >
          {/* Top Decorative Gradient */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5 text-center shrink-0">
            <div className="w-12 h-12 mx-auto bg-white/20 rounded-2xl flex items-center justify-center mb-2.5">
              <ShieldAlert size={24} className="text-white" />
            </div>
            <h2 className="text-lg font-black text-white">Emergency SOS Sent Successfully!</h2>
            <p className="text-blue-100 text-xs mt-1">Convert your guest session to unlock full live updates & tracking</p>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 rounded-xl text-xs font-bold flex items-center gap-2 border border-red-100 dark:border-red-900/30">
                <AlertCircle size={14} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Benefit List */}
            <div className="bg-blue-50/50 dark:bg-blue-950/10 border border-blue-100/40 dark:border-blue-900/20 rounded-2xl p-4">
              <span className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest block mb-2">Why create a HelpAid Account?</span>
              <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300 font-semibold">
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-green-500" /> Live doctor acceptance updates
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-green-500" /> Hospital destination lock notification
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-green-500" /> Ambulance live tracking & driver contact
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-green-500" /> Complete emergency medical records history
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-green-500" /> Persistent patient dashboard
                </li>
              </ul>
            </div>

            {/* Prefilled Profile summary */}
            {!isLoginMode && (
              <div className="bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800 rounded-2xl p-3.5 space-y-2.5">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Auto-filled Patient Details (From Report)</span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-semibold">
                    <User size={12} className="text-slate-400" /> <span className="truncate">{prefilledData.patientName}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-semibold">
                    <Phone size={12} className="text-slate-400" /> <span>{prefilledData.phoneNumber}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-semibold">
                    <Calendar size={12} className="text-slate-400" /> <span>{prefilledData.age} Years • {prefilledData.gender}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-semibold">
                    <Heart size={12} className="text-red-500" /> <span>Blood Group: {prefilledData.bloodGroup}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Register form */}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 text-slate-400" size={14} />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-transparent focus:border-blue-500 rounded-xl text-xs font-semibold focus:outline-none transition-all placeholder:text-slate-400 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 text-slate-400" size={14} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••"
                    className="w-full pl-9 pr-9 py-2.5 bg-slate-50 dark:bg-slate-950 border border-transparent focus:border-blue-500 rounded-xl text-xs font-semibold focus:outline-none transition-all placeholder:text-slate-400 text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 active:scale-98 transition-all shadow-md shadow-blue-500/10 disabled:opacity-50"
                >
                  {loading ? (
                    <><Loader2 size={14} className="animate-spin" /> Processing...</>
                  ) : (
                    <>
                      {isLoginMode ? <LogIn size={14} /> : <Sparkles size={14} />}
                      {isLoginMode ? 'Login & Link Emergency' : 'Create Account'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Footer toggle & Login Later */}
          <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950/30 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-4 shrink-0">
            <button
              onClick={() => {
                setIsLoginMode(!isLoginMode);
                setError(null);
              }}
              className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
            >
              {isLoginMode ? 'Need an account? Sign Up' : 'Already have an account? Login'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white dark:bg-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-all border border-slate-200 dark:border-slate-700 active:scale-95"
            >
              Login Later
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
