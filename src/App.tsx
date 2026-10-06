import { BrowserRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, logOut } from './firebase';
import { Home, AlertCircle, MapPin, Moon, Sun, User as UserIcon, LogIn, LogOut, Activity, LayoutGrid, BriefcaseMedical, Bot, Lock, Shield, ChevronDown, Settings, Heart, FileText, Phone, Building2 } from 'lucide-react';
import { cn } from './lib/utils';
import { motion, AnimatePresence } from 'motion/react';

// Pages
import HomePage from './pages/HomePage';
import SymptomChecker from './pages/SymptomChecker';
import NearbyHelp from './pages/NearbyHelp';
import FirstAid from './pages/FirstAid';
import Profile from './pages/Profile';
import AmbulancePage from './pages/AmbulancePage';
import AccidentPage from './pages/AccidentPage';
import BloodAvailability from './pages/BloodAvailability';
import AIChatAssistant from './pages/AIChatAssistant';
import InjuryDetector from './pages/InjuryDetector';
import HeartRiskAnalyzer from './pages/HeartRiskAnalyzer';
import AdminDashboard from './pages/AdminDashboard';
import LocationAgentPage from './pages/LocationAgentPage';
import DoctorDashboard from './pages/DoctorDashboard';
import HospitalDashboard from './pages/HospitalDashboard';
import AmbulanceDashboard from './pages/AmbulanceDashboard';
import EmergencyTracker from './pages/EmergencyTracker';
import HospitalAdminPanel from './pages/HospitalAdminPanel';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import MVPDashboard from './pages/MVPDashboard';
import DoctorSignup from './pages/DoctorSignup';
import HospitalSignup from './pages/HospitalSignup';
import SOSPage from './pages/SOSPage';
import DoctorSOSDashboard from './pages/DoctorSOSDashboard';
import HospitalSOSDashboard from './pages/HospitalSOSDashboard';
import SOSNotification from './components/SOSNotification';
import AmbulanceSignup from './pages/AmbulanceSignup';
import PatientDashboard from './pages/PatientDashboard';
import { API_BASE_URL } from './config';

const API_BASE = API_BASE_URL;

