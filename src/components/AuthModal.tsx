import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Mail, Lock, User as UserIcon, AlertCircle, Loader2, Sparkles } from 'lucide-react';
import { signIn } from '../firebase';
import { cn } from '../lib/utils';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (user: any) => void;
}

export default function AuthModal({ isOpen, onClose, onAuthSuccess }: AuthModalProps) {
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || (tab === 'signup' && !displayName)) {
      setError('Please fill in all fields.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const endpoint = tab === 'login' ? '/api/auth/login' : '/api/auth/register';
      const bodyPayload = tab === 'login' 
        ? { email, password } 
        : { email, password, displayName };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed.');
      }

      // Save token and user details to localStorage
      if (data.token) {
        localStorage.setItem('helpaid_token', data.token);
      }
      if (data.user) {
        localStorage.setItem('helpaid_user', JSON.stringify(data.user));
      }

      // Map to standard Firebase-like user shape
      const mappedUser = {
        uid: data.user.id,
        email: data.user.email,
        displayName: data.user.displayName || 'HelpAid User',
        photoURL: `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.user.email}`,
        role: data.user.role
      };

      onAuthSuccess(mappedUser);
      onClose();
    } catch (err: any) {
      setError(err.message || 'An error occurred during authentication.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await signIn();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Google Sign-In failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleGuestAccess = () => {
    const guestUser = {
      uid: 'adi2222',
      displayName: 'Adi Prototype',
      email: 'adi2222@helpaid.com',
      photoURL: 'https://api.dicebear.com/7.x/avataaars/svg?seed=adi2222',
      role: 'user'
    };
    localStorage.setItem('helpaid_user', JSON.stringify({
      id: guestUser.uid,
      email: guestUser.email,
      displayName: guestUser.displayName
    }));
    onAuthSuccess(guestUser);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-120 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-md bg-white dark:bg-gray-900 rounded-[32px] overflow-hidden shadow-2xl relative border border-gray-100 dark:border-gray-800"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
        >
          <X size={18} />
        </button>

        {/* Tab Headers */}
        <div className="flex border-b border-gray-100 dark:border-gray-800">
          <button
            onClick={() => { setTab('login'); setError(null); }}
            className={cn(
              "flex-1 py-4 text-center text-sm font-black uppercase tracking-wider transition-colors",
              tab === 'login' 
                ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400" 
                : "text-gray-400 hover:text-gray-600"
            )}
          >
            Log In
          </button>
          <button
            onClick={() => { setTab('signup'); setError(null); }}
            className={cn(
              "flex-1 py-4 text-center text-sm font-black uppercase tracking-wider transition-colors",
              tab === 'signup' 
                ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400" 
                : "text-gray-400 hover:text-gray-600"
            )}
          >
            Sign Up
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 sm:p-8 space-y-6">
          <div className="text-center space-y-1">
            <h3 className="text-xl font-black text-gray-900 dark:text-white">
              {tab === 'login' ? 'Welcome Back' : 'Create Clinical Account'}
            </h3>
            <p className="text-xs text-gray-400">
              Access your medical passport and timeline vault securely.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3.5 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 rounded-xl text-xs font-bold flex items-center gap-2 border border-red-100 dark:border-red-900/30">
                <AlertCircle size={15} />
                <span>{error}</span>
              </div>
            )}

            {tab === 'signup' && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Full Name</label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-3.5 text-gray-400" size={16} />
                  <input
                    type="text"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder="Dr. John Doe"
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-800 border border-transparent focus:border-blue-500 rounded-2xl text-sm font-semibold focus:outline-none transition-all"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 text-gray-400" size={16} />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="name@helpaid.com"
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-800 border border-transparent focus:border-blue-500 rounded-2xl text-sm font-semibold focus:outline-none transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 text-gray-400" size={16} />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-800 border border-transparent focus:border-blue-500 rounded-2xl text-sm font-semibold focus:outline-none transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-[#1D58D8] text-white font-bold text-sm rounded-2xl hover:bg-blue-700 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <span>{tab === 'login' ? 'Sign In' : 'Create Account'}</span>
              )}
            </button>
          </form>

          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-gray-100 dark:border-gray-800"></div>
            <span className="flex-shrink mx-4 text-[10px] text-gray-400 font-bold uppercase tracking-wider">Or</span>
            <div className="flex-grow border-t border-gray-100 dark:border-gray-800"></div>
          </div>

          <div className="flex flex-col gap-2.5">
            <button
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full py-3.5 border border-gray-200 dark:border-gray-700 text-gray-750 dark:text-gray-250 font-bold text-xs rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              Google Account popup
            </button>

            <button
              onClick={handleGuestAccess}
              className="w-full py-3.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 font-bold text-xs rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              <Sparkles size={14} className="text-yellow-600" />
              <span>Continue as Guest (Prototype Mode)</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
