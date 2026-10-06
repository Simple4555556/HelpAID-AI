import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { User } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import {
  User as UserIcon, Phone, Heart, Plus, Save, Info, X,
  Activity, Shield, MessageSquare, FileText, Calendar,
  AlertCircle, Thermometer, Droplets, Clock, MapPin,
  Trash2, Download, QrCode, BookOpen, AlertTriangle,
  Stethoscope, Sparkles, Loader2, Pill, Upload, UserPlus,
  Printer, Share2, Lock, CheckCircle, Settings, AlertOctagon
} from 'lucide-react';
import { cn } from '../lib/utils';
import { getReports } from '../lib/gemini';
import { API_BASE_URL } from '../config';

interface TimelineEvent {
  eventType: 'INJURY' | 'CHAT' | 'SYMPTOM' | 'CONSULTATION';
  eventTitle: string;
  eventDate: string;
  referenceId: string;
}

interface FamilyMember {
  name: string;
  relation: string;
  profileId: string;
}

export default function Profile({ user }: { user: User | null }) {
  // Navigation active section tracking
  const [activeSection, setActiveSection] = useState('overview');

  // Main profile state
  const [profile, setProfile] = useState<any>({
    publicId: '',
    fullName: '',
    displayName: '',
    age: '',
    gender: 'Male',
    mobileNumber: '',
    email: '',
    bloodGroup: 'O+',
    profilePhoto: '',
    allergies: [],
    diseases: [],
    chronicConditions: [],
    previousInjuries: [],
    medications: [],
    medicalNotes: '',
    emergencyContacts: [],
    height: '',
    weight: '',
    organDonor: '',
    insuranceStatus: '',
    familyMembers: []
  });

  // Timeline & general metrics
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [healthScore, setHealthScore] = useState({ score: 95, rating: 'Excellent Health Index' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Edit Mode state
  const [isEditing, setIsEditing] = useState(false);

  // Family profile vault switching states
  const [activeProfileId, setActiveProfileId] = useState<string>('self');
  const [familyProfiles, setFamilyProfiles] = useState<Record<string, any>>({});
  const [showFamilyModal, setShowFamilyModal] = useState(false);
  const [newFamilyMember, setNewFamilyMember] = useState({
    name: '',
    relation: 'Spouse',
    age: '',
    gender: 'Male',
    bloodGroup: 'O+',
    height: '',
    weight: '',
    organDonor: '',
    insuranceStatus: ''
  });

  // Inputs for adding medical details
  const [allergyType, setAllergyType] = useState<'medicine' | 'food' | 'environmental'>('medicine');
  const [allergyInput, setAllergyInput] = useState('');
  const [diseaseInput, setDiseaseInput] = useState('');
  const [medicationForm, setMedicationForm] = useState({ name: '', dosage: '', frequency: '' });

  // Emergency contact inputs
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactRelation, setContactRelation] = useState('');

  // Documents state
  const [documents, setDocuments] = useState<any[]>([]);
  const [docUploading, setDocUploading] = useState(false);
  const [documentName, setDocumentName] = useState('');
  const [documentType, setDocumentType] = useState('Prescription');
  const [dragActive, setDragActive] = useState(false);

  // QR rendering states
  const [qrError, setQrError] = useState(false);

  // Fetch initial profile & clinical data
  useEffect(() => {
    fetchUserData();
  }, [user]);

  // Load family member profiles from localstorage
  useEffect(() => {
    if (user) {
      const stored = localStorage.getItem(`helpaid_family_vault_${user.uid}`);
      if (stored) {
        try {
          setFamilyProfiles(JSON.parse(stored));
        } catch (e) {
          console.error('Failed to parse family profiles:', e);
        }
      }
    }
  }, [user]);

  const fetchUserData = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Fetch primary profile
      const res = await fetch(`${API_BASE_URL}/api/profile?userId=${user.uid}`);
      if (res.ok) {
        const profileData = await res.json();
        setProfile((prev: any) => ({
          ...prev,
          ...profileData,
          displayName: profileData.displayName || user.displayName || 'HelpAid User',
          fullName: profileData.fullName || profileData.displayName || user.displayName || '',
          email: profileData.email || user.email || '',
          allergies: profileData.allergies || [],
          diseases: profileData.diseases || [],
          chronicConditions: profileData.chronicConditions || [],
          previousInjuries: profileData.previousInjuries || [],
          medications: profileData.medications || [],
          emergencyContacts: profileData.emergencyContacts || [],
          familyMembers: profileData.familyMembers || []
        }));
      }

      // Fetch timeline logs
      const timelineRes = await fetch(`${API_BASE_URL}/api/timeline?userId=${user.uid}`);
      if (timelineRes.ok) {
        const timelineData = await timelineRes.json();
        setTimeline(timelineData);
      }

      // Fetch contacts
      try {
        const contactsRes = await fetch(`${API_BASE_URL}/api/medical-vault/contacts?userId=${user.uid}`);
        if (contactsRes.ok) {
          const contactsData = await contactsRes.json();
          setProfile((prev: any) => ({
            ...prev,
            emergencyContacts: contactsData
          }));
        }
      } catch (e) { console.warn('Contacts fetch skipped:', e); }

      // Fetch documents
      try {
        const docsRes = await fetch(`${API_BASE_URL}/api/medical-vault/documents?userId=${user.uid}`);
        if (docsRes.ok) {
          const docsData = await docsRes.json();
          setDocuments(docsData);
        }
      } catch (e) { console.warn('Documents fetch skipped:', e); }

      // Compute health score
      const reports = await getReports(user.uid);
      if (reports && reports.length > 0) {
        const score = Math.max(45, 98 - reports.length * 6);
        const rating = score > 85 ? 'Excellent Health Index' : score > 65 ? 'Stable Profile' : 'Requires Medical Review';
        setHealthScore({ score, rating });
      }
    } catch (err) {
      console.error('Error fetching user data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Switch context helper
  const getActiveProfile = () => {
    if (activeProfileId === 'self') {
      return profile;
    }
    return familyProfiles[activeProfileId] || {
      fullName: 'Family Member',
      age: '',
      gender: 'Male',
      bloodGroup: 'O+',
      height: '',
      weight: '',
      organDonor: '',
      insuranceStatus: '',
      allergies: [],
      diseases: [],
      chronicConditions: [],
      previousInjuries: [],
      medications: [],
      medicalNotes: '',
      emergencyContacts: []
    };
  };

  const updateActiveProfile = (updatedData: any) => {
    if (activeProfileId === 'self') {
      setProfile(updatedData);
    } else {
      const updatedVault = {
        ...familyProfiles,
        [activeProfileId]: {
          ...familyProfiles[activeProfileId],
          ...updatedData
        }
      };
      setFamilyProfiles(updatedVault);
      if (user) {
        localStorage.setItem(`helpaid_family_vault_${user.uid}`, JSON.stringify(updatedVault));
      }
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      // Prepare save data. If active member, save their details in familyMembers list
      let savePayload = { ...profile };
      if (activeProfileId !== 'self') {
        // We'll also make sure the changes of the active member are saved in localStorage
        const updatedVault = {
          ...familyProfiles,
          [activeProfileId]: {
            ...familyProfiles[activeProfileId],
            ...getActiveProfile()
          }
        };
        setFamilyProfiles(updatedVault);
        localStorage.setItem(`helpaid_family_vault_${user.uid}`, JSON.stringify(updatedVault));
      }

      // Sync the basic family members array details to DB
      const response = await fetch(`${API_BASE_URL}/api/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          profileData: savePayload
        })
      });

      if (response.ok) {
        setNotification('Electronic Health Records synchronized successfully.');
        setIsEditing(false);
        fetchUserData();
      } else {
        throw new Error();
      }
    } catch {
      setNotification('Failed to synchronize EHR records with network.');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    if (!user) return;
    setExporting(true);
    try {
      const reports = await getReports(user.uid);
      const activeData = getActiveProfile();
      const data = {
        exportedProfile: activeProfileId === 'self' ? 'Primary Account Holder' : `${activeData.relation} (${activeData.fullName})`,
        helpAidId: profile.publicId,
        vitals: {
          fullName: activeData.fullName,
          age: activeData.age,
          gender: activeData.gender,
          bloodGroup: activeData.bloodGroup,
          height: activeData.height,
          weight: activeData.weight,
          organDonor: activeData.organDonor,
          insuranceStatus: activeData.insuranceStatus
        },
        allergies: activeData.allergies || [],
        diseases: activeData.diseases || [],
        chronicConditions: activeData.chronicConditions || [],
        medications: activeData.medications || [],
        timeline: activeProfileId === 'self' ? timeline : [],
        reports: activeProfileId === 'self' ? reports : [],
        exportedAt: new Date().toISOString()
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `HelpAid_EHR_${activeData.fullName.replace(/\s+/g, '_')}_${profile.publicId || 'passport'}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setNotification('Clinical record JSON downloaded successfully.');
    } catch {
      setNotification('Failed to export medical record.');
    } finally {
      setExporting(false);
    }
  };

  // Add list item to active profile
  const addMedicalItem = (field: 'allergies' | 'diseases' | 'chronicConditions' | 'previousInjuries' | 'medications', value: string, clearCallback: () => void) => {
    if (!value.trim()) return;
    const current = getActiveProfile();
    const currentList = current[field] || [];
    if (currentList.includes(value.trim())) return;

    const updated = {
      ...current,
      [field]: [...currentList, value.trim()]
    };
    updateActiveProfile(updated);
    clearCallback();
  };

  // Remove list item from active profile
  const removeMedicalItem = (field: 'allergies' | 'diseases' | 'chronicConditions' | 'previousInjuries' | 'medications', index: number) => {
    const current = getActiveProfile();
    const currentList = [...(current[field] || [])];
    currentList.splice(index, 1);

    const updated = {
      ...current,
      [field]: currentList
    };
    updateActiveProfile(updated);
  };

  // Add emergency contact
  const addContact = async () => {
    if (!contactName.trim() || !contactPhone.trim() || !user) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/medical-vault/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          contactData: {
            name: contactName.trim(),
            mobileNumber: contactPhone.trim(),
            relation: contactRelation.trim() || 'Emergency Contact'
          }
        })
      });
      if (res.ok) {
        setContactName('');
        setContactPhone('');
        setContactRelation('');
        setNotification('Emergency contact saved.');
        fetchUserData();
      } else {
        const data = await res.json();
        setNotification(data.error || 'Failed to save emergency contact.');
      }
    } catch {
      // Fallback local edit
      const current = getActiveProfile();
      const currentContacts = current.emergencyContacts || [];
      const updated = {
        ...current,
        emergencyContacts: [...currentContacts, { name: contactName.trim(), mobileNumber: contactPhone.trim(), relation: contactRelation.trim() || 'Emergency Contact' }]
      };
      updateActiveProfile(updated);
      setContactName('');
      setContactPhone('');
      setContactRelation('');
      setNotification('Emergency contact saved locally.');
    }
  };

  const deleteContact = async (index: number) => {
    const current = getActiveProfile();
    const contacts = [...(current.emergencyContacts || [])];
    const contact = contacts[index];
    if (!user) return;
    try {
      const contactId = contact._id || contact.id || index.toString();
      await fetch(`${API_BASE_URL}/api/medical-vault/contacts/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid, contactId })
      });
      setNotification('Contact removed.');
      fetchUserData();
    } catch {
      contacts.splice(index, 1);
      const updated = {
        ...current,
        emergencyContacts: contacts
      };
      updateActiveProfile(updated);
      setNotification('Contact removed locally.');
    }
  };

  // Documents Upload & Drag/Drop
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      uploadDocumentFile(file);
    }
  };

  const handleDocSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !documentName.trim()) return;
    const fileInput = document.getElementById('vault-file-input') as HTMLInputElement;
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      setNotification('Please select a file to upload.');
      return;
    }
    uploadDocumentFile(fileInput.files[0]);
  };

  const uploadDocumentFile = (file: File) => {
    if (!user) return;
    setDocUploading(true);
    const docTitle = documentName.trim() || file.name.split('.')[0];

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result as string;
      try {
        const res = await fetch(`${API_BASE_URL}/api/medical-vault/documents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.uid,
            fileName: docTitle,
            fileType: documentType,
            fileData: base64Data
          })
        });
        if (res.ok) {
          setNotification('Clinical document added to encrypted vault.');
          setDocumentName('');
          const fileInput = document.getElementById('vault-file-input') as HTMLInputElement;
          if (fileInput) fileInput.value = '';
          fetchUserData();
        } else {
          const data = await res.json();
          setNotification(data.error || 'Failed to upload document.');
        }
      } catch (err) {
        setNotification('Upload failed. Server unreachable.');
      } finally {
        setDocUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const deleteDocument = async (docId: string) => {
    if (!user) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/medical-vault/documents/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid, docId })
      });
      if (res.ok) {
        setNotification('Clinical document deleted.');
        fetchUserData();
      } else {
        const data = await res.json();
        setNotification(data.error || 'Failed to delete record.');
      }
    } catch {
      setNotification('Failed to delete document.');
    }
  };

  // Add family member
  const handleAddFamilyMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFamilyMember.name.trim() || !user) return;

    const memberId = `member_${Date.now()}`;
    const newMemberProfile = {
      fullName: newFamilyMember.name.trim(),
      relation: newFamilyMember.relation,
      age: newFamilyMember.age,
      gender: newFamilyMember.gender,
      bloodGroup: newFamilyMember.bloodGroup,
      height: newFamilyMember.height,
      weight: newFamilyMember.weight,
      organDonor: newFamilyMember.organDonor,
      insuranceStatus: newFamilyMember.insuranceStatus,
      allergies: [],
      diseases: [],
      chronicConditions: [],
      previousInjuries: [],
      medications: [],
      medicalNotes: '',
      emergencyContacts: []
    };

    // Update list of members on self profile
    const updatedMembers = [
      ...(profile.familyMembers || []),
      {
        name: newFamilyMember.name.trim(),
        relation: newFamilyMember.relation,
        profileId: memberId
      }
    ];

    const updatedProfile = {
      ...profile,
      familyMembers: updatedMembers
    };

    // Save profile to state
    setProfile(updatedProfile);

    // Save individual details in familyProfiles
    const updatedVault = {
      ...familyProfiles,
      [memberId]: newMemberProfile
    };
    setFamilyProfiles(updatedVault);

    localStorage.setItem(`helpaid_family_vault_${user.uid}`, JSON.stringify(updatedVault));

    // Reset form
    setNewFamilyMember({
      name: '',
      relation: 'Spouse',
      age: '',
      gender: 'Male',
      bloodGroup: 'O+',
      height: '',
      weight: '',
      organDonor: '',
      insuranceStatus: ''
    });
    setShowFamilyModal(false);
    setActiveProfileId(memberId);
    setNotification(`${newFamilyMember.relation} added to Family Vault.`);
  };

  // SOS button trigger
  const handleSOSTrigger = async () => {
    if (!user) return;
    setNotification('Initiating SOS signal...');
    try {
      // Get location
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          await dispatchSOS(latitude, longitude);
        },
        async (err) => {
          console.warn('Geolocation failed, dispatching with default city coords:', err);
          // Fallback coords (Kanpur/Lucknow general)
          await dispatchSOS(26.8467, 80.9462);
        }
      );
    } catch {
      setNotification('SOS dispatch error.');
    }
  };

  const dispatchSOS = async (lat: number, lng: number) => {
    const activeData = getActiveProfile();
    try {
      const res = await fetch(`${API_BASE_URL}/api/sos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.uid,
          name: activeData.fullName || profile.displayName || 'Unknown Patient',
          lat,
          lng,
          medicalBrief: {
            bloodGroup: activeData.bloodGroup,
            allergies: activeData.allergies,
            medications: activeData.medications,
            notes: activeData.medicalNotes
          }
        })
      });
      if (res.ok) {
        const data = await res.json();
        setNotification(data.message || 'Emergency SOS broadcasted successfully.');
      } else {
        setNotification('SOS broadcast failed. Contact authorities immediately.');
      }
    } catch {
      setNotification('Network error. SOS broadcast failed.');
    }
  };

  // Helper for printing
  const handlePrint = () => {
    window.print();
  };

  // Helper for smooth scrolling
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
      setActiveSection(id);
    }
  };

  if (loading) {
    return (
      <div className="h-[70vh] flex flex-col items-center justify-center gap-4 bg-[#0F172A] text-slate-100">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
        <p className="text-xs font-black text-blue-400 uppercase tracking-widest animate-pulse">
          Decrypting clinical records...
        </p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="w-full min-h-screen bg-[#0F172A] text-slate-100 py-12 px-4 flex items-center justify-center">
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto w-16 h-16 bg-blue-950/40 rounded-2xl flex items-center justify-center text-blue-500 border border-blue-900/30 shadow-2xl mb-2">
              <Shield size={32} />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white">Unlock Clinical EHR Vault</h1>
            <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
              Log in to sync and protect your vital medical records, medical passports, and laboratory reports.
            </p>
          </div>

          <div className="vault-card rounded-[28px] p-6 space-y-4">
            <h3 className="text-xs font-black text-blue-400 uppercase tracking-widest border-b border-white/5 pb-2">
              EHR Clinical Features
            </h3>
            
            <div className="space-y-4">
              {[
                { icon: Shield, title: "EMR Credentials", desc: "Permanent medical passport linked with unique HelpAid ID." },
                { icon: Thermometer, title: "Vital Signs Ledger", desc: "Track weight, height, blood group, allergies & chronic diseases." },
                { icon: FileText, title: "Diagnostic Documents", desc: "Drag-and-drop secure cloud hosting for scans & prescriptions." },
                { icon: Stethoscope, title: "AI Clinical Timeline", desc: "Chronological ledger of AI diagnoses and clinical symptoms." },
                { icon: UserPlus, title: "Multi-Profile Family Vault", desc: "Manage health profiles of spouses, parents, and children." }
              ].map((benefit, i) => (
                <div key={i} className="flex gap-3.5 items-start">
                  <div className="w-9 h-9 rounded-xl bg-blue-950/50 text-blue-400 border border-blue-900/20 flex items-center justify-center shrink-0">
                    <benefit.icon size={16} />
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-slate-200 uppercase tracking-wider">{benefit.title}</h4>
                    <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{benefit.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Link
              to="/login"
              className="flex items-center justify-center py-3.5 bg-slate-800 border border-slate-700 text-slate-200 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-slate-700 transition-all active:scale-95"
            >
              Log In
            </Link>
            <Link
              to="/signup"
              className="flex items-center justify-center py-3.5 bg-blue-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-lg shadow-blue-500/10 hover:bg-blue-500 transition-all active:scale-95"
            >
              Register Account
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  // Define active details
  const activeData = getActiveProfile();
  const publicProfileUrl = `${window.location.origin}/profile/lookup/${profile.publicId || 'HA-2026-PENDING'}`;
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(publicProfileUrl)}&color=0f172a&bgcolor=f8fafc`;
  return (
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