// Protected Route wrapper
function ProtectedRoute({ user, children }: { user: any | null; children: React.ReactNode }) {
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function BottomNav() {
  const location = useLocation();
  const navItems = [
    { path: '/', icon: LayoutGrid, label: 'Dashboard' },
    { path: '/first-aid', icon: BriefcaseMedical, label: 'Guides' },
    { path: '/chat', icon: Bot, label: 'AI Doctor' },
    { path: '/nearby', icon: MapPin, label: 'Locator' },
    { path: '/profile', icon: Lock, label: 'Vault' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50">
      {/* Blur backdrop */}
      <div className="absolute inset-0 bg-white/90 dark:bg-gray-900/90 backdrop-blur-3xl border-t border-gray-100/80 dark:border-gray-800/80 shadow-[0_-8px_32px_rgba(0,0,0,0.04)]" />
      <div className="relative flex justify-around items-center px-2 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] max-w-3xl mx-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex flex-col items-center gap-1.5 px-3 py-2 rounded-2xl transition-all duration-200 active:scale-90 relative min-w-[64px]",
                isActive
                  ? "text-[#1D58D8]"
                  : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="nav-pill"
                  className="absolute inset-0 bg-blue-50 dark:bg-blue-900/30 rounded-2xl"
                  transition={{ type: "spring", stiffness: 400, damping: 35 }}
                />
              )}
              <Icon
                size={22}
                className={cn("relative z-10 transition-transform duration-200", isActive && "scale-105")}
                strokeWidth={isActive ? 2 : 1.5}
              />
              <span className={cn(
                "relative z-10 text-[10px] font-bold tracking-wide transition-all duration-200",
                isActive ? "text-[#1D58D8]" : "text-gray-400"
              )}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function Header({ user, onSignInClick }: { user: any | null; onSignInClick: () => void }) {
  const [darkMode, setDarkMode] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const getStoredRole = () => {
    try {
      const stored = localStorage.getItem('helpaid_user');
      if (stored) {
        return JSON.parse(stored).role;
      }
    } catch (e) {}
    return '';
  };
  const role = user?.role || getStoredRole();

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = async () => {
    setDropdownOpen(false);
    try {
      const token = localStorage.getItem('helpaid_token');
      if (token) {
        await fetch(`${API_BASE}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });
      }
    } catch (e) {
      console.warn('Backend logout failed:', e);
    }
    localStorage.removeItem('helpaid_token');
    localStorage.removeItem('helpaid_user');
    localStorage.clear();
    sessionStorage.clear();
    document.cookie.split(";").forEach((c) => {
      document.cookie = c
        .replace(/^ +/, "")
        .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });
    try {
      await logOut();
    } catch (e) {}
    window.location.href = '/login';
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      <div className="absolute inset-0 bg-white/85 dark:bg-gray-900/88 backdrop-blur-2xl border-b border-gray-100/80 dark:border-gray-800/80 shadow-sm" />
      <div className="relative h-16 sm:h-18 flex items-center justify-between px-4 sm:px-6 max-w-3xl mx-auto w-full">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 group">
          <img
            src="/logo.svg"
            alt="HelpAid AI Logo"
            className="w-9 h-9 rounded-xl shadow-lg shadow-blue-200 dark:shadow-blue-900/30 transition-transform group-hover:scale-105 object-contain"
          />
          <div>
            <span className="font-extrabold text-base sm:text-lg tracking-tight text-gray-900 dark:text-white leading-none">HelpAid</span>
            <span className="text-blue-600 dark:text-blue-400 font-extrabold text-base sm:text-lg"> AI</span>
          </div>
        </Link>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          {role && (role === 'doctor' || role === 'hospital' || role === 'hospital_admin' || role === 'admin') && (
            <Link
              to={role === 'doctor' ? '/doctor-sos' : (role === 'hospital' || role === 'hospital_admin' ? '/hospital-sos' : '/doctor')}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all active:scale-90 mr-1"
              title="Dashboard"
              aria-label="Dashboard"
            >
              <BriefcaseMedical size={18} className="text-blue-600 dark:text-blue-400" />
            </Link>
          )}

          <Link
            to="/admin"
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all active:scale-90"
            aria-label="Admin Control Panel"
          >
            <Shield size={18} />
          </Link>

          <button
            onClick={() => setDarkMode(!darkMode)}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all active:scale-90"
            aria-label="Toggle dark mode"
          >
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {user ? (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-all active:scale-95"
              >
                <div className="w-8 h-8 flex items-center justify-center rounded-full overflow-hidden text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <UserIcon size={16} />
                  )}
                </div>
                <ChevronDown size={14} className={cn("text-blue-500 transition-transform duration-200", dropdownOpen && "rotate-180")} />
              </button>

              {/* Dropdown Menu */}
              <AnimatePresence>
                {dropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-12 w-64 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-2xl shadow-gray-200/50 dark:shadow-black/40 overflow-hidden z-50"
                  >
                    {/* User info header */}
                    <div className="px-4 py-3.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
                      <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                        {user.displayName || 'HelpAid User'}
                      </p>
                      <p className="text-xs text-gray-400 truncate">{user.email || ''}</p>
                    </div>

                    {/* Menu items */}
                    <div className="py-1.5">
                      {[
                        { icon: LayoutGrid, label: 'Patient Dashboard', to: '/patient-dashboard' },
                        { icon: UserIcon, label: 'My Profile', to: '/profile' },
                        { icon: Heart, label: 'Medical Vault', to: '/profile' },
                        { icon: FileText, label: 'Reports', to: '/profile' },
                        { icon: Phone, label: 'Emergency Contacts', to: '/profile' },
                      ].map(item => (
                        <Link
                          key={item.label}
                          to={item.to}
                          onClick={() => setDropdownOpen(false)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                          <item.icon size={16} className="text-gray-400" />
                          {item.label}
                        </Link>
                      ))}

                      {/* Dynamic Role-based Quick Links */}
                      {(role === 'hospital' || role === 'hospital_admin') && (
                        <>
                          <Link
                            to="/hospital-sos"
                            onClick={() => setDropdownOpen(false)}
                            className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border-t border-gray-100 dark:border-gray-805 mt-1 pt-2"
                          >
                            <Building2 size={16} className="text-blue-500" />
                            Hospital Dashboard
                          </Link>
                          <Link
                            to="/hospital-admin"
                            onClick={() => setDropdownOpen(false)}
                            className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                          >
                            <Building2 size={16} className="text-blue-500" />
                            Hospital Admin Panel
                          </Link>
                        </>
                      )}
                      {role === 'doctor' && (
                        <Link
                          to="/doctor-sos"
                          onClick={() => setDropdownOpen(false)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-green-600 dark:text-green-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border-t border-gray-100 dark:border-gray-805 mt-1 pt-2"
                        >
                          <BriefcaseMedical size={16} className="text-green-500" />
                          Doctor Dashboard
                        </Link>
                      )}
                      {role === 'ambulance_driver' && (
                        <Link
                          to="/ambulance-dashboard"
                          onClick={() => setDropdownOpen(false)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-amber-600 dark:text-amber-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border-t border-gray-100 dark:border-gray-805 mt-1 pt-2"
                        >
                          <Activity size={16} className="text-amber-500" />
                          Ambulance Dashboard
                        </Link>
                      )}
                    </div>

                    {/* Logout */}
                    <div className="border-t border-gray-100 dark:border-gray-800 py-1.5">
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors w-full"
                      >
                        <LogOut size={16} />
                        Sign Out
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <Link
              to="/login"
              className="flex items-center gap-1.5 bg-[#1D58D8] text-white px-3.5 py-2 rounded-[12px] font-bold text-sm shadow-md shadow-blue-500/20 transition-all active:scale-95"
            >
              <LogIn size={15} />
              <span className="hidden sm:inline">Sign In</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function RootRouter({ user, onAuthSuccess }: { user: any | null; onAuthSuccess: (user: any) => void }) {
  const getStoredRole = () => {
    try {
      const stored = localStorage.getItem('helpaid_user');
      if (stored) {
        return JSON.parse(stored).role;
      }
    } catch (e) {}
    return '';
  };
  const role = user?.role || getStoredRole();

  if (role === 'doctor') {
    return <DoctorSOSDashboard user={user} />;
  }
  if (role === 'hospital' || role === 'hospital_admin') {
    return <HospitalSOSDashboard user={user} />;
  }
  if (role === 'ambulance_driver' || role === 'ambulance') {
    return <AmbulanceDashboard user={user} />;
  }
  return <HomePage user={user} onAuthSuccess={onAuthSuccess} />;
}

export default function App() {
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
      } else {
        const stored = localStorage.getItem('helpaid_user');
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            // Preserve all fields including role, id, and profile IDs
            setUser({
              uid: parsed.id || parsed.uid,
              id: parsed.id || parsed.uid,
              email: parsed.email || '',
              displayName: parsed.displayName || 'HelpAid User',
              role: parsed.role || '',
              photoURL: parsed.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${parsed.email || 'guest'}`,
              doctorProfileId: parsed.doctorProfileId || null,
              hospitalProfileId: parsed.hospitalProfileId || null,
              hospitalId: parsed.hospitalId || null,
              ambulanceProfileId: parsed.ambulanceProfileId || null,
              ambulanceId: parsed.ambulanceId || null,
              phone: parsed.phone || '',
              status: parsed.status || 'active',
              helpAidId: parsed.helpAidId || '',
              patientName: parsed.patientName || '',
              age: parsed.age || null,
              gender: parsed.gender || '',
              bloodGroup: parsed.bloodGroup || '',
              emergencyContact: parsed.emergencyContact || ''
            } as any);
          } catch {
            setUser(null);
          }
        } else {
          setUser(null);
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <motion.div
          animate={{ scale: [1, 1.08, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
        >
          <img
            src="/logo.svg"
            alt="HelpAid AI Logo"
            className="w-14 h-14 rounded-2xl shadow-2xl shadow-blue-200 dark:shadow-blue-900/30 object-contain"
          />
        </motion.div>
      </div>
    );
  }

  const handleAuthSuccess = (u: any) => {
    setUser(u);
  };

  return (
    <Router>
      <div
        className="min-h-screen text-gray-900 dark:text-gray-100 font-sans selection:bg-blue-100 selection:text-blue-700 dark:selection:bg-blue-900/50 transition-colors duration-300 relative"
        style={{
          backgroundImage: 'url(/medical-bg.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed',
          backgroundRepeat: 'no-repeat',
        }}
      >
        {/* Background overlay */}
        <div className="fixed inset-0 bg-gray-50/88 dark:bg-gray-950/92 transition-colors duration-300 pointer-events-none" />

        <Header user={user} onSignInClick={() => {}} />

        <main className="relative z-10 w-full max-w-3xl mx-auto px-3 sm:px-5 pt-20 sm:pt-20 pb-28">
          <AnimatePresence mode="wait">
            <Routes>
              {/* Public auth routes */}
              <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login onAuthSuccess={handleAuthSuccess} />} />
              <Route path="/signup" element={user ? <Navigate to="/" replace /> : <Signup onAuthSuccess={handleAuthSuccess} />} />
              <Route path="/doctor-signup" element={<DoctorSignup onAuthSuccess={handleAuthSuccess} />} />
              <Route path="/hospital-signup" element={<HospitalSignup onAuthSuccess={handleAuthSuccess} />} />
              <Route path="/ambulance-signup" element={<AmbulanceSignup onAuthSuccess={handleAuthSuccess} />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />

              {/* Protected routes */}
              <Route path="/" element={<RootRouter user={user} onAuthSuccess={handleAuthSuccess} />} />
              <Route path="/symptoms" element={<SymptomChecker user={user} />} />
              <Route path="/nearby" element={<NearbyHelp />} />
              <Route path="/first-aid" element={<FirstAid />} />
              <Route path="/profile" element={<Profile user={user} />} />
              <Route path="/ambulance" element={<AmbulancePage />} />
              <Route path="/accident" element={<AccidentPage user={user} />} />
              <Route path="/blood" element={<BloodAvailability />} />
              <Route path="/chat" element={<AIChatAssistant user={user} />} />
              <Route path="/injury" element={<InjuryDetector user={user} />} />
              <Route path="/heart-risk" element={<HeartRiskAnalyzer user={user} />} />
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/doctor" element={<DoctorDashboard user={user} />} />
              <Route path="/hospital-dashboard" element={<HospitalDashboard user={user} />} />
              <Route path="/hospital-admin" element={<HospitalAdminPanel user={user} />} />
              <Route path="/ambulance-dashboard" element={<AmbulanceDashboard user={user} />} />
              <Route path="/tracker/:caseId" element={<EmergencyTracker />} />
              <Route path="/location-agent" element={<LocationAgentPage />} />
              <Route path="/dashboard" element={<MVPDashboard />} />
              <Route path="/sos" element={<SOSPage user={user} onAuthSuccess={handleAuthSuccess} />} />
              <Route path="/doctor-sos" element={<DoctorSOSDashboard user={user} />} />
              <Route path="/hospital-sos" element={<HospitalSOSDashboard user={user} />} />
              <Route path="/patient-dashboard" element={<ProtectedRoute user={user}><PatientDashboard user={user} /></ProtectedRoute>} />
            </Routes>
          </AnimatePresence>
        </main>

        <SOSNotification user={user} />
        <BottomNav />
      </div>
    </Router>
  );
}
