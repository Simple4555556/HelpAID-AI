import React from 'react';
import { motion } from 'motion/react';
import {
  Brain, Star, Building2, UserCheck, MapPin, Clock, Activity,
  CheckCircle2, ShieldAlert, Sparkles, Phone, AlertTriangle, ShieldCheck
} from 'lucide-react';

export interface DoctorRecommendation {
  id: string;
  name: string;
  specialization: string;
  hospital: string;
  distanceKm: number;
  eta: string;
  availability: string;
  open24x7: boolean;
  isOnline: boolean;
  phone?: string;
}

export interface HospitalRecommendation {
  id: string;
  name: string;
  department: string;
  distanceKm: number;
  eta: string;
  emergencyAvailable: boolean;
  icuAvailable: boolean;
  specialUnit?: string;
  rating?: number;
  phone?: string;
}

interface AIRecommendationsSectionProps {
  aiDiagnosis: {
    injuryType: string;
    severity: string;
    requiredSpecializations?: string[];
  };
  recommendedSpecialists: DoctorRecommendation[];
  recommendedHospitals: HospitalRecommendation[];
  nearbyDoctors: DoctorRecommendation[];
  nearbyHospitals: HospitalRecommendation[];
  onTriggerParallelSOS?: () => void;
  isDispatching?: boolean;
}

