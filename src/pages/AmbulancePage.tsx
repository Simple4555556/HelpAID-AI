import { motion } from 'motion/react';
import { Phone, Navigation, MapPin, Share2, MessageSquare, Activity, ShieldAlert } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function AmbulancePage() {
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [broadcast, setBroadcast] = useState(false);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => console.error('Geolocation error:', err)
      );
    }
  }, []);

  const ambulances = [
    { name: 'Shri Dhanwantri Hospital', distance: '1.84 km', phone: '+91 9266949411', location: 'Semri, Chhata, Mathura' },
    { name: 'KD Medical College', distance: '4.5 km', phone: '07055502242', location: 'Akbarpur, NH-2, Chhata' },
    { name: 'Gopi Krishna Hospital', distance: '2.5 km', phone: '102', location: 'Chhata, Mathura' },
    { name: 'Jeevan Jyoti Trauma Centre', distance: '3.2 km', phone: '102', location: 'Chhata, Mathura' },
  ];

  const quickNumbers = [
    { number: '102', label: 'Medical', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' },
    { number: '112', label: 'National', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20' },
    { number: '101', label: 'Fire', color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/20' },
    { number: '100', label: 'Police', color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-900/20' },
  ];

  const handleNavigate = (a: { name: string; location: string }) => {
    const destination = encodeURIComponent(`${a.name} ${a.location}`);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${destination}`);
  };

  const handleBroadcast = () => {
    if (location) {
      const text = `Emergency Location: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`;
      navigator.clipboard?.writeText(text).catch(() => {});
      setBroadcast(true);
      setTimeout(() => setBroadcast(false), 2000);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="w-full space-y-5 pb-6"
    >
      {/* ── HEADER ── */}
      <div>
        <h1 className="text-[28px] font-black text-gray-900 tracking-tight leading-tight mb-1">Medical Dispatch</h1>
        <p className="text-[13px] text-gray-500 font-medium">Direct connection to ambulance services</p>
      </div>

      {/* ── LARGE 108 CIRCLE BUTTON ── */}
      <div className="flex flex-col items-center py-6">
        <div className="relative flex items-center justify-center">
          {/* Outer ping rings */}
          <div className="absolute w-56 h-56 bg-red-500/10 rounded-full animate-ping" style={{ animationDuration: '2.5s' }} />
          <div className="absolute w-52 h-52 bg-red-500/15 rounded-full animate-ping" style={{ animationDuration: '2.5s', animationDelay: '0.4s' }} />
          {/* Outer ring */}
          <div className="absolute w-48 h-48 border-[6px] border-red-50 rounded-full" />
          {/* Main button */}
          <motion.a
            href="tel:108"
            whileTap={{ scale: 0.95 }}
            className="relative w-44 h-44 bg-gradient-to-b from-[#e53935] to-[#B91C1C] rounded-full flex flex-col items-center justify-center shadow-xl shadow-red-300 transition-all z-10"
          >
            <Phone size={32} className="text-white mb-1" />
            <span className="text-[56px] font-black text-white leading-none tracking-tight">108</span>
            <span className="text-white text-[11px] font-bold mt-1 uppercase tracking-widest">Tap to Call</span>
          </motion.a>
        </div>
        <div className="mt-6 text-center bg-red-50 px-5 py-2.5 rounded-full border border-red-100">
          <p className="font-bold text-[#B91C1C] text-[13px] tracking-wide">Emergency Dispatch • 24/7 Service</p>
        </div>
      </div>

      {/* ── GPS + BROADCAST CARD ── */}
      <div className="bg-white rounded-[32px] p-6 border border-gray-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />
        <div className="flex items-center gap-4 mb-5 relative">
          <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center shadow-sm shrink-0">
            <MapPin size={22} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Live GPS Signal</p>
            <p className="text-[14px] font-bold text-gray-900 font-mono leading-tight bg-gray-50 px-2 py-1 rounded-md inline-block">
              {location
                ? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`
                : 'Acquiring signal…'}
            </p>
          </div>
          <button
            onClick={() => {
              if (location) {
                const text = `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`;
                navigator.clipboard?.writeText(text).catch(() => {});
              }
            }}
            className="ml-auto w-10 h-10 bg-[#F3F4F6] text-gray-500 hover:bg-gray-200 hover:text-gray-700 rounded-full flex items-center justify-center transition-colors shrink-0"
          >
            <Share2 size={16} />
          </button>
        </div>
        <button
          onClick={handleBroadcast}
          className="w-full py-4 bg-[#1D58D8] hover:bg-blue-700 text-white rounded-full font-bold text-[14px] uppercase tracking-wide flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md shadow-blue-200 relative"
        >
          {broadcast ? '✓ Broadcast Sent!' : 'Broadcast Signal'}
        </button>
      </div>

      {/* ── QUICK ACCESS NUMBERS ── */}
      <div>
        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-3 px-2">Quick Access</p>
        <div className="grid grid-cols-2 gap-3">
          {quickNumbers.map(({ number, label, color, bg }) => (
            <a
              key={number}
              href={`tel:${number}`}
              className={`flex flex-col items-center justify-center gap-1.5 py-5 rounded-[24px] font-bold transition-all active:scale-95 bg-white border border-gray-100 shadow-sm hover:shadow-md group`}
            >
              <div className={`w-12 h-12 ${bg} ${color} rounded-full flex items-center justify-center mb-1 group-hover:scale-110 transition-transform`}>
                <span className="text-[18px] font-black">{number}</span>
              </div>
              <span className={`text-[12px] font-bold uppercase tracking-wider text-gray-600`}>{label}</span>
            </a>
          ))}
        </div>
      </div>

      {/* ── ACTIVE UNITS ── */}
      <div className="bg-white rounded-[32px] p-6 border border-gray-100 shadow-sm mt-2">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center">
              <Activity size={20} className="text-[#B91C1C]" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-[16px] leading-tight">Active Units</h3>
              <p className="text-[11px] text-gray-500 font-medium">Verified medical logistics</p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-sm border border-green-100">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-bold text-green-700 uppercase tracking-wider">{ambulances.length} Ready</span>
          </div>
        </div>

        <div className="space-y-3">
          {ambulances.map((a, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="flex items-center gap-4 p-3.5 bg-[#F3F4F6] rounded-[24px]"
            >
              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center border border-gray-100 shrink-0 shadow-sm">
                <ShieldAlert size={20} className="text-[#B91C1C]" />
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 text-[15px] truncate">{a.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[11px] font-medium text-gray-500 flex items-center gap-1.5">
                    <MapPin size={12} className="text-gray-400" /> {a.distance}
                  </span>
                  <span className="text-gray-300">|</span>
                  <span className="flex items-center gap-1 text-[11px] font-bold text-green-600">
                    Ready
                  </span>
                </div>
              </div>

              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => handleNavigate(a)}
                  className="w-10 h-10 bg-blue-50 text-[#1D58D8] rounded-full flex items-center justify-center hover:bg-blue-100 transition-colors active:scale-90"
                  title="Navigate to hospital"
                  aria-label="Navigate to hospital"
                >
                  <Navigation size={16} />
                </button>
                <a
                  href={`tel:${a.phone}`}
                  className="w-10 h-10 bg-[#1D58D8] text-white rounded-full flex items-center justify-center transition-colors active:scale-90 shadow-sm"
                >
                  <Phone size={16} />
                </a>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
