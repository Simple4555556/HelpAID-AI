import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Mail, Lock, Eye, EyeOff, UserPlus, AlertCircle, Loader2, Activity, User, Phone, BriefcaseMedical, Building2, MapPin, Award, Hash, Calendar } from 'lucide-react';
import { cn } from '../lib/utils';
import { API_BASE_URL } from '../config';

const API_BASE = API_BASE_URL;

const SPECIALIZATIONS = [
  'General Physician', 'Cardiologist', 'Orthopedic', 'Neurologist', 'Dermatologist',
  'Pediatrician', 'Gynecologist', 'ENT Specialist', 'Ophthalmologist', 'General Surgeon',
  'Psychiatrist', 'Urologist', 'Oncologist', 'Pulmonologist', 'Nephrologist',
  'Gastroenterologist', 'Endocrinologist', 'Rheumatologist', 'Anesthesiologist', 'Radiologist'
];

export default function DoctorSignup({ onAuthSuccess }: { onAuthSuccess: (user: any) => void }) {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Step 2 fields
  const [specialization, setSpecialization] = useState('General Physician');
  const [experience, setExperience] = useState('');
  const [hospitalName, setHospitalName] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');

  const validateStep1 = () => {
    if (!name.trim()) { setError('Full name is required.'); return false; }
    if (!phone.trim()) { setError('Mobile number is required.'); return false; }
    if (!email.trim()) { setError('Email is required.'); return false; }
    if (!password || password.length < 6) { setError('Password must be at least 6 characters.'); return false; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return false; }
    setError(null);
    return true;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
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
          role: 'doctor',
          phone,
          name,
          specialization,
          experience,
          hospitalName,
          registrationNumber,
          city,
          state
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed.');

      if (data.token) localStorage.setItem('helpaid_token', data.token);
      if (data.user) localStorage.setItem('helpaid_user', JSON.stringify(data.user));

      const mappedUser = {
        uid: data.user.id,
        email: data.user.email,
        displayName: name,
        role: 'doctor',
        photoURL: `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`,
        doctorProfileId: data.user.doctorProfileId,
        ...data.user
      };
      onAuthSuccess(mappedUser);
      navigate('/doctor-sos');
    } catch (err: any) {
      setError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="min-h-[85vh] flex flex-col items-center justify-center px-4 py-6">
      {/* Logo */}
      <div className="flex items-center gap-2.5 mb-6">
        <img
          src="/logo.svg"
          alt="HelpAid AI Logo"
          className="w-11 h-11 rounded-2xl shadow-lg shadow-emerald-200 dark:shadow-emerald-900/30 object-contain"
        />
        <div>
          <span className="font-extrabold text-xl tracking-tight text-gray-900 dark:text-white">Doctor</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-extrabold text-xl"> Registration</span>
        </div>
      </div>

      <div className="w-full max-w-md bg-white dark:bg-gray-950 rounded-[32px] border border-gray-100 dark:border-gray-800 shadow-2xl shadow-gray-200/40 dark:shadow-black/30 overflow-hidden">
        <div className="px-8 pt-7 pb-2">
          <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Join as Doctor</h1>
          <p className="text-sm text-gray-400 mt-1">Register to receive real-time SOS alerts.</p>
        </div>

        {/* Step indicator */}
        <div className="px-8 flex gap-2 pb-4 pt-2">
          <div className={cn("h-1 flex-1 rounded-full transition-all", step >= 1 ? "bg-emerald-600" : "bg-gray-200 dark:bg-gray-800")} />
          <div className={cn("h-1 flex-1 rounded-full transition-all", step >= 2 ? "bg-emerald-600" : "bg-gray-200 dark:bg-gray-800")} />
        </div>

        <form onSubmit={handleRegister} className="px-8 pb-6 space-y-3.5">
          {error && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
              className="p-3 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 rounded-2xl text-xs font-bold flex items-center gap-2 border border-red-100 dark:border-red-900/30">
              <AlertCircle size={15} className="shrink-0" /><span>{error}</span>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="space-y-3.5">
              <InputField icon={User} label="Full Name" value={name} onChange={setName} placeholder="Dr. John Doe" />
              <InputField icon={Phone} label="Mobile Number" value={phone} onChange={setPhone} placeholder="+91 9876543210" type="tel" />
              <InputField icon={Mail} label="Email Address" value={email} onChange={setEmail} placeholder="doctor@clinic.com" type="email" />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3.5 text-gray-400" size={16} />
                    <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••"
                      className="w-full pl-11 pr-10 py-3.5 bg-gray-50 dark:bg-gray-900 border border-transparent focus:border-emerald-500 rounded-2xl text-sm font-semibold focus:outline-none transition-all placeholder:text-gray-400" />
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
                      className="w-full pl-11 pr-4 py-3.5 bg-gray-50 dark:bg-gray-900 border border-transparent focus:border-emerald-500 rounded-2xl text-sm font-semibold focus:outline-none transition-all placeholder:text-gray-400" />
                  </div>
                </div>
              </div>
              <button type="button" onClick={() => { if (validateStep1()) setStep(2); }}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-lg shadow-emerald-500/20">
                Continue to Professional Details
              </button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-3.5">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Specialization</label>
                <select value={specialization} onChange={e => setSpecialization(e.target.value)}
                  className="w-full px-4 py-3.5 bg-gray-50 dark:bg-gray-900 border border-transparent focus:border-emerald-500 rounded-2xl text-sm font-semibold focus:outline-none transition-all">
                  {SPECIALIZATIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <InputField icon={Calendar} label="Experience (yrs)" value={experience} onChange={setExperience} placeholder="5" type="number" />
                <InputField icon={Hash} label="Reg. Number" value={registrationNumber} onChange={setRegistrationNumber} placeholder="MCI-12345" />
              </div>
              <InputField icon={Building2} label="Hospital Name" value={hospitalName} onChange={setHospitalName} placeholder="City General Hospital" />
              <div className="grid grid-cols-2 gap-3">
                <InputField icon={MapPin} label="City" value={city} onChange={setCity} placeholder="Mumbai" />
                <InputField icon={MapPin} label="State" value={state} onChange={setState} placeholder="Maharashtra" />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setStep(1)}
                  className="flex-1 py-4 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-bold text-sm rounded-2xl active:scale-[0.98] transition-all">
                  Back
                </button>
                <button type="submit" disabled={loading}
                  className="flex-[2] py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/20">
                  {loading ? (<><Loader2 size={16} className="animate-spin" /> Registering...</>) : (<><UserPlus size={16} /> Register as Doctor</>)}
                </button>
              </div>
            </motion.div>
          )}
        </form>

        <div className="px-8 pb-6">
          <p className="text-center text-sm text-gray-400">
            Already registered?{' '}<Link to="/login" className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline">Sign In</Link>
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// Reusable input field component
function InputField({ icon: Icon, label, value, onChange, placeholder, type = 'text' }: {
  icon: any; label: string; value: string; onChange: (v: string) => void; placeholder: string; type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">{label}</label>
      <div className="relative">
        <Icon className="absolute left-3.5 top-3.5 text-gray-400" size={16} />
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className="w-full pl-11 pr-4 py-3.5 bg-gray-50 dark:bg-gray-900 border border-transparent focus:border-emerald-500 rounded-2xl text-sm font-semibold focus:outline-none transition-all placeholder:text-gray-400" />
      </div>
    </div>
  );
}