export default function AIRecommendationsSection({
  aiDiagnosis,
  recommendedSpecialists,
  recommendedHospitals,
  nearbyDoctors,
  nearbyHospitals,
  onTriggerParallelSOS,
  isDispatching = false
}: AIRecommendationsSectionProps) {
  const getSeverityBadgeClass = (sev: string) => {
    const upper = (sev || '').toUpperCase();
    if (upper === 'CRITICAL') return 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400 border-red-200';
    if (upper === 'HIGH') return 'bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 border-orange-200';
    if (upper === 'MEDIUM' || upper === 'MODERATE') return 'bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-400 border-yellow-200';
    return 'bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400 border-green-200';
  };

  return (
    <div className="space-y-6 my-6">

      {/* STEP 1: AI DIAGNOSIS BANNER */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-red-600 via-rose-600 to-indigo-700 text-white rounded-[24px] p-5 shadow-lg relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-red-100">
              <Brain size={18} className="animate-pulse text-yellow-300" />
              <span>AI Diagnosis</span>
            </div>
            <h3 className="text-xl font-black tracking-tight capitalize">
              {aiDiagnosis.injuryType}
            </h3>
            <p className="text-xs text-red-100 font-medium">
              Severity: <span className="font-bold underline">{aiDiagnosis.severity}</span>
            </p>
          </div>

          <span className={`px-3 py-1 rounded-full text-xs font-black border uppercase tracking-wider shadow-sm ${getSeverityBadgeClass(aiDiagnosis.severity)}`}>
            {aiDiagnosis.severity} Severity
          </span>
        </div>

        {aiDiagnosis.requiredSpecializations && aiDiagnosis.requiredSpecializations.length > 0 && (
          <div className="mt-4 pt-3 border-t border-white/20 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-red-100 uppercase tracking-wider">Required Specializations:</span>
            {aiDiagnosis.requiredSpecializations.map((spec, i) => (
              <span key={i} className="bg-white/20 backdrop-blur-xs text-white text-[11px] font-extrabold px-2.5 py-0.5 rounded-full">
                {spec}
              </span>
            ))}
          </div>
        )}
      </motion.div>

      {/* STEP 2: AI RECOMMENDED SPECIALISTS */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h4 className="text-base font-black text-gray-900 dark:text-white flex items-center gap-2">
            <Star size={18} className="text-amber-500 fill-amber-500" />
            <span>⭐ Recommended Specialists</span>
          </h4>
          <span className="text-xs font-extrabold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2.5 py-1 rounded-full border border-blue-100 dark:border-blue-900/30">
            Parallel Priority SOS Active
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {recommendedSpecialists.map((doc, idx) => (
            <motion.div
              key={doc.id || idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="bg-white dark:bg-gray-900 rounded-[20px] p-4 border border-amber-200 dark:border-amber-900/40 shadow-sm hover:shadow-md transition-all relative overflow-hidden group"
            >
              <div className="flex justify-between items-start gap-3">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[11px] font-black flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <h5 className="font-extrabold text-gray-900 dark:text-white text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {doc.name}
                    </h5>
                  </div>

                  <p className="text-xs font-bold text-amber-700 dark:text-amber-400 pl-7">
                    {doc.specialization}
                  </p>

                  <p className="text-xs text-gray-500 dark:text-gray-400 pl-7 flex items-center gap-1.5">
                    <Building2 size={12} className="shrink-0 text-gray-400" />
                    <span>{doc.hospital}</span>
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-xs font-black text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 px-2.5 py-1 rounded-lg inline-block">
                    {doc.distanceKm.toFixed(1)} km
                  </span>
                  <p className="text-[11px] font-semibold text-gray-400 mt-1">
                    ETA: {doc.eta}
                  </p>
                </div>
              </div>

              {/* Status Badges Row */}
              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-md font-extrabold ${
                    doc.availability.toLowerCase().includes('available') ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                  }`}>
                    • {doc.availability}
                  </span>

                  {doc.open24x7 && (
                    <span className="bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-400 font-bold px-2 py-0.5 rounded-md">
                      24×7 Emergency
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 font-bold">
                  <span className={`w-2 h-2 rounded-full ${doc.isOnline ? 'bg-emerald-500 animate-ping' : 'bg-gray-400'}`} />
                  <span className={doc.isOnline ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}>
                    {doc.isOnline ? 'Online' : 'On Call'}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* PARALLEL SOS BROADCAST BANNER / ACTION */}
      {onTriggerParallelSOS && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-[20px] p-4 text-amber-900 dark:text-amber-200 space-y-3"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0">
              <ShieldAlert size={20} />
            </div>
            <div>
              <h5 className="font-extrabold text-sm">Parallel SOS Routing Ready</h5>
              <p className="text-xs text-amber-700 dark:text-amber-300">
                SOS will be dispatched simultaneously to all recommended specialists and hospitals above. The first doctor to accept takes assignment.
              </p>
            </div>
          </div>

          <button
            onClick={onTriggerParallelSOS}
            disabled={isDispatching}
            className="w-full py-3.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-red-500/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          >
            {isDispatching ? (
              <>
                <Activity size={16} className="animate-spin" />
                <span>Broadcasting Priority SOS...</span>
              </>
            ) : (
              <>
                <ShieldAlert size={16} />
                <span>Send Priority SOS to All Specialists & Hospitals</span>
              </>
            )}
          </button>
        </motion.div>
      )}

      {/* STEP 3: AI RECOMMENDED HOSPITALS */}
      <div className="space-y-3">
        <h4 className="text-base font-black text-gray-900 dark:text-white flex items-center gap-2 px-1">
          <Building2 size={18} className="text-red-600" />
          <span>🏥 Recommended Hospitals</span>
        </h4>

        <div className="grid grid-cols-1 gap-3">
          {recommendedHospitals.map((hosp, idx) => (
            <motion.div
              key={hosp.id || idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="bg-white dark:bg-gray-900 rounded-[20px] p-4 border border-red-100 dark:border-red-900/30 shadow-sm hover:shadow-md transition-all space-y-3"
            >
              <div className="flex justify-between items-start gap-3">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-red-600 text-white text-[11px] font-black flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <h5 className="font-extrabold text-gray-900 dark:text-white text-sm">
                      {hosp.name}
                    </h5>
                  </div>
                  <p className="text-xs font-bold text-red-600 dark:text-red-400 pl-7">
                    {hosp.department}
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-xs font-black text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-2.5 py-1 rounded-lg inline-block">
                    {hosp.distanceKm.toFixed(1)} km
                  </span>
                  <p className="text-[11px] font-semibold text-gray-400 mt-1">
                    ETA: {hosp.eta}
                  </p>
                </div>
              </div>

              {/* Hospital Specs Row */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100 dark:border-gray-800 text-[11px]">
                <div className="flex flex-wrap gap-1.5">
                  <span className="bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 font-bold px-2 py-0.5 rounded-md">
                    ✓ Emergency Available
                  </span>
                  {hosp.icuAvailable && (
                    <span className="bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 font-bold px-2 py-0.5 rounded-md">
                      ICU Unit Ready
                    </span>
                  )}
                  {hosp.specialUnit && (
                    <span className="bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-400 font-bold px-2 py-0.5 rounded-md">
                      {hosp.specialUnit}
                    </span>
                  )}
                </div>

                {hosp.rating && (
                  <span className="font-extrabold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <Star size={12} className="fill-amber-500 text-amber-500" /> {hosp.rating.toFixed(1)}
                  </span>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* STEP 7: KEEP EXISTING LISTS (Nearby Doctors Top 5 & Nearby Hospitals Top 5) */}
      <div className="pt-4 border-t border-gray-200 dark:border-gray-800 space-y-6">

        {/* 📍 Nearby Doctors (Top 5 - Sorted only by distance) */}
        <div className="space-y-3">
          <h4 className="text-sm font-black text-gray-800 dark:text-gray-200 flex items-center gap-2 px-1">
            <MapPin size={16} className="text-teal-600" />
            <span>📍 Nearby Doctors (Top 5 by distance)</span>
          </h4>

          <div className="space-y-2">
            {nearbyDoctors.slice(0, 5).map((doc, idx) => (
              <div key={doc.id || idx} className="bg-gray-50 dark:bg-gray-800/40 rounded-xl p-3 border border-gray-100 dark:border-gray-800 flex justify-between items-center text-xs">
                <div>
                  <h6 className="font-extrabold text-gray-900 dark:text-white">{doc.name}</h6>
                  <p className="text-[11px] text-gray-500">{doc.specialization} · {doc.hospital}</p>
                </div>
                <span className="font-extrabold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/30 px-2 py-1 rounded-md">
                  {doc.distanceKm.toFixed(1)} km
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 🏥 Nearby Hospitals (Top 5 - Sorted only by distance) */}
        <div className="space-y-3">
          <h4 className="text-sm font-black text-gray-800 dark:text-gray-200 flex items-center gap-2 px-1">
            <Building2 size={16} className="text-blue-600" />
            <span>🏥 Nearby Hospitals (Top 5 by distance)</span>
          </h4>

          <div className="space-y-2">
            {nearbyHospitals.slice(0, 5).map((hosp, idx) => (
              <div key={hosp.id || idx} className="bg-gray-50 dark:bg-gray-800/40 rounded-xl p-3 border border-gray-100 dark:border-gray-800 flex justify-between items-center text-xs">
                <div>
                  <h6 className="font-extrabold text-gray-900 dark:text-white">{hosp.name}</h6>
                  <p className="text-[11px] text-gray-500">{hosp.department}</p>
                </div>
                <span className="font-extrabold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 px-2 py-1 rounded-md">
                  {hosp.distanceKm.toFixed(1)} km
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>

    </div>
  );
}
