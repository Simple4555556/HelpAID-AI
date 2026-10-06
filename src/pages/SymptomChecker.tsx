import { useState } from 'react';
import { User } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import {
  Activity, ShieldAlert, CheckCircle2,
  AlertCircle, Phone, MapPin,
  RefreshCcw, Download, Clock, Shield, Sparkles, Navigation, LocateFixed
} from 'lucide-react';
import { db, collection, addDoc, Timestamp } from '../firebase';
import { cn } from '../lib/utils';
import { analyzeSymptoms } from '../lib/gemini';
import { API_BASE_URL } from '../config';

const QUICK_SYMPTOMS = [
  { label: 'Fever', value: 'Fever' },
  { label: 'Chest Pain', value: 'Chest Pain' },
  { label: 'Headache', value: 'Headache' },
  { label: 'Breathlessness', value: 'Shortness of breath' },
  { label: 'Stomach Ache', value: 'Stomach Ache' },
  { label: 'Skin Rash', value: 'Skin Rash' },
  { label: 'Dizziness', value: 'Dizziness' },
  { label: 'Vomiting', value: 'Vomiting' },
  { label: 'Back Pain', value: 'Back Pain' },
  { label: 'Injury / Wound', value: 'Injury' },
];

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function SymptomChecker({ user }: { user: User | null }) {
  const [age, setAge] = useState<number | ''>('');
  const [gender, setGender] = useState<string>('Male');
  const [existingDiseases, setExistingDiseases] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [selectedChip, setSelectedChip] = useState('');
  const [painLevel, setPainLevel] = useState<number>(7);
  const [physicalSeverity, setPhysicalSeverity] = useState<string>('moderate');
  const [duration, setDuration] = useState<string>('Less than 24 hours');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);

  const symptom = selectedChip || input;

  const handleAnalyze = async () => {
    if (!symptom.trim() || !age) return;
    setLoading(true);
    setError(null);
    try {
      const prompt = `
Symptom: ${symptom}
Age: ${age}
Gender: ${gender}
Pain Level: ${painLevel}/10
Duration: ${duration}
Existing Conditions: ${existingDiseases.join(', ') || 'None'}
Physical Severity: ${physicalSeverity}
`;
      const aiResult = await analyzeSymptoms(
        symptom,
        age,
        gender,
        existingDiseases.join(', ') || 'None',
        painLevel,
        duration,
        user?.uid || undefined
      );

      // Map suggested doctors to include distanceLabel if missing
      const suggestedDoctors = (aiResult.suggestedDoctors || []).map((d: any) => {
        const km = (userLat && userLng && d.lat) ? haversine(userLat, userLng, d.lat, d.lng) : (d.distance_km || 2.5);
        return { 
          ...d, 
          distance_km: km, 
          distanceLabel: km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`,
          specialization: d.specialty || 'General Physician'
        };
      }).sort((a: any, b: any) => a.distance_km - b.distance_km);

      const baseResult = {
        ...aiResult,
        action: aiResult.summary || 'Follow the immediate steps provided.',
        topConditions: aiResult.possibleConditions,
      };

      setResult({
        ...baseResult,
        suggestedDoctors,
        medicalShops: aiResult.medicalShops && aiResult.medicalShops.length > 0 ? aiResult.medicalShops : [
          { name: 'Apollo Pharmacy', address: 'Main Market, Chhata', phone: '8171015325' },
          { name: 'Jeevan Pharmacy', address: 'Highway Crossing', phone: '9266949411' },
        ]
      });

      if (user) {
        await addDoc(collection(db, 'emergencies'), {
          userId: user.uid, type: 'SYMPTOM_CHECKER', status: 'RESOLVED',
          timestamp: Timestamp.now(), symptomResult: JSON.stringify(baseResult)
        });

        try {
          const firstCondition = baseResult.topConditions?.[0] || baseResult.possibleConditions?.[0];
          const predictedDisease = typeof firstCondition === 'string' ? firstCondition : (firstCondition?.name || 'Unknown Condition');
          let confidenceScore = 85;
          if (firstCondition && typeof firstCondition !== 'string') {
            if (firstCondition.confidence) {
              confidenceScore = firstCondition.confidence;
            } else if (firstCondition.match_reason) {
              const num = parseInt(firstCondition.match_reason);
              if (!isNaN(num)) confidenceScore = num;
            }
          }

          await fetch(`${API_BASE_URL}/api/symptom-history`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: user.uid,
              symptoms: symptom,
              predictedDisease,
              confidenceScore,
              severity: baseResult.urgency || 'MEDIUM'
            })
          });
        } catch (postErr) {
          console.error('Failed to post symptom history:', postErr);
        }
      }
    } catch (err) {
      console.error('Analysis failed:', err);
      setError('Failed to analyze. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setAge(''); setGender('Male'); setInput(''); setSelectedChip('');
    setPainLevel(7); setDuration('Less than 24 hours'); setResult(null); setError(null);
    setUserLat(null); setUserLng(null);
  };

  const downloadReport = () => {
    if (!result) return;
    const divider = '─'.repeat(50);
    const report = [
      divider, '       HELPAID AI — FULL MEDICAL REPORT', divider,
      `DATE: ${new Date().toLocaleString('en-IN')}`, '',
      '👤 USER PROFILE:',
      `- Age: ${age}`, `- Gender: ${gender}`,
      `- Pre-existing Conditions: ${existingDiseases.length > 0 ? existingDiseases.join(', ') : 'None reported'}`, '',
      '🤒 ASSESSMENT DETAILS:',
      `- Main Symptom: ${input || selectedChip}`, `- Duration: ${duration}`,
      `- Pain Level: ${painLevel}/10`, `- Physical Severity: ${physicalSeverity.toUpperCase()}`, '',
      '🔬 AI TRIAGE RESULT:',
      `- Urgency Level: ${result.urgency}`, `- Possible Conditions:`,
      ...(result.topConditions || result.possibleConditions || []).map((c: any, i: number) => `  ${i + 1}. ${typeof c === 'string' ? c : c.name}`),
      `- Recommended Action: ${result.action}`, '',
      '📝 RECOMMENDED STEPS:',
      ...(result.immediateSteps || []).map((s: string, i: number) => `${i + 1}. ${s}`), '',
      '🏥 NEARBY MEDICAL HELP:',
      ...(result.suggestedDoctors || []).slice(0, 3).map((d: any) => `- Dr. ${d.name} (${d.specialization})`), '',
      '⚠️ DISCLAIMER:',
      'This report is generated by an AI assistant for triage purposes only. It is NOT a medical diagnosis.',
      divider, 'Powered by HelpAid AI — Your Emergency Health Partner',
    ].join('\n');

    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `HelpAid_Report_${Date.now()}.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  // ── RESULTS VIEW ─────────────────────────────────────────────────────────
  if (result) {
    const isEmergency = result.urgency === 'EMERGENCY' || result.urgency === 'HIGH';
    return (
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full space-y-6 pb-8">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <button onClick={reset} className="flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">
            <RefreshCcw size={16} /> Start Over
          </button>
          <button onClick={downloadReport} className="flex items-center gap-2 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline">
            <Download size={16} /> Save Report
          </button>
        </div>

        {/* Urgency Banner */}
        <div className={cn("p-6 rounded-[1rem] text-white shadow-xl flex items-start gap-4 ring-4", isEmergency ? "bg-red-700 ring-red-700/20" : "bg-blue-600 ring-blue-600/20")}>
          <ShieldAlert size={32} className="shrink-0 mt-1" />
          <div className="space-y-1">
            <h3 className="text-2xl font-bold tracking-tight leading-tight">
              {isEmergency ? 'URGENT MEDICAL ATTENTION' : 'MEDICAL ADVICE'}
            </h3>
            <p className="opacity-90 leading-relaxed text-base">{result.action}</p>
          </div>
        </div>

        {/* Analysis Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Conditions */}
          <div className="md:col-span-2 glass dark:glass-dark rounded-[1rem] p-6 space-y-6">
            <h4 className="text-sm font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-widest flex items-center gap-2">
              <Sparkles size={20} /> Likely Considerations
            </h4>
            <div className="space-y-3">
              {(result.topConditions || result.possibleConditions || []).map((c: any, i: number) => (
                <div key={i} className="flex justify-between items-center p-4 rounded-xl bg-white/50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                  <span className="font-semibold text-gray-900 dark:text-white">{typeof c === 'string' ? c : c.name}</span>
                  <span className={cn("px-3 py-1 text-xs rounded-full font-bold", i === 0 ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400")}>
                    {c.match_reason || `${85 - i * 15}% Match`}
                  </span>
                </div>
              ))}
            </div>

            <div className="space-y-3 pt-2">
              <h5 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Immediate Actions</h5>
              <ul className="space-y-3">
                {result.immediateSteps?.map((s: string, i: number) => (
                  <li key={i} className="flex gap-3 text-base items-start text-gray-700 dark:text-gray-300">
                    <CheckCircle2 className="text-green-600 shrink-0 mt-0.5" size={20} />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Nearby Doctors/Facility */}
          {result.suggestedDoctors?.length > 0 && (
            <div className="glass dark:glass-dark rounded-[1rem] overflow-hidden flex flex-col">
              <div className="h-40 w-full bg-slate-200 dark:bg-slate-800 relative">
                <img alt="Map" src="https://lh3.googleusercontent.com/aida-public/AB6AXuA1YgYXk4Gkk8_Rgh9VPeXuwm-zsldkEAh805DYT3RQBmutB7AP2JdgdSKo4BQdQmEHzZNnXtX6zhWuOwNgzkuMmXHFNJ7hCaHJCdVHeWsopNfxL-zH1wqYds0wEZssZ5sxC4KMSyWI9Gt6L6t4bnUN5OolFnkqE5yv6e3ZaQ193DiW3AK6mm7nKBjwLlsc6PDTVFWEbx-3vf3I7d966XYi26A-x3E8F8B_66R_Z0iXZZ4kfgg041T-Qsac7KAMsXuOiWgslEGpw_8I" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                <div className="absolute bottom-3 left-4 text-white text-xs font-bold flex items-center gap-1.5">
                  <MapPin size={14} /> Nearest Facility: {result.suggestedDoctors[0].distanceLabel}
                </div>
              </div>
              <div className="p-6 space-y-4 flex-1 flex flex-col justify-between">
                <div>
                  <h4 className="font-bold text-gray-900 dark:text-white text-lg">{result.suggestedDoctors[0].name}</h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{result.suggestedDoctors[0].specialization} services available. {result.suggestedDoctors[0].address}</p>
                </div>
                <button onClick={() => window.open(`https://www.google.com/maps/dir/${userLat ? `${userLat},${userLng}` : ''}/${encodeURIComponent(result.suggestedDoctors[0].name + ' ' + (result.suggestedDoctors[0].address || ''))}`, '_blank')} className="w-full py-3 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-sm font-bold hover:bg-blue-600 hover:text-white transition-colors">
                  Start Navigation
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    );
  }

  // ── INPUT FORM ───────────────────────────────────────────────────────────
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full pb-8">
      
      {/* Step Indicator */}
      <nav className="mb-8 hidden sm:block">
        <div className="flex items-center justify-between relative max-w-sm mx-auto">
          <div className="absolute top-1/2 left-0 w-full h-[2px] bg-gray-200 dark:bg-gray-800 -z-10 -translate-y-1/2"></div>
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-blue-700 text-white flex items-center justify-center font-bold shadow-lg ring-4 ring-white dark:ring-gray-950">1</div>
            <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">Who</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-blue-700 text-white flex items-center justify-center font-bold shadow-lg ring-4 ring-white dark:ring-gray-950">2</div>
            <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">What</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-blue-700 text-white flex items-center justify-center font-bold shadow-lg ring-4 ring-white dark:ring-gray-950">3</div>
            <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">How</span>
          </div>
        </div>
      </nav>

      <section className="bg-white rounded-[32px] p-5 sm:p-8 shadow-sm space-y-8 border border-gray-100">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-[#1D58D8]">Symptom Analysis</h1>
          <p className="text-gray-500 text-base">Please provide accurate details for our clinical AI engine.</p>
        </div>

        {/* 👤 Step 1: Who */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <label className="text-sm font-semibold text-[#1D58D8] block">Gender at Birth</label>
            <div className="flex gap-4">
              {['Male', 'Female'].map(g => (
                <button key={g} onClick={() => setGender(g)}
                  className={cn(
                    'flex-1 py-3 px-4 rounded-[16px] font-semibold text-sm transition-all border',
                    gender === g
                      ? 'bg-[#1D58D8] text-white border-[#1D58D8]'
                      : 'bg-gray-50 text-gray-900 border-gray-300 hover:bg-gray-100'
                  )}>
                  {g}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <label className="text-sm font-semibold text-[#1D58D8] block">Age</label>
            <input type="number" value={age} onChange={e => setAge(parseInt(e.target.value) || '')} placeholder="Years"
              className="w-full bg-gray-50 border border-gray-300 rounded-[16px] p-3 text-gray-900 focus:ring-2 focus:ring-[#1D58D8] focus:border-[#1D58D8] transition-all" />
          </div>
        </div>

        <div className="h-px bg-gray-100 my-8"></div>

        {/* 🤒 Step 2: What */}
        <div className="space-y-6">
          <label className="text-sm font-semibold text-[#1D58D8] block">Common Symptoms</label>
          <div className="flex flex-wrap gap-2">
            {QUICK_SYMPTOMS.map(chip => (
              <span key={chip.value} onClick={() => { setSelectedChip(chip.value === selectedChip ? '' : chip.value); setInput(''); }}
                className={cn(
                  'px-4 py-2 rounded-full text-xs font-bold cursor-pointer transition-all',
                  selectedChip === chip.value
                    ? 'bg-[#1D58D8] text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-[#1D58D8]'
                )}>
                {chip.label}
              </span>
            ))}
          </div>
          <div className="space-y-3 mt-6">
            <label className="text-sm font-semibold text-[#1D58D8] block">Describe how you feel</label>
            <textarea value={input} onChange={e => { setInput(e.target.value); setSelectedChip(''); }}
              placeholder="e.g., Sharp pain in lower abdomen that started 2 hours ago..." rows={3}
              className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-4 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-700 focus:border-blue-700 transition-all"></textarea>
          </div>
        </div>

        <div className="h-px bg-gray-100 my-8"></div>

        {/* 📊 Step 3: How */}
        <div className="space-y-8">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <label className="text-sm font-semibold text-[#1D58D8] block">Pain Intensity</label>
              <span className="text-[#B91C1C] font-bold">{painLevel} / 10</span>
            </div>
            <style>
              {`
                .pain-slider::-webkit-slider-thumb {
                  -webkit-appearance: none;
                  appearance: none;
                  width: 24px;
                  height: 24px;
                  background: #1D58D8;
                  cursor: pointer;
                  border-radius: 50%;
                  border: 4px solid white;
                  box-shadow: 0 0 10px rgba(0,0,0,0.1);
                }
              `}
            </style>
            <input type="range" min="0" max="10" value={painLevel} onChange={e => setPainLevel(parseInt(e.target.value))}
              className="pain-slider w-full h-2 rounded-lg appearance-none cursor-pointer"
              style={{ background: 'linear-gradient(to right, #22c55e, #eab308, #B91C1C)' }} />
            <div className="flex justify-between text-xs font-medium text-gray-400">
              <span>No Pain</span><span>Moderate</span><span>Severe</span>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-sm font-semibold text-[#1D58D8] block">Duration</label>
            <select value={duration} onChange={e => setDuration(e.target.value)}
              className="w-full bg-gray-50 border border-gray-300 rounded-[16px] p-3 text-gray-900 focus:ring-2 focus:ring-[#1D58D8] focus:outline-none transition-all">
              <option>Less than 24 hours</option>
              <option>1-3 days</option>
              <option>About a week</option>
              <option>Chronic (months+)</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 text-[#B91C1C] rounded-xl flex items-center gap-2">
            <AlertCircle size={18} /> <span className="text-sm font-semibold">{error}</span>
          </div>
        )}

        <div className="pt-6 flex flex-col sm:flex-row gap-4">
          <button onClick={reset} className="flex-1 py-4 rounded-[16px] bg-gray-100 text-gray-900 font-bold hover:bg-gray-200 transition-all active:scale-95">
            Clear Form
          </button>
          <button onClick={handleAnalyze} disabled={loading || !symptom.trim() || !age} className="flex-[2] py-4 rounded-[16px] bg-[#1D58D8] text-white font-bold shadow-xl hover:shadow-blue-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95">
            {loading ? <Activity className="animate-spin" size={20} /> : <span>Generate Analysis</span>}
            {!loading && <Activity size={20} />}
          </button>
        </div>
      </section>
    </motion.div>
  );
}
