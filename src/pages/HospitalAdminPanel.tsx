import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { API_BASE_URL } from '../config';
import {
  Building2, Users, HeartPulse, Activity, CheckCircle, Plus, Trash2, ShieldAlert,
  Sliders, PlusCircle, Calendar, Phone, Briefcase, RefreshCw, Layers
} from 'lucide-react';

interface Doctor {
  _id: string;
  name: string;
  specialization: string;
  experience: number;
  phone: string;
  availability: string[];
}

interface Capacity {
  emergencyBedsTotal: number;
  emergencyBedsAvailable: number;
  icuBedsTotal: number;
  icuBedsAvailable: number;
  ventilatorsTotal: number;
  ventilatorsAvailable: number;
}

export default function HospitalAdminPanel({ user }: { user: any }) {
  const hospitalId = user?.hospitalId || (localStorage.getItem('helpaid_user') ? JSON.parse(localStorage.getItem('helpaid_user') || '{}').hospitalId : null);

  const [capacity, setCapacity] = useState<Capacity>({
    emergencyBedsTotal: 10,
    emergencyBedsAvailable: 5,
    icuBedsTotal: 5,
    icuBedsAvailable: 2,
    ventilatorsTotal: 3,
    ventilatorsAvailable: 1
  });

  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingCapacity, setUpdatingCapacity] = useState(false);
  const [capacityResult, setCapacityResult] = useState({ success: false, message: '' });

  // Doctor Form State
  const [docName, setDocName] = useState('');
  const [docSpec, setDocSpec] = useState('General Physician');
  const [docExp, setDocExp] = useState('');
  const [docPhone, setDocPhone] = useState('');
  const [addingDoctor, setAddingDoctor] = useState(false);
  const [doctorResult, setDoctorResult] = useState({ success: false, message: '' });

  useEffect(() => {
    fetchData();
  }, [hospitalId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('helpaid_token');
      
      // Fetch Capacity
      const capRes = await fetch(`${API_BASE_URL}/api/hospital/capacity?hospitalId=${hospitalId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const capData = await capRes.json();
      if (capData.success) {
        setCapacity(capData.capacity);
      }

      // Fetch Doctors
      const docRes = await fetch(`${API_BASE_URL}/api/hospital/doctors?hospitalId=${hospitalId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const docData = await docRes.json();
      if (docData.success) {
        setDoctors(docData.doctors);
      }
    } catch (err) {
      console.error('Error fetching admin panel data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateCapacity = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdatingCapacity(true);
    setCapacityResult({ success: false, message: '' });

    try {
      const token = localStorage.getItem('helpaid_token');
      const res = await fetch(`${API_BASE_URL}/api/hospital/capacity`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ hospitalId, ...capacity })
      });
      const data = await res.json();
      if (data.success) {
        setCapacityResult({ success: true, message: 'Capacity settings saved successfully!' });
      } else {
        setCapacityResult({ success: false, message: data.error || 'Failed to update capacity.' });
      }
    } catch (err) {
      setCapacityResult({ success: false, message: 'Network error updating capacity.' });
    } finally {
      setUpdatingCapacity(false);
    }
  };

  const handleAddDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docName || !docSpec) return;

    setAddingDoctor(true);
    setDoctorResult({ success: false, message: '' });

    try {
      const token = localStorage.getItem('helpaid_token');
      const res = await fetch(`${API_BASE_URL}/api/hospital/doctors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          hospitalId,
          name: docName,
          specialization: docSpec,
          experience: Number(docExp || 0),
          phone: docPhone,
          availability: ['Mon-Fri 9AM-5PM']
        })
      });
      const data = await res.json();
      if (data.success) {
        setDoctorResult({ success: true, message: 'Doctor successfully rostered!' });
        setDoctors(prev => [...prev, data.doctor]);
        setDocName('');
        setDocExp('');
        setDocPhone('');
      } else {
        setDoctorResult({ success: false, message: data.error || 'Failed to add doctor.' });
      }
    } catch (err) {
      setDoctorResult({ success: false, message: 'Network error adding doctor.' });
    } finally {
      setAddingDoctor(false);
    }
  };

  const handleRemoveDoctor = async (doctorId: string) => {
    if (!confirm('Are you sure you want to remove this doctor from the active roster?')) return;

    try {
      const token = localStorage.getItem('helpaid_token');
      const res = await fetch(`${API_BASE_URL}/api/hospital/doctors/${doctorId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setDoctors(prev => prev.filter(d => d._id !== doctorId));
      } else {
        alert(data.error || 'Failed to remove doctor.');
      }
    } catch (err) {
      console.error('Error removing doctor:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="animate-spin text-blue-600" size={32} />
          <p className="text-slate-500 font-bold text-sm">Loading Administration Settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex justify-between items-center bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-5 rounded-3xl shadow-sm backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold text-xs uppercase tracking-widest">
            <Building2 size={15} />
            <span>Facility Roster & Capacity Manager</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white leading-none mt-1">Hospital Admin Panel</h1>
          <p className="text-slate-500 text-xs mt-1 font-semibold">Managing Hospital ID: {hospitalId}</p>
        </div>
        <button
          onClick={fetchData}
          className="p-2.5 rounded-xl bg-slate-50 dark:bg-gray-800 hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition-all border border-slate-200/50 dark:border-slate-700/50"
          title="Refresh statistics"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Capacity Management Card */}
        <div className="lg:col-span-1 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-3xl p-6 shadow-sm space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <Sliders className="text-blue-600" size={20} />
            <h2 className="text-base font-black text-gray-900 dark:text-white">Bed & Ventilator Capacity</h2>
          </div>

          <form onSubmit={handleUpdateCapacity} className="space-y-4">
            {/* Bed parameters */}
            {[
              { key: 'emergencyBeds', label: 'Emergency Beds', color: 'text-red-500 bg-red-50 dark:bg-red-950/20' },
              { key: 'icuBeds', label: 'ICU Beds', color: 'text-orange-500 bg-orange-50 dark:bg-orange-950/20' },
              { key: 'ventilators', label: 'Ventilators', color: 'text-blue-500 bg-blue-50 dark:bg-blue-950/20' }
            ].map(item => {
              const totalKey = `${item.key}Total` as keyof Capacity;
              const availKey = `${item.key}Available` as keyof Capacity;

              return (
                <div key={item.key} className="space-y-2 p-3 bg-slate-50 dark:bg-gray-800/40 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-gray-750 dark:text-gray-300">{item.label}</span>
                    <span className="text-[10px] font-black uppercase text-slate-400">Ratios</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[9px] font-bold text-slate-450 dark:text-slate-550 block uppercase">Total</label>
                      <input
                        type="number"
                        min="0"
                        value={capacity[totalKey]}
                        onChange={e => setCapacity(prev => ({ ...prev, [totalKey]: Math.max(0, parseInt(e.target.value) || 0) }))}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-gray-950 text-xs font-bold dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-450 dark:text-slate-550 block uppercase">Available</label>
                      <input
                        type="number"
                        min="0"
                        max={capacity[totalKey]}
                        value={capacity[availKey]}
                        onChange={e => setCapacity(prev => ({ ...prev, [availKey]: Math.min(prev[totalKey], Math.max(0, parseInt(e.target.value) || 0)) }))}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-gray-950 text-xs font-bold dark:text-white"
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            {capacityResult.message && (
              <div className={`p-3 rounded-xl text-xs font-bold border ${
                capacityResult.success ? 'bg-green-50 text-green-700 border-green-100 dark:bg-green-950/20' : 'bg-red-50 text-red-700 border-red-100 dark:bg-red-950/20'
              }`}>
                {capacityResult.message}
              </div>
            )}

            <button
              type="submit"
              disabled={updatingCapacity}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-500/20 flex items-center justify-center gap-1.5 transition-all"
            >
              <HeartPulse size={14} />
              {updatingCapacity ? 'Saving settings...' : 'Update Facility Capacity'}
            </button>
          </form>
        </div>

        {/* Doctor Roster Card */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-3xl p-6 shadow-sm space-y-6">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <Users className="text-blue-600" size={20} />
            <h2 className="text-base font-black text-gray-900 dark:text-white">Active Specialist Doctor Roster ({doctors.length})</h2>
          </div>

          {/* Roster table list */}
          <div className="space-y-3">
            {doctors.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-slate-400">
                <Briefcase className="mx-auto mb-2 opacity-40 text-blue-500" size={28} />
                <p className="text-xs font-semibold">No doctors currently registered on active roster.</p>
                <p className="text-[10px] mt-0.5">Add specialists below to receive emergency specialization alerts.</p>
              </div>
            ) : (
              <div className="max-h-[220px] overflow-y-auto space-y-2 border border-slate-100 dark:border-slate-850 p-2 rounded-2xl bg-slate-50/50 dark:bg-gray-950/30">
                {doctors.map(doc => (
                  <div key={doc._id} className="flex justify-between items-center bg-white dark:bg-gray-900 p-3 rounded-xl border border-slate-150/50 dark:border-slate-800 shadow-2xs">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-xs">
                        Dr
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-slate-850 dark:text-white">{doc.name}</h4>
                        <div className="flex gap-2 text-[10px] text-slate-450 font-bold uppercase mt-0.5">
                          <span className="text-blue-600 dark:text-blue-400">{doc.specialization}</span>
                          <span>•</span>
                          <span>Exp: {doc.experience} yrs</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleRemoveDoctor(doc._id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all"
                      title="De-roster doctor"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add Doctor Form */}
          <div className="p-4 bg-slate-50 dark:bg-gray-800/40 rounded-2xl border border-slate-150/50 dark:border-slate-800">
            <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <PlusCircle className="text-blue-600" size={14} />
              Roster New Specialist Doctor
            </h3>

            <form onSubmit={handleAddDoctor} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[9px] font-bold text-slate-450 dark:text-slate-550 block uppercase mb-1">Doctor Name</label>
                <input
                  type="text"
                  required
                  placeholder="Dr. Sarah Connor"
                  value={docName}
                  onChange={e => setDocName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-gray-950 text-xs font-bold dark:text-white"
                />
              </div>

              <div>
                <label className="text-[9px] font-bold text-slate-450 dark:text-slate-550 block uppercase mb-1">Specialization</label>
                <select
                  value={docSpec}
                  onChange={e => setDocSpec(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-gray-950 text-xs font-bold dark:text-white focus:outline-none"
                >
                  <option value="Orthopedic">Orthopedic (Fractures/Bones)</option>
                  <option value="Dermatologist">Dermatologist (Burns/Skin)</option>
                  <option value="Cardiologist">Cardiologist (Cardiac/Heart)</option>
                  <option value="Neurologist">Neurologist (Brain/Stroke/Head)</option>
                  <option value="General Surgeon">General Surgeon (Severe Bleeding)</option>
                  <option value="General Physician">General Physician (Triage)</option>
                </select>
              </div>

              <div>
                <label className="text-[9px] font-bold text-slate-450 dark:text-slate-550 block uppercase mb-1">Experience (Years)</label>
                <input
                  type="number"
                  min="0"
                  placeholder="8"
                  value={docExp}
                  onChange={e => setDocExp(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-gray-950 text-xs font-bold dark:text-white"
                />
              </div>

              <div>
                <label className="text-[9px] font-bold text-slate-450 dark:text-slate-550 block uppercase mb-1">Roster Phone</label>
                <input
                  type="tel"
                  placeholder="+1 (555) 019-2831"
                  value={docPhone}
                  onChange={e => setDocPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-gray-950 text-xs font-bold dark:text-white"
                />
              </div>

              {doctorResult.message && (
                <div className={`sm:col-span-2 p-2.5 rounded-xl text-[10px] font-bold border ${
                  doctorResult.success ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-700 border-red-100'
                }`}>
                  {doctorResult.message}
                </div>
              )}

              <div className="sm:col-span-2 flex justify-end">
                <button
                  type="submit"
                  disabled={addingDoctor}
                  className="px-5 py-2 bg-[#1D58D8] text-white text-xs font-bold rounded-xl hover:bg-blue-600 transition-all flex items-center gap-1.5 shadow-md shadow-blue-500/10"
                >
                  <Plus size={14} />
                  {addingDoctor ? 'Adding...' : 'Add Specialist Doctor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
