import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Mail, AlertCircle, Loader2, Activity, ArrowLeft, CheckCircle2, KeyRound } from 'lucide-react';
import { resetPassword } from '../firebase';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await resetPassword(email);
      setSent(true);
    } catch (err: any) {
      const msg = err?.code === 'auth/user-not-found' ? 'No account found with this email.'
        : err?.code === 'auth/invalid-email' ? 'Invalid email address.'
        : err?.code === 'auth/too-many-requests' ? 'Too many requests. Please try again later.'
        : 'Failed to send reset email. Please try again.';
      setError(msg);
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
        <div className="px-8 pt-8 pb-6">
          {sent ? (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-5 py-6">
              <div className="w-20 h-20 bg-green-50 dark:bg-green-950/30 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 size={40} className="text-green-600" />
              </div>
              <div>
                <h2 className="text-xl font-black text-gray-900 dark:text-white">Check Your Inbox</h2>
                <p className="text-sm text-gray-400 mt-2 leading-relaxed">
                  We've sent a password reset link to<br />
                  <span className="font-bold text-gray-600 dark:text-gray-300">{email}</span>
                </p>
              </div>
              <div className="space-y-3 pt-2">
                <button onClick={() => { setSent(false); setEmail(''); }}
                  className="w-full py-3.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-bold text-sm rounded-2xl active:scale-[0.98] transition-all">
                  Send Again
                </button>
                <Link to="/login"
                  className="w-full py-3.5 bg-[#1D58D8] text-white font-bold text-sm rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-lg shadow-blue-500/20">
                  <ArrowLeft size={16} /> Back to Login
                </Link>
              </div>
            </motion.div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-blue-50 dark:bg-blue-950/30 rounded-2xl flex items-center justify-center">
                  <KeyRound size={22} className="text-blue-600" />
                </div>
                <div>
                  <h1 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">Reset Password</h1>
                  <p className="text-xs text-gray-400 mt-0.5">Enter your email to receive a reset link.</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                    className="p-3.5 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 rounded-2xl text-xs font-bold flex items-center gap-2 border border-red-100 dark:border-red-900/30">
                    <AlertCircle size={15} className="shrink-0" />
                    <span>{error}</span>
                  </motion.div>
                )}

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3.5 text-gray-400" size={16} />
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@helpaid.com"
                      className="w-full pl-11 pr-4 py-3.5 bg-gray-50 dark:bg-gray-900 border border-transparent focus:border-blue-500 rounded-2xl text-sm font-semibold focus:outline-none transition-all placeholder:text-gray-400" />
                  </div>
                </div>

                <button type="submit" disabled={loading}
                  className="w-full py-4 bg-[#1D58D8] hover:bg-blue-700 text-white font-bold text-sm rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg shadow-blue-500/20">
                  {loading ? (
                    <><Loader2 size={16} className="animate-spin" /> Sending...</>
                  ) : (
                    <>Send Reset Link</>
                  )}
                </button>

                <Link to="/login" className="flex items-center justify-center gap-2 text-sm font-bold text-gray-400 hover:text-gray-600 transition-colors pt-2">
                  <ArrowLeft size={14} /> Back to Login
                </Link>
              </form>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
