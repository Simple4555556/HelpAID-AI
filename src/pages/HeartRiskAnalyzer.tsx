import { useState } from 'react';
import { User } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import {
  Activity, Heart, ShieldAlert, CheckCircle2,
  AlertCircle, Download, RefreshCcw, Sparkles, Sliders, Info, ChevronRight, ChevronLeft, ArrowRight
} from 'lucide-react';
import { db, collection, addDoc, Timestamp } from '../firebase';
import { cn } from '../lib/utils';
import { analyzeHeartDisease } from '../lib/gemini';

export default function HeartRiskAnalyzer({ user }: { user: User | null }) {
  // Step navigation
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Form parameters
  const [age, setAge] = useState<number | ''>('');
  const [sex, setSex] = useState<number>(1); // 1 = Male, 0 = Female
  const [cp, setCp] = useState<number>(0); // Chest pain: 0-3
  const [trestbps, setTrestbps] = useState<number | ''>(120);
  const [chol, setChol] = useState<number | ''>(200);
  const [fbs, setFbs] = useState<number>(0); // Fasting blood sugar: 0 or 1
  const [restecg, setRestecg] = useState<number>(0); // ECG: 0-2
  const [thalach, setThalach] = useState<number | ''>(150);
  const [exang, setExang] = useState<number>(0); // Exercise angina: 0 or 1
  const [oldpeak, setOldpeak] = useState<number>(0.0); // ST depression
  const [slope, setSlope] = useState<number>(1); // Slope: 0-2
  const [ca, setCa] = useState<number>(0); // Vessels: 0-3
  const [thal, setThal] = useState<number>(2); // Thalassemia: 0-3

  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleAnalyze = async () => {
    if (!age || !trestbps || !chol || !thalach) {
      setError('Please fill in all core fields (Age, Blood Pressure, Cholesterol, and Max Heart Rate).');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = {
        age: Number(age),
        sex,
        cp,
        trestbps: Number(trestbps),
        chol: Number(chol),
        fbs,
        restecg,
        thalach: Number(thalach),
        exang,
        oldpeak,
        slope,
        ca,
        thal,
        userId: user?.uid || undefined
      };

      const aiResult = await analyzeHeartDisease(payload);
      setResult(aiResult);

      if (user) {
        await addDoc(collection(db, 'emergencies'), {
          userId: user.uid,
          type: 'HEART_ANALYSIS',
          status: 'RESOLVED',
          timestamp: Timestamp.now(),
          symptomResult: JSON.stringify(aiResult)
        });
      }
    } catch (err) {
      console.error('Cardiovascular analysis failed:', err);
      setError('Failed to calculate risk analysis. Please check connections.');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setAge('');
    setSex(1);
    setCp(0);
    setTrestbps(120);
    setChol(200);
    setFbs(0);
    setRestecg(0);
    setThalach(150);
    setExang(0);
    setOldpeak(0.0);
    setSlope(1);
    setCa(0);
    setThal(2);
    setResult(null);
    setError(null);
    setStep(1);
  };

  const downloadReport = () => {
    if (!result) return;
    const divider = '═'.repeat(50);
    const report = [
      divider,
      '       HELPAID AI — CARDIOVASCULAR HEALTH REPORT',
      divider,
      `DATE: ${new Date().toLocaleString('en-IN')}`,
      '',
      '👤 CLINICAL PROFILE METRICS:',
      `- Age: ${age} years old`,
      `- Biological Sex: ${sex === 1 ? 'Male' : 'Female'}`,
      `- Chest Pain Type (CP): ${cp}`,
      `- Resting Blood Pressure: ${trestbps} mm Hg`,
      `- Serum Cholesterol: ${chol} mg/dL`,
      `- Fasting Blood Sugar > 120 mg/dL: ${fbs === 1 ? 'Yes' : 'No'}`,
      `- Max Heart Rate Achieved: ${thalach} bpm`,
      `- Exercise Induced Angina: ${exang === 1 ? 'Yes' : 'No'}`,
      `- ST Depression (Oldpeak): ${oldpeak}`,
      `- Vessels Colored: ${ca}`,
      `- Thalassemia Code: ${thal}`,
      '',
      '📊 MACHINE LEARNING RISK OUTPUT:',
      `- Risk Score: ${result.riskScore}% Probability of Heart Disease`,
      `- Clinical Risk Classification: ${result.riskLevel || 'MEDIUM'}`,
      '',
      '🩺 CARDIOLOGY TEAM ASSESSMENT:',
      result.explanation,
      '',
      '🥗 RECOMMENDED ADJUSTMENTS (LIFESTYLE & DIET):',
      ...(result.lifestyleTips || []).map((tip: string, i: number) => `  ${i + 1}. ${tip}`),
      '',
      '🚨 RED FLAG CRITICAL WARNINGS:',
      ...(result.warningSigns || []).map((sign: string, i: number) => `  ${i + 1}. ${sign}`),
      '',
      '🏥 RECOMMENDED CARDIOLOGY DEPARTMENT:',
      result.clinicRecommendation,
      '',
      '⚠️ IMPORTANT DISCLAIMER:',
      'This report is generated using a combination of random forest algorithms trained on cardiac datasets and AI large language models. It is for pre-clinical triage and risk assessment only. Please consult a qualified cardiologist for a clinical diagnosis.',
      divider,
      'Powered by HelpAid AI — Your Emergency Health Partner',
    ].join('\n');

    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `HelpAid_CardioReport_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── RESULTS VIEW ─────────────────────────────────────────────────────────
  if (result) {
    const isCritical = result.riskLevel === 'HIGH' || result.riskScore >= 50;
    const strokeDashoffset = 251.2 - (251.2 * result.riskScore) / 100;

    return (
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full space-y-6 pb-8">
        
        {/* Navigation actions */}
        <div className="flex items-center justify-between">
          <button onClick={reset} className="flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-900 transition-colors">
            <RefreshCcw size={16} /> Start New Test
          </button>
          <button onClick={downloadReport} className="flex items-center gap-2 text-sm font-semibold text-blue-600 hover:underline">
            <Download size={16} /> Save Full Report
          </button>
        </div>

        {/* Hero Risk Alert */}
        <div className={cn("p-6 rounded-[24px] text-white shadow-xl flex flex-col md:flex-row items-center gap-6 ring-4", isCritical ? "bg-red-700 ring-red-700/20" : "bg-teal-700 ring-teal-700/20")}>
          {/* Risk Gauge (Circular SVG) */}
          <div className="relative w-28 h-28 flex items-center justify-center shrink-0">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="40" className="stroke-white/20 fill-none" strokeWidth="8" />
              <circle cx="50" cy="50" r="40" className="stroke-white fill-none transition-all duration-1000" strokeWidth="8" strokeDasharray="251.2" strokeDashoffset={strokeDashoffset} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-black">{Math.round(result.riskScore)}%</span>
              <span className="text-[9px] uppercase font-bold tracking-wider opacity-85">Risk</span>
            </div>
          </div>

          <div className="space-y-1.5 text-center md:text-left flex-1">
            <h3 className="text-xl sm:text-2xl font-black tracking-tight leading-tight uppercase">
              {isCritical ? 'High Cardiac Risk Detected' : 'Healthy / Lower Risk Score'}
            </h3>
            <p className="opacity-90 text-sm leading-relaxed max-w-lg">
              The AI assessment classifies your cardiovascular profile as <span className="font-bold underline">{result.riskLevel || 'MEDIUM'} RISK</span>. Please check the clinical guidelines below.
            </p>
          </div>
        </div>

        {/* Detailed Assessment Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Medical Explanation */}
          <div className="bg-white rounded-[24px] p-6 shadow-sm border border-gray-100 space-y-4">
            <h4 className="text-sm font-extrabold text-[#0f766e] uppercase tracking-widest flex items-center gap-2">
              <Sparkles size={18} /> Clinical Diagnostics
            </h4>
            <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-wrap">{result.explanation}</p>
          </div>

          {/* Warnings & Emergencies */}
          <div className="bg-white rounded-[24px] p-6 shadow-sm border border-gray-100 space-y-4">
            <h4 className="text-sm font-extrabold text-red-600 uppercase tracking-widest flex items-center gap-2">
              <ShieldAlert size={18} className="animate-pulse" /> Emergency Warnings
            </h4>
            <ul className="space-y-3">
              {(result.warningSigns || []).map((sign: string, idx: number) => (
                <li key={idx} className="flex gap-2.5 items-start text-xs font-semibold text-gray-700 leading-relaxed">
                  <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={16} />
                  <span>{sign}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Lifestyle recommendations */}
          <div className="bg-white rounded-[24px] p-6 shadow-sm border border-gray-100 space-y-4 md:col-span-2">
            <h4 className="text-sm font-extrabold text-teal-800 uppercase tracking-widest flex items-center gap-2">
              <CheckCircle2 size={18} className="text-teal-600" /> Cardiovascular Lifestyle & Diet Modifications
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(result.lifestyleTips || []).map((tip: string, idx: number) => (
                <div key={idx} className="flex gap-3 items-start p-3 bg-gray-50 rounded-xl">
                  <div className="w-5 h-5 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    {idx + 1}
                  </div>
                  <span className="text-xs text-gray-700 leading-relaxed">{tip}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Cardiology Center Recommendation */}
          <div className="bg-white rounded-[24px] p-6 shadow-sm border border-gray-100 space-y-3 md:col-span-2 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1 text-center sm:text-left">
              <h5 className="font-extrabold text-gray-900 text-sm">Recommended Specialized Care Facility:</h5>
              <p className="text-xs text-gray-500">{result.clinicRecommendation}</p>
            </div>
            <button
              onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(result.clinicRecommendation || 'KD Medical College Cardiology')}`, '_blank')}
              className="px-5 py-3 rounded-full bg-[#0f766e] text-white font-bold text-xs hover:bg-[#0d9488] transition-colors shrink-0"
            >
              Find Route on Map
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  // ── INPUT FORM ───────────────────────────────────────────────────────────
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full pb-8">
      
      {/* Steps indicators */}
      <nav className="mb-6 max-w-md mx-auto relative px-4">
        <div className="absolute top-1/2 left-0 right-0 h-[2px] bg-gray-200 -z-10 -translate-y-1/2" />
        <div className="flex justify-between">
          {[1, 2].map((s) => (
            <button
              key={s}
              onClick={() => { if (s < step) setStep(s); }}
              className={cn(
                "w-10 h-10 rounded-full font-bold text-sm flex items-center justify-center shadow-md border-2 transition-all",
                step === s ? "bg-[#0f766e] text-white border-[#0f766e] scale-105" :
                s < step ? "bg-teal-100 text-[#0f766e] border-[#0f766e]" :
                "bg-white text-gray-400 border-gray-200"
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex justify-between text-[11px] font-bold text-gray-400 mt-2 px-1">
          <span>1. Basic & Vitals</span>
          <span>2. Stress & Diagnostics</span>
        </div>
      </nav>

      <section className="bg-white rounded-[32px] p-5 sm:p-8 shadow-sm border border-gray-100 space-y-6">
        <div className="space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-black text-[#0f766e] flex items-center gap-2">
            <Heart className="text-red-500 fill-red-500 animate-pulse" size={28} />
            Cardio Risk Predictor
          </h1>
          <p className="text-gray-500 text-xs sm:text-sm">
            Trained on real patient records to analyze cardiac health risk probabilities.
          </p>
        </div>

        {error && (
          <div className="p-4 bg-red-50 text-red-700 rounded-xl flex items-center gap-2 text-xs font-semibold">
            <AlertCircle size={16} /> <span>{error}</span>
          </div>
        )}

        <AnimatePresence mode="wait">
          {step === 1 ? (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              className="space-y-5"
            >
              {/* Age & Sex Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700 block">Age (Years)</label>
                  <input
                    type="number"
                    value={age}
                    onChange={e => setAge(parseInt(e.target.value) || '')}
                    placeholder="e.g. 45"
                    className="w-full bg-gray-50 border border-gray-300 rounded-[14px] p-3 text-sm focus:ring-2 focus:ring-[#0f766e] transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700 block">Biological Sex</label>
                  <div className="flex gap-2">
                    {[
                      { label: 'Male', val: 1 },
                      { label: 'Female', val: 0 }
                    ].map(s => (
                      <button
                        key={s.val}
                        type="button"
                        onClick={() => setSex(s.val)}
                        className={cn(
                          "flex-1 py-3 text-xs font-bold rounded-[14px] border transition-all",
                          sex === s.val ? "bg-[#0f766e] text-white border-[#0f766e]" : "bg-gray-50 text-gray-700 border-gray-200"
                        )}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Chest Pain Type */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-700 block">Chest Pain Sensation (CP)</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Typical Angina', val: 0, desc: 'Crushing chest tightness' },
                    { label: 'Atypical Angina', val: 1, desc: 'Short chest discomfort' },
                    { label: 'Non-Anginal Pain', val: 2, desc: 'Sharp breath-related pain' },
                    { label: 'Asymptomatic', val: 3, desc: 'No chest pain felt' }
                  ].map(c => (
                    <button
                      key={c.val}
                      type="button"
                      onClick={() => setCp(c.val)}
                      className={cn(
                        "p-3 text-left rounded-[14px] border transition-all flex flex-col justify-between h-18",
                        cp === c.val ? "bg-teal-50 border-[#0f766e] ring-2 ring-[#0f766e]/10" : "bg-gray-50 border-gray-200"
                      )}
                    >
                      <span className="text-xs font-bold text-gray-900">{c.label}</span>
                      <span className="text-[10px] text-gray-400 leading-none">{c.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Vitals Input Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700 block flex items-center gap-1">
                    Resting BP (mm Hg)
                    <span className="text-gray-400 cursor-help" title="Blood pressure measured when resting. Normal is ~120."><Info size={12} /></span>
                  </label>
                  <input
                    type="number"
                    value={trestbps}
                    onChange={e => setTrestbps(parseInt(e.target.value) || '')}
                    className="w-full bg-gray-50 border border-gray-300 rounded-[14px] p-3 text-sm focus:ring-2 focus:ring-[#0f766e] transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700 block flex items-center gap-1">
                    Cholesterol (mg/dL)
                    <span className="text-gray-400 cursor-help" title="Serum cholesterol level. Normal is under 200."><Info size={12} /></span>
                  </label>
                  <input
                    type="number"
                    value={chol}
                    onChange={e => setChol(parseInt(e.target.value) || '')}
                    className="w-full bg-gray-50 border border-gray-300 rounded-[14px] p-3 text-sm focus:ring-2 focus:ring-[#0f766e] transition-all"
                  />
                </div>
              </div>

              {/* Fasting Blood Sugar */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700 block">Is Fasting Blood Sugar &gt; 120 mg/dL?</label>
                <div className="flex gap-4">
                  {[
                    { label: 'Yes (High)', val: 1 },
                    { label: 'No (Normal)', val: 0 }
                  ].map(sugar => (
                    <button
                      key={sugar.val}
                      type="button"
                      onClick={() => setFbs(sugar.val)}
                      className={cn(
                        "flex-1 py-3 text-xs font-bold rounded-[14px] border transition-all",
                        fbs === sugar.val ? "bg-[#0f766e] text-white border-[#0f766e]" : "bg-gray-50 text-gray-700 border-gray-200"
                      )}
                    >
                      {sugar.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    if (age && trestbps && chol) {
                      setStep(2);
                      setError(null);
                    } else {
                      setError('Please enter your age, resting blood pressure, and cholesterol.');
                    }
                  }}
                  className="px-6 py-3.5 bg-[#0f766e] hover:bg-[#0d9488] text-white text-xs font-bold rounded-full flex items-center gap-2 shadow-lg hover:shadow-teal-500/20 transition-all active:scale-95"
                >
                  Next Step <ChevronRight size={16} />
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              className="space-y-5"
            >
              {/* Cardiac stress test inputs */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700 block flex items-center gap-1">
                    Max Heart Rate (bpm)
                    <span className="text-gray-400 cursor-help" title="Highest heart rate achieved during exercise. Typical range 100-200."><Info size={12} /></span>
                  </label>
                  <input
                    type="number"
                    value={thalach}
                    onChange={e => setThalach(parseInt(e.target.value) || '')}
                    className="w-full bg-gray-50 border border-gray-300 rounded-[14px] p-3 text-sm focus:ring-2 focus:ring-[#0f766e] transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700 block">Exercise-Induced Angina</label>
                  <div className="flex gap-2">
                    {[
                      { label: 'Yes', val: 1 },
                      { label: 'No', val: 0 }
                    ].map(ang => (
                      <button
                        key={ang.val}
                        type="button"
                        onClick={() => setExang(ang.val)}
                        className={cn(
                          "flex-1 py-3 text-xs font-bold rounded-[14px] border transition-all",
                          exang === ang.val ? "bg-[#0f766e] text-white border-[#0f766e]" : "bg-gray-50 text-gray-700 border-gray-200"
                        )}
                      >
                        {ang.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Advanced toggle */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-1.5 text-xs font-bold text-[#0f766e] hover:underline"
                >
                  <Sliders size={14} />
                  {showAdvanced ? 'Hide Advanced Clinical Settings' : 'Configure Advanced Clinical Settings'}
                </button>
              </div>

              {showAdvanced ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="space-y-4 bg-gray-50/60 p-4 rounded-[20px] border border-gray-100"
                >
                  {/* Oldpeak ST Depression */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-gray-600 block">ST Depression (Oldpeak)</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="6"
                        value={oldpeak}
                        onChange={e => setOldpeak(parseFloat(e.target.value) || 0.0)}
                        className="w-full bg-white border border-gray-200 rounded-[10px] p-2 text-xs focus:ring-1 focus:ring-[#0f766e]"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-gray-600 block">ECG Pattern</label>
                      <select
                        value={restecg}
                        onChange={e => setRestecg(parseInt(e.target.value))}
                        className="w-full bg-white border border-gray-200 rounded-[10px] p-2 text-xs focus:ring-1 focus:ring-[#0f766e] focus:outline-none"
                      >
                        <option value={0}>Normal ECG</option>
                        <option value={1}>ST-T Wave Abnormality</option>
                        <option value={2}>Left Ventricular Hypertrophy</option>
                      </select>
                    </div>
                  </div>

                  {/* ST Slope & Vessels & Thal */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-600 block">ST Slope</label>
                      <select
                        value={slope}
                        onChange={e => setSlope(parseInt(e.target.value))}
                        className="w-full bg-white border border-gray-200 rounded-[8px] p-1.5 text-[11px] focus:outline-none"
                      >
                        <option value={0}>Upsloping</option>
                        <option value={1}>Flat</option>
                        <option value={2}>Downsloping</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-600 block">Vessels (0-3)</label>
                      <select
                        value={ca}
                        onChange={e => setCa(parseInt(e.target.value))}
                        className="w-full bg-white border border-gray-200 rounded-[8px] p-1.5 text-[11px] focus:outline-none"
                      >
                        <option value={0}>0 Vessels</option>
                        <option value={1}>1 Vessel</option>
                        <option value={2}>2 Vessels</option>
                        <option value={3}>3 Vessels</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-600 block">Thalassemia</label>
                      <select
                        value={thal}
                        onChange={e => setThal(parseInt(e.target.value))}
                        className="w-full bg-white border border-gray-200 rounded-[8px] p-1.5 text-[11px] focus:outline-none"
                      >
                        <option value={1}>Normal</option>
                        <option value={2}>Fixed Defect</option>
                        <option value={3}>Reversible</option>
                      </select>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div className="text-[11px] text-gray-400 italic">
                  Note: Default baseline values will be used for ECG, ST segment slope, colored vessels, and thalassemia metrics.
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-6 flex gap-4">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1 py-4 bg-gray-100 hover:bg-gray-200 text-gray-900 text-xs font-bold rounded-[16px] flex items-center justify-center gap-1"
                >
                  <ChevronLeft size={16} /> Back
                </button>

                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={loading}
                  className="flex-[2] py-4 bg-[#0f766e] hover:bg-[#0d9488] text-white text-xs font-bold rounded-[16px] flex items-center justify-center gap-2 shadow-lg hover:shadow-teal-500/20 transition-all disabled:opacity-50"
                >
                  {loading ? (
                    <Activity className="animate-spin" size={16} />
                  ) : (
                    <>
                      Run Heart Diagnostics <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </motion.div>
  );
}
