import { motion, AnimatePresence } from 'motion/react';
import { BookOpen, Heart, Droplets, Flame, Bone, Search, ChevronRight, Info, ShieldCheck, Activity, Phone } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../lib/utils';

export default function FirstAid() {
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const guides = [
    {
      id: 'cpr',
      title: 'CPR (Adult)',
      icon: Heart,
      color: 'text-red-600',
      bg: 'bg-red-50 dark:bg-red-900/20',
      border: 'border-red-200 dark:border-red-900/40',
      accent: 'bg-red-600',
      priority: 'CRITICAL',
      priorityColor: 'bg-red-600 text-white',
      steps: [
        'Check surroundings for safety',
        'Call for emergency help (102/108)',
        'Perform chest compressions (100–120/min)',
        'Give rescue breaths if trained',
        'Continue until help arrives',
      ],
    },
    {
      id: 'stab_wound',
      title: 'Stab Wound',
      icon: ShieldCheck,
      color: 'text-red-600',
      bg: 'bg-red-50 dark:bg-red-900/20',
      border: 'border-red-200 dark:border-red-900/40',
      accent: 'bg-red-600',
      priority: 'EMERGENCY',
      priorityColor: 'bg-red-600 text-white',
      steps: [
        'Call 108 immediately',
        'Apply firm pressure around (not on) the wound',
        'Keep patient still and warm',
        'Do NOT remove the object if embedded',
        'Do NOT give food or water',
      ],
    },
    {
      id: 'snake_bite',
      title: 'Snake Bite',
      icon: ShieldCheck,
      color: 'text-purple-600',
      bg: 'bg-purple-50 dark:bg-purple-900/20',
      border: 'border-purple-200 dark:border-purple-900/40',
      accent: 'bg-purple-600',
      priority: 'EMERGENCY',
      priorityColor: 'bg-purple-600 text-white',
      steps: [
        'Keep still and calm',
        'Keep bitten area below heart level',
        'Get to hospital immediately',
        'Do NOT suck poison or apply tourniquet',
      ],
    },
    {
      id: 'bleeding',
      title: 'Severe Bleeding',
      icon: Droplets,
      color: 'text-blue-600',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      border: 'border-blue-200 dark:border-blue-900/40',
      accent: 'bg-blue-600',
      priority: 'HIGH',
      priorityColor: 'bg-blue-600 text-white',
      steps: [
        'Apply direct pressure with a clean cloth',
        'Elevate the wound above heart level',
        'Use a clean bandage to secure pressure',
        'Do NOT remove soaked bandages — add more on top',
        'Apply tourniquet only if bleeding is life-threatening',
      ],
    },
    {
      id: 'burns',
      title: 'Burns',
      icon: Flame,
      color: 'text-orange-600',
      bg: 'bg-orange-50 dark:bg-orange-900/20',
      border: 'border-orange-200 dark:border-orange-900/40',
      accent: 'bg-orange-500',
      priority: 'HIGH',
      priorityColor: 'bg-orange-500 text-white',
      steps: [
        'Cool the burn under cool running water for 10-20 mins',
        'Cover loosely with a clean non-fluffy material',
        'Seek medical attention for any serious burn',
        'Do NOT use ice or iced water',
        'Do NOT apply butter or toothpaste, and Do NOT burst blisters',
      ],
    },
    {
      id: 'cut',
      title: 'Cut / Laceration',
      icon: Droplets,
      color: 'text-blue-600',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      border: 'border-blue-200 dark:border-blue-900/40',
      accent: 'bg-blue-600',
      priority: 'HIGH',
      priorityColor: 'bg-blue-600 text-white',
      steps: [
        'Control bleeding by pressing a clean cloth firmly on wound',
        'Elevate the cut above heart level',
        'Clean with water, apply antiseptic, and cover with bandage',
        'Do NOT remove embedded objects or probe the wound',
        'Go to emergency room for deep cuts',
      ],
    },
    {
      id: 'fractures',
      title: 'Fractures',
      icon: Bone,
      color: 'text-indigo-600',
      bg: 'bg-indigo-50 dark:bg-indigo-900/20',
      border: 'border-indigo-200 dark:border-indigo-900/40',
      accent: 'bg-indigo-600',
      priority: 'HIGH',
      priorityColor: 'bg-indigo-600 text-white',
      steps: [
        'Immobilize the injured area',
        'Apply ice packs wrapped in cloth',
        'Keep patient still and calm',
        'Do NOT try to realign the bone',
        'Do NOT move patient unnecessarily',
      ],
    },
    {
      id: 'nosebleed',
      title: 'Nosebleed',
      icon: Droplets,
      color: 'text-rose-600',
      bg: 'bg-rose-50 dark:bg-rose-900/20',
      border: 'border-rose-200 dark:border-rose-900/40',
      accent: 'bg-rose-500',
      priority: 'LOW',
      priorityColor: 'bg-gray-500 text-white',
      steps: [
        'Sit upright and lean forward',
        'Pinch the soft part of the nose for 10-15 min',
        'Breathe through your mouth',
        'Do NOT lean back',
        'Do NOT blow your nose',
      ],
    },
    {
      id: 'abrasions',
      title: 'Abrasions (Scrapes)',
      icon: Activity,
      color: 'text-teal-600',
      bg: 'bg-teal-50 dark:bg-teal-900/20',
      border: 'border-teal-200 dark:border-teal-900/40',
      accent: 'bg-teal-500',
      priority: 'LOW',
      priorityColor: 'bg-gray-500 text-white',
      steps: [
        'Rinse the wound gently under clean running water',
        'Apply antiseptic cream or lotion',
        'Cover with a sterile bandage or gauze',
        'Do NOT use cotton directly on the wound',
        'Do NOT scratch the scab as it heals',
      ],
    },
    {
      id: 'bruises',
      title: 'Bruises',
      icon: Activity,
      color: 'text-cyan-600',
      bg: 'bg-cyan-50 dark:bg-cyan-900/20',
      border: 'border-cyan-200 dark:border-cyan-900/40',
      accent: 'bg-cyan-500',
      priority: 'LOW',
      priorityColor: 'bg-gray-500 text-white',
      steps: [
        'Apply an ice pack wrapped in cloth for 15-20 minutes',
        'Elevate the bruised area above heart level',
        'Rest the injured part',
        'Do NOT apply ice directly to skin',
        'Do NOT massage forcefully',
      ],
    },
    {
      id: 'ingrown_nails',
      title: 'Ingrown Nails',
      icon: Activity,
      color: 'text-stone-600',
      bg: 'bg-stone-50 dark:bg-stone-900/20',
      border: 'border-stone-200 dark:border-stone-900/40',
      accent: 'bg-stone-500',
      priority: 'LOW',
      priorityColor: 'bg-gray-500 text-white',
      steps: [
        'Soak the foot in warm salty water for 15 minutes',
        'Gently lift the nail edge and place cotton under it',
        'Keep area clean and dry, wear comfortable shoes',
        'Do NOT cut nails too short',
        'See a doctor if infected',
      ],
    },
  ];

  const filteredGuides = guides.filter(g =>
    g.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="w-full space-y-5 pb-6"
    >
      {/* ── HERO ── */}
      <div className="relative overflow-hidden rounded-[32px] shadow-lg shadow-red-200/50 bg-[#B91C1C] p-6 sm:p-8 mt-2">
        <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full blur-3xl pointer-events-none -mr-10 -mt-10" />
        
        <div className="relative flex items-start justify-between mb-5">
          <div>
            <div className="inline-block px-3 py-1 bg-white/20 rounded-full mb-3">
              <span className="text-[10px] font-bold text-white uppercase tracking-widest">Protocol Library</span>
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight leading-tight">
              First Aid<br />Guide
            </h1>
          </div>
          <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center shrink-0 shadow-sm">
            <BookOpen size={24} className="text-[#B91C1C]" />
          </div>
        </div>
        
        <p className="text-red-100 text-[13px] leading-relaxed max-w-[85%] mb-5">
          Step-by-step protocols verified by emergency responders. Works offline.
        </p>

        {/* Search bar inside hero */}
        <div className="relative mb-5">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search protocols…"
            className="w-full pl-12 pr-4 py-3.5 bg-white rounded-full text-[15px] font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none shadow-sm"
          />
        </div>

        {/* Emergency call strip */}
        <a
          href="tel:108"
          className="flex items-center gap-3 bg-white/20 hover:bg-white/30 rounded-[20px] p-3 transition-all active:scale-[0.98]"
        >
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shrink-0">
            <Phone size={18} className="text-[#B91C1C]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-[14px]">Call 108 — Ambulance</p>
            <p className="text-red-100 text-[11px] mt-0.5">Tap to dial immediately</p>
          </div>
          <ChevronRight size={18} className="text-white/50" />
        </a>
      </div>

      {/* ── GUIDE CARDS ── */}
      <div className="space-y-4 px-1">
        {filteredGuides.map((g) => {
          const isOpen = openId === g.id;
          return (
            <div
              key={g.id}
              className={cn(
                'bg-white rounded-[24px] overflow-hidden transition-all duration-200 border',
                isOpen ? 'border-[#1D58D8] shadow-md' : 'border-gray-100 shadow-sm hover:border-gray-200 hover:shadow-md'
              )}
            >
              {/* Summary row */}
              <button
                className="w-full flex items-center gap-4 p-5 text-left"
                onClick={() => setOpenId(isOpen ? null : g.id)}
              >
                <div className={cn('w-12 h-12 rounded-full flex items-center justify-center shrink-0 transition-transform duration-200', g.bg, isOpen && 'scale-105')}>
                  <g.icon size={22} className={g.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-[16px] text-gray-900 leading-tight mb-1">{g.title}</h3>
                  <div className="flex items-center gap-2">
                    <span className={cn('text-[9px] px-2 py-0.5 rounded-sm font-black uppercase tracking-wider', g.priorityColor)}>
                      {g.priority}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] font-medium text-gray-500">
                      <ShieldCheck size={12} className="text-green-500" />
                      {g.steps.length} Steps
                    </span>
                  </div>
                </div>
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all',
                  isOpen ? 'bg-[#1D58D8] text-white rotate-90' : 'bg-gray-50 text-gray-400'
                )}>
                  <ChevronRight size={18} />
                </div>
              </button>

              {/* Expanded steps */}
              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <div className="px-5 pb-6 space-y-4">
                      <div className="h-px bg-gray-100 w-full mb-2" />
                      {g.steps.map((step, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.06 }}
                          className="flex gap-4 items-start"
                        >
                          <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 mt-0.5 shadow-sm', g.accent)}>
                            {i + 1}
                          </div>
                          <p className="text-[14px] text-gray-700 leading-relaxed">{step}</p>
                        </motion.div>
                      ))}

                      {/* Warning banner */}
                      <div className="mt-5 flex items-start gap-3 p-4 rounded-[16px] bg-red-50 border border-red-100">
                        <Info size={18} className="shrink-0 mt-0.5 text-red-600" />
                        <p className="text-[12px] font-medium text-red-800 leading-relaxed">
                          Always call emergency services (108) immediately — first aid is only a bridge to professional care.
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}

        {/* Empty state */}
        {filteredGuides.length === 0 && (
          <div className="text-center py-16 space-y-3">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto">
              <Search size={28} className="text-gray-300" />
            </div>
            <p className="font-bold text-gray-900">No guides found</p>
            <p className="text-sm text-gray-400">Try searching for "CPR" or "Burns"</p>
          </div>
        )}
      </div>

      {/* ── OFFLINE NOTICE ── */}
      <div className="bg-linear-to-br from-gray-900 to-gray-800 dark:from-gray-800 dark:to-gray-900 rounded-3xl p-5 sm:p-6 text-white relative overflow-hidden shadow-xl">
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/10 blur-3xl rounded-full -mr-10 -mt-10 pointer-events-none" />
        <div className="relative flex items-start gap-4">
          <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center shrink-0">
            <Activity size={18} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-black text-base sm:text-lg mb-1">Offline Mode Active</h4>
            <p className="text-gray-400 text-sm leading-relaxed">
              All protocols are stored locally — accessible even without cellular coverage.
            </p>
          </div>
        </div>
        <div className="relative mt-4 flex flex-wrap gap-2">
          <button className="px-4 py-2.5 bg-white text-gray-900 rounded-full text-xs font-black uppercase tracking-wider transition-all hover:scale-105 active:scale-95 shadow-lg">
            Update Database
          </button>
          <button className="px-4 py-2.5 bg-white/10 hover:bg-white/20 rounded-full text-xs font-black uppercase tracking-wider transition-all">
            Print Version
          </button>
        </div>
      </div>
    </motion.div>
  );
}
