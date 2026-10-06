import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Droplets, MapPin, Phone, Navigation, Search, Activity, Info, X, Sparkles } from 'lucide-react';
import { findBloodAvailability } from '../lib/gemini';
import { cn } from '../lib/utils';

export default function BloodAvailability() {
  const [bloodGroup, setBloodGroup] = useState('O+');
  const [location, setLocation] = useState('Mathura, Uttar Pradesh');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [notification, setNotification] = useState<string | null>(null);

  const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];

  const handleSearch = async () => {
    if (!location || !bloodGroup) {
      setNotification('Please enter location and select blood group.');
      return;
    }
    setLoading(true);
    try {
      const data = await findBloodAvailability(location, bloodGroup);
      setResult(data);
    } catch (error) {
      console.error('Blood search error:', error);
      setNotification('Failed to find blood availability. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="w-full space-y-4 pb-6"
    >
      {/* ── HERO CARD ── */}
      <div className="relative overflow-hidden rounded-[32px] p-6 sm:p-8 shadow-lg shadow-red-200/50 bg-[#B91C1C]">
        <div className="absolute -top-8 -right-8 w-36 h-36 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="relative flex items-center gap-4">
          <div className="w-14 h-14 bg-white/20 border border-white/20 rounded-full flex items-center justify-center shrink-0">
            <Droplets size={26} className="text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-bold text-white/80 uppercase tracking-widest">Critical Supply</span>
              <span className="bg-white text-[#B91C1C] text-[9px] font-black px-2 py-0.5 rounded-sm">LIVE</span>
            </div>
            <h1 className="text-[24px] sm:text-[28px] font-black text-white tracking-tight leading-none">Blood Inventory</h1>
            <p className="text-red-100 text-[12px] mt-1.5 leading-tight">Real-time tracking across regional medical centers</p>
          </div>
        </div>
      </div>

      {/* ── SEARCH FORM ── */}
      <div className="bg-white rounded-[32px] p-5 sm:p-6 border border-gray-100 shadow-sm space-y-5">
        {/* Location input */}
        <div className="space-y-2.5">
          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Your Location</label>
          <div className="relative">
            <MapPin size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Enter city or area…"
              className="w-full pl-11 pr-4 py-3.5 bg-[#F3F4F6] border-none rounded-full text-[15px] font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20 transition-all"
            />
          </div>
        </div>

        {/* Blood group selector — 4x2 grid */}
        <div className="space-y-2.5">
          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Select Blood Group</label>
          <div className="grid grid-cols-4 gap-2">
            {bloodGroups.map((bg) => (
              <button
                key={bg}
                onClick={() => setBloodGroup(bg)}
                className={cn(
                  'py-3.5 rounded-2xl text-[16px] font-bold transition-all active:scale-95',
                  bloodGroup === bg
                    ? 'bg-[#B91C1C] text-white shadow-md'
                    : 'bg-[#F3F4F6] text-gray-600 hover:bg-gray-200'
                )}
              >
                {bg}
              </button>
            ))}
          </div>
        </div>

        {/* Search button */}
        <button
          onClick={handleSearch}
          disabled={loading}
          className="w-full py-4 mt-2 bg-[#1D58D8] hover:bg-blue-700 text-white rounded-full font-bold text-[14px] uppercase tracking-wide flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50 shadow-md shadow-blue-200"
        >
          {loading ? (
            <Activity className="animate-spin" size={20} />
          ) : (
            <>
              <Search size={18} />
              Search Availability
            </>
          )}
        </button>
      </div>

      {/* ── RESULTS ── */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {/* AI analysis card */}
            <div className="bg-gradient-to-br from-[#1D58D8] to-blue-600 rounded-[24px] p-5 text-white relative overflow-hidden shadow-lg shadow-blue-200">
              <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 blur-3xl rounded-full -mr-16 -mt-16 pointer-events-none" />
              <div className="relative flex items-start gap-4">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center shrink-0">
                  <Sparkles size={18} className="text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-[16px] mb-1">AI Supply Analysis</h3>
                  <p className="text-[10px] font-bold text-blue-200 uppercase tracking-widest mb-2">Real-time Intelligence</p>
                  <p className="text-[13px] text-blue-50 leading-relaxed font-medium">"{result.suggestion}"</p>
                </div>
              </div>
            </div>

            {/* Blood banks */}
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1 mt-2">
                <h3 className="font-bold text-gray-900 text-[18px]">Verified Blood Banks</h3>
                <span className="px-3 py-1 bg-red-50 text-[#B91C1C] text-[10px] font-bold uppercase tracking-wider rounded-sm">
                  Near {location.split(',')[0]}
                </span>
              </div>
              {result.bloodBanks.map((b: any, i: number) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className="bg-white rounded-[24px] border border-gray-100 p-4 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow"
                >
                  {/* Availability indicator */}
                  <div className={cn(
                    'w-12 h-12 rounded-full flex items-center justify-center shrink-0',
                    b.availability ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'
                  )}>
                    <Droplets size={22} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="font-bold text-gray-900 text-[15px] truncate">{b.name}</p>
                      <span className={cn(
                        'text-[9px] px-2 py-0.5 rounded-sm font-bold uppercase tracking-widest shrink-0',
                        b.availability ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      )}>
                        {b.availability ? 'In Stock' : 'Out of Stock'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="flex items-center gap-1.5 text-[12px] font-medium text-gray-600">
                        <MapPin size={14} className="text-gray-400" /> {b.distance}
                      </span>
                      <span className="text-gray-300">|</span>
                      <span className="flex items-center gap-1.5 text-[12px] font-bold text-[#B91C1C]">
                        <Droplets size={14} /> {bloodGroup}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 shrink-0">
                    <a
                      href={`tel:${b.phone}`}
                      className="w-9 h-9 bg-[#1D58D8] text-white rounded-full flex items-center justify-center active:scale-90 transition-transform shadow-sm"
                    >
                      <Phone size={15} />
                    </a>
                    <button
                      onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.name + ' ' + location)}`)}
                      className="w-9 h-9 bg-gray-100 text-gray-700 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                    >
                      <Navigation size={15} className="rotate-45" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── DONATE CTA ── */}
      <button className="w-full py-4 mt-2 bg-white border-2 border-dashed border-[#B91C1C]/40 rounded-[24px] text-[14px] font-bold text-[#B91C1C] flex items-center justify-center gap-2 hover:bg-[#B91C1C] hover:text-white transition-all active:scale-95 group">
        <Droplets size={18} className="group-hover:animate-bounce" />
        Request Emergency Donation
      </button>

      {/* ── NOTIFICATION TOAST ── */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.92 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-5 py-3.5 bg-gray-900 text-white rounded-2xl shadow-2xl text-xs font-bold flex items-center gap-3 border border-white/10 backdrop-blur-xl max-w-[90vw]"
          >
            <div className="p-1.5 bg-red-600 rounded-lg shrink-0">
              <Info size={14} className="text-white" />
            </div>
            <span className="flex-1 leading-snug">{notification}</span>
            <button onClick={() => setNotification(null)} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors shrink-0">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
