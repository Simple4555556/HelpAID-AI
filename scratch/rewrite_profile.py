import re

def rewrite():
    with open('e:/emg/src/pages/Profile.tsx', 'r', encoding='utf-8') as f:
        content = f.read()

    # Find where the return statement starts
    match = re.search(r'^\s*return\s*\(\s*<div className="vault-gradient', content, re.MULTILINE)
    if not match:
        print("Could not find the return statement.")
        return

    top_half = content[:match.start()]

    new_jsx = """  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-12 font-sans">
      <style>{`
        @media print {
          body { background: white !important; color: black !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* ── HEADER NAVIGATION ── */}
      <div className="no-print sticky top-0 z-40 bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-100 text-blue-600 rounded-lg">
            <Activity size={18} className="animate-pulse" />
          </div>
          <span className="text-sm font-bold text-slate-800">Medical Vault</span>
        </div>
        <div className="flex gap-2">
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-all"
            >
              <Download size={14} /> Export
            </button>
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-blue-600 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-all"
            >
              <Settings size={14} /> {isEditing ? 'Done' : 'Edit'}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-all shadow-sm"
            >
              {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />} Save
            </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 mt-6 space-y-6">
        
        {/* ── 1. PROFILE CARD ── */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col sm:flex-row gap-5 items-start sm:items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center text-2xl font-black shadow-sm border border-blue-100">
              {activeData.fullName ? activeData.fullName.split(' ').map((n: string) => n[0]).join('').substring(0,2) : 'U'}
            </div>
            <div>
              {isEditing ? (
                <input
                  type="text"
                  value={activeData.fullName}
                  onChange={(e) => updateActiveProfile({ fullName: e.target.value })}
                  className="font-bold text-xl text-slate-900 border-b border-slate-200 focus:outline-none focus:border-blue-500 bg-transparent px-1 mb-1"
                  placeholder="Full Name"
                />
              ) : (
                <h1 className="text-xl font-black text-slate-900">{activeData.fullName || 'Unknown Patient'}</h1>
              )}
              
              <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-slate-600">
                {isEditing ? (
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={activeData.age}
                      onChange={(e) => updateActiveProfile({ age: e.target.value ? parseInt(e.target.value) : '' })}
                      className="border border-slate-200 px-2 py-0.5 rounded text-xs w-16"
                      placeholder="Age"
                    />
                    <select
                      value={activeData.gender}
                      onChange={(e) => updateActiveProfile({ gender: e.target.value })}
                      className="border border-slate-200 px-2 py-0.5 rounded text-xs"
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                ) : (
                  <span>{activeData.age || 'N/A'} Yrs • {activeData.gender || 'N/A'}</span>
                )}
                <span className="text-slate-300">•</span>
                <span className="flex items-center gap-1"><Phone size={12}/> {activeData.mobileNumber || profile.mobileNumber || 'N/A'}</span>
              </div>
            </div>
          </div>
          
          <div className="flex gap-4 items-center">
            <div className="text-center">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-0.5">Blood Type</span>
              {isEditing ? (
                <select
                  value={activeData.bloodGroup}
                  onChange={(e) => updateActiveProfile({ bloodGroup: e.target.value })}
                  className="font-black text-red-600 border-b border-slate-200 focus:outline-none"
                >
                  {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(bg => (
                    <option key={bg} value={bg}>{bg}</option>
                  ))}
                </select>
              ) : (
                <span className="font-black text-red-600 text-lg">{activeData.bloodGroup || 'N/A'}</span>
              )}
            </div>
          </div>
        </div>

        {/* ── 2. HEALTH SUMMARY CARDS ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center">
            <div className="w-10 h-10 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-2">
              <Droplets size={20} />
            </div>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Blood Group</span>
            <span className="font-black text-slate-900 mt-1">{activeData.bloodGroup || 'N/A'}</span>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center">
            <div className="w-10 h-10 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mb-2">
              <AlertCircle size={20} />
            </div>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Allergies</span>
            <span className="font-black text-slate-900 mt-1">{activeData.allergies?.length || 0} Listed</span>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center">
            <div className="w-10 h-10 bg-purple-50 text-purple-500 rounded-full flex items-center justify-center mb-2">
              <Thermometer size={20} />
            </div>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Conditions</span>
            <span className="font-black text-slate-900 mt-1">{(activeData.diseases?.length || 0) + (activeData.chronicConditions?.length || 0)} Active</span>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center">
            <div className="w-10 h-10 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-2">
              <Pill size={20} />
            </div>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Medicines</span>
            <span className="font-black text-slate-900 mt-1">{activeData.medications?.length || 0} Current</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* ── 3. MEDICAL HISTORY ── */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 space-y-4">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2">
              <Activity size={16} className="text-blue-500" /> Medical History
            </h3>
            
            <div className="space-y-4">
              <div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Diseases & Conditions</span>
                <ul className="list-disc list-inside text-sm text-slate-700 space-y-1">
                  {[...(activeData.diseases || []), ...(activeData.chronicConditions || [])].map((item: string, i: number) => (
                    <li key={i}>{item}</li>
                  ))}
                  {(!activeData.diseases?.length && !activeData.chronicConditions?.length) && <li className="text-slate-400 italic list-none">None reported</li>}
                </ul>
              </div>
              <div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Previous Injuries / Surgeries</span>
                <ul className="list-disc list-inside text-sm text-slate-700 space-y-1">
                  {activeData.previousInjuries?.map((item: string, i: number) => (
                    <li key={i}>{item}</li>
                  ))}
                  {!activeData.previousInjuries?.length && <li className="text-slate-400 italic list-none">None reported</li>}
                </ul>
              </div>
            </div>
          </div>

          {/* ── 4. EMERGENCY INFORMATION ── */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-red-100 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              <AlertOctagon size={100} className="text-red-500" />
            </div>
            <h3 className="font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2 relative z-10">
              <AlertCircle size={16} className="text-red-500" /> Emergency Information
            </h3>
            
            <div className="space-y-3 mt-4 relative z-10">
              <div className="flex justify-between items-center bg-red-50 rounded-lg p-3 border border-red-100">
                <div>
                  <span className="text-[10px] text-red-500 font-bold uppercase tracking-wider block">Emergency Contact</span>
                  <span className="font-bold text-slate-800 text-sm">
                    {activeData.emergencyContacts?.[0] ? `${activeData.emergencyContacts[0].name} (${activeData.emergencyContacts[0].mobileNumber})` : 'Not Set'}
                  </span>
                </div>
                <Phone size={16} className="text-red-400" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Blood Group</span>
                  <span className="font-bold text-red-600 text-sm">{activeData.bloodGroup || 'N/A'}</span>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Critical Allergies</span>
                  <span className="font-bold text-amber-600 text-sm truncate block">
                    {activeData.allergies?.length > 0 ? activeData.allergies[0] : 'None'}
                    {activeData.allergies?.length > 1 && ' +more'}
                  </span>
                </div>
              </div>
              
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Current Medications</span>
                  <span className="font-bold text-blue-600 text-sm block truncate">
                    {activeData.medications?.length > 0 ? activeData.medications.join(', ') : 'None'}
                  </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── 5. DOCUMENTS ── */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 space-y-4">
          <h3 className="font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2">
            <FileText size={16} className="text-blue-500" /> Medical Documents
          </h3>
          
          <div className="flex gap-4 items-center">
            <label className="cursor-pointer flex flex-col items-center justify-center w-32 h-32 border-2 border-dashed border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-all rounded-xl text-slate-500">
              <Upload size={24} className="mb-2 text-blue-500" />
              <span className="text-xs font-semibold">Upload File</span>
              <input
                id="vault-file-input"
                type="file"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    uploadDocumentFile(e.target.files[0]);
                  }
                }}
              />
            </label>
            
            <div className="flex-1 space-y-2">
              <p className="text-xs text-slate-500">Supported formats: Prescription, Blood Reports, X-Ray, MRI, CT Scan.</p>
              {activeProfileId === 'self' && documents.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {documents.slice(0,4).map((doc) => (
                    <div key={doc._id} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-2 max-w-[200px]">
                      <FileText size={14} className="text-blue-500 shrink-0" />
                      <span className="text-xs font-semibold text-slate-700 truncate">{doc.fileName}</span>
                      <button onClick={() => window.open(doc.fileUrl, '_blank')} className="text-slate-400 hover:text-blue-600"><Download size={12}/></button>
                    </div>
                  ))}
                  {documents.length > 4 && <span className="text-xs text-blue-600 font-semibold flex items-center">+{documents.length - 4} more</span>}
                </div>
              ) : (
                <p className="text-sm font-semibold text-slate-400 italic">No documents uploaded.</p>
              )}
            </div>
          </div>
        </div>

        {/* ── 6. TIMELINE ── */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 space-y-4">
          <h3 className="font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2">
            <Clock size={16} className="text-blue-500" /> Recent Activities
          </h3>
          
          {activeProfileId === 'self' && timeline.length > 0 ? (
            <div className="space-y-4 pl-2">
              {timeline.slice(0, 5).map((event, idx) => (
                <div key={idx} className="flex gap-4 relative">
                  <div className="w-px h-full bg-slate-200 absolute left-2 top-6"></div>
                  <div className={`w-4 h-4 rounded-full mt-1 shrink-0 z-10 ${
                    event.eventType === 'INJURY' ? 'bg-red-500' : 
                    event.eventType === 'SYMPTOM' ? 'bg-amber-500' : 'bg-blue-500'
                  }`} />
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">{event.eventTitle}</h4>
                    <span className="text-xs text-slate-500">{new Date(event.eventDate).toLocaleDateString()} • {event.eventType}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm font-semibold text-slate-400 italic">No recent AI symptom checks or scans.</p>
          )}
        </div>
      </div>

      {/* ── NOTIFICATION ── */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            className="fixed bottom-6 right-6 z-50 px-4 py-3 bg-slate-800 text-white rounded-lg shadow-xl text-sm font-semibold flex items-center gap-3"
          >
            <Info size={16} className="text-blue-400" />
            <span>{notification}</span>
            <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-white"><X size={14} /></button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
"""

    with open('e:/emg/src/pages/Profile.tsx', 'w', encoding='utf-8') as f:
        f.write(top_half + new_jsx)
    
    print("Rewritten Profile.tsx successfully.")

if __name__ == "__main__":
    rewrite()
