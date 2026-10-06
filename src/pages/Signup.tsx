import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Mail, Lock, Eye, EyeOff, UserPlus, AlertCircle, Loader2, Activity, User, Phone, Calendar, Droplets } from 'lucide-react';
import { registerWithEmail, signIn } from '../firebase';
import { cn } from '../lib/utils';
import { API_BASE_URL } from '../config';

export default function Signup({ onAuthSuccess }: { onAuthSuccess: (user: any) => void }) {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('Male');
  const [bloodGroup, setBloodGroup] = useState('O+');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2>(1);

  const validateStep1 = () => {
    if (!fullName.trim()) { setError('Full name is required.'); return false; }
    if (!email.trim()) { setError('Email is required.'); return false; }
    if (!mobile.trim()) { setError('Mobile number is required.'); return false; }
    if (!password || password.length < 6) { setError('Password must be at least 6 characters.'); return false; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return false; }
    setError(null);
    return true;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep1()) return;

    setLoading(true);
    setError(null);

    try {
      // Try Firebase Auth first
      const cred = await registerWithEmail(email, password, fullName);
      if (cred.user) {
        // Save extended profile to backend
        try {
          await fetch(`${API_BASE_URL}/api/profile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: cred.user.uid,
              profileData: {
                fullName,
                displayName: fullName,
                email,
                mobileNumber: mobile,
                age: age ? parseInt(age) : null,
                gender,
                bloodGroup
              }
            })
          });
        } catch { /* profile save is best-effort */ }

        onAuthSuccess(cred.user);
        navigate('/');
        return;
      }
    } catch (firebaseErr: any) {
      // If Firebase fails, try backend JWT registration
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, displayName: fullName })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Registration failed.');
        if (data.token) localStorage.setItem('helpaid_token', data.token);
        if (data.user) localStorage.setItem('helpaid_user', JSON.stringify(data.user));

        // Save extended profile
        try {
          await fetch(`${API_BASE_URL}/api/profile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: data.user.id,
              profileData: {
                fullName,
                displayName: fullName,
                email,
                mobileNumber: mobile,
                age: age ? parseInt(age) : null,
                gender,
                bloodGroup
              }
            })
          });
        } catch { /* best-effort */ }

        const mappedUser = {
          uid: data.user.id,
          email: data.user.email,
          displayName: fullName,
          photoURL: `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.user.email}`,
          role: data.user.role
        };
        onAuthSuccess(mappedUser);
        navigate('/');
        return;
      } catch (backendErr: any) {
        const msg = firebaseErr?.code === 'auth/email-already-in-use' ? 'An account already exists with this email.'
          : firebaseErr?.code === 'auth/weak-password' ? 'Password is too weak. Use at least 6 characters.'
          : firebaseErr?.code === 'auth/invalid-email' ? 'Invalid email address.'
          : backendErr.message || 'Registration failed.';
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
      className="min-h-[85vh] flex flex-col items-center justify-center px-4 py-6"
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 mb-8">
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
        <div className="px-8 pt-8 pb-3">
          <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Create Account</h1>
          <p className="text-sm text-gray-400 mt-1">Set up your clinical passport in seconds.</p>
        </div>

        {/* Step indicator */}
        <div className="px-8 flex gap-2 pb-4">
          <div className={cn("h-1 flex-1 rounded-full transition-all", step >= 1 ? "bg-blue-600" : "bg-gray-200 dark:bg-gray-800")} />
          <div className={cn("h-1 flex-1 rounded-full transition-all", step >= 2 ? "bg-blue-600" : "bg-gray-200 dark:bg-gray-800")} />
        </div>

        <form onSubmit={handleRegister} className="px-8 pb-4 space-y-4">
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

          {step === 1 && (
            <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3.5 text-gray-400" size={16} />
                  <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="John Doe"
                    className="w-full pl-11 pr-4 py-3.5 bg-gray-50 dark:bg-gray-900 border border-transparent focus:border-blue-500 rounded-2xl text-sm font-semibold focus:outline-none transition-all placeholder:text-gray-400" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3.5 text-gray-400" size={16} />
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@helpaid.com"
                    className="w-full pl-11 pr-4 py-3.5 bg-gray-50 dark:bg-gray-900 border border-transparent focus:border-blue-500 rounded-2xl text-sm font-semibold focus:outline-none transition-all placeholder:text-gray-400" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Mobile Number</label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-3.5 text-gray-400" size={16} />
                  <input type="tel" value={mobile} onChange={e => setMobile(e.target.value)} placeholder="+91 9876543210"
                    className="w-full pl-11 pr-4 py-3.5 bg-gray-50 dark:bg-gray-900 border border-transparent focus:border-blue-500 rounded-2xl text-sm font-semibold focus:outline-none transition-all placeholder:text-gray-400" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3.5 text-gray-400" size={16} />
                    <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••"
                      className="w-full pl-11 pr-10 py-3.5 bg-gray-50 dark:bg-gray-900 border border-transparent focus:border-blue-500 rounded-2xl text-sm font-semibold focus:outline-none transition-all placeholder:text-gray-400" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600">
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

              <button type="button" onClick={() => { if (validateStep1()) setStep(2); }}
                className="w-full py-4 bg-[#1D58D8] hover:bg-blue-700 text-white font-bold text-sm rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-lg shadow-blue-500/20">
                Continue to Medical Profile
              </button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Optional Medical Details</p>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Age</label>
                  <div className="relative">
                    <Calendar className="absolute left-3.5 top-3.5 text-gray-400" size={16} />
                    <input type="number" value={age} onChange={e => setAge(e.target.value)} placeholder="28"
                      className="w-full pl-11 pr-4 py-3.5 bg-gray-50 dark:bg-gray-900 border border-transparent focus:border-blue-500 rounded-2xl text-sm font-semibold focus:outline-none transition-all placeholder:text-gray-400" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Gender</label>
                  <select value={gender} onChange={e => setGender(e.target.value)}
                    className="w-full px-4 py-3.5 bg-gray-50 dark:bg-gray-900 border border-transparent focus:border-blue-500 rounded-2xl text-sm font-semibold focus:outline-none transition-all">
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Droplets size={12} className="text-red-500" /> Blood Group
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(bg => (
                    <button key={bg} type="button" onClick={() => setBloodGroup(bg)}
                      className={cn(
                        "py-2.5 border text-xs font-black rounded-xl transition-all uppercase",
                        bloodGroup === bg
                          ? "bg-red-600 border-red-600 text-white shadow-md"
                          : "bg-gray-50 dark:bg-gray-900 border-transparent text-gray-500 hover:bg-gray-100"
                      )}>
                      {bg}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setStep(1)}
                  className="flex-1 py-4 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-bold text-sm rounded-2xl active:scale-[0.98] transition-all">
                  Back
                </button>
                <button type="submit" disabled={loading}
                  className="flex-[2] py-4 bg-[#1D58D8] hover:bg-blue-700 text-white font-bold text-sm rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg shadow-blue-500/20">
                  {loading ? (
                    <><Loader2 size={16} className="animate-spin" /> Creating Account...</>
                  ) : (
                    <><UserPlus size={16} /> Create Account</>
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </form>

        {/* Divider + Google */}
        <div className="px-8 pb-6 space-y-3">
          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Or</span>
            <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
          </div>
          <button onClick={handleGoogleSignIn} disabled={loading}
            className="w-full py-3.5 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-bold text-xs rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-center gap-3 active:scale-[0.98] transition-all">
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Sign up with Google
          </button>

          <p className="text-center text-sm text-gray-400 pt-1">
            Already have an account?{' '}
            <Link to="/login" className="font-bold text-blue-600 dark:text-blue-400 hover:underline">Sign In</Link>
          </p>
        </div>
      </div>
    </motion.div>
  );
}
