import mongoose from 'mongoose';

const EmergencyCaseSchema = new mongoose.Schema({
  userId: { type: String, default: 'anonymous' },
  guestSessionId: { type: String, default: null },
  firebaseUid: { type: String, default: null },
  helpAidId: { type: String, default: '' },
  reportId: { type: String, default: null },
  trackingSessionId: { type: String, default: null },
  caseId: { type: String, default: null },
  patientName: { type: String, default: 'Unknown' },
  patientContact: { type: String, default: '' },
  patient_phone: { type: String, default: '' },
  patient_location_address: { type: String, default: '' },
  injuryType: { type: String, required: true },
  severity: { type: String, required: true },
  emergencyDescription: { type: String, default: '' },
  aiReportSummary: { type: String, default: '' },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  status: { type: String, enum: ['PENDING', 'ACCEPTED', 'REJECTED', 'RESOLVED', 'ESCALATED', 'DOCTOR_ACCEPTED', 'AMBULANCE_ASSIGNED', 'HOSPITAL_ACCEPTED'], default: 'PENDING' },
  assignedHospitalId: { type: String, default: null },
  notifiedHospitalIds: { type: [String], default: [] },
  assignedAmbulanceId: { type: String, default: null },
  notifiedAmbulanceIds: { type: [String], default: [] },
  assignedDoctorId: { type: String, default: null },
  notifiedDoctorIds: { type: [String], default: [] },
  familyNotified: { type: Boolean, default: false },
  etaMinutes: { type: Number, default: 0 },
  reportData: { type: mongoose.Schema.Types.Mixed, default: {} },
  imageUrl: { type: String, default: '' },
  pdfReportUrl: { type: String, default: '' },
  // SOS dispatch extended fields
  accepted_by: {
    userId: { type: String, default: null },
    role: { type: String, default: null },
    name: { type: String, default: null },
    phone: { type: String, default: null },
    time: { type: Date, default: null }
  },
  accepted_doctor: {
    doctorId: { type: String, default: null },
    name: { type: String, default: null },
    phone: { type: String, default: null },
    specialization: { type: String, default: null },
    hospital: { type: String, default: null }
  },
  acceptedDoctor: {
    doctorId: { type: String, default: null },
    doctorName: { type: String, default: null },
    specialization: { type: String, default: null },
    phone: { type: String, default: null },
    hospitalName: { type: String, default: null },
    hospitalAddress: { type: String, default: null },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    distanceFromPatient: { type: Number, default: null },
    acceptedAt: { type: Date, default: null }
  },
  accepted_hospital: {
    hospitalId: { type: String, default: null },
    name: { type: String, default: null },
    phone: { type: String, default: null },
    address: { type: String, default: null }
  },
  accepted_ambulance: {
    ambulanceId: { type: String, default: null },
    driverName: { type: String, default: null },
    driverPhone: { type: String, default: null },
    vehicleNumber: { type: String, default: null },
    vehicleType: { type: String, default: null },
    eta: { type: Number, default: null }
  },
  forwarding_history: [{
    from: { type: String },
    fromName: { type: String },
    to: { type: String },
    toName: { type: String },
    timestamp: { type: Date, default: Date.now },
    reason: { type: String, default: '' }
  }],
  timeline: [{
    event: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    actorId: { type: String, default: null },
    actorRole: { type: String, default: null },
    details: { type: mongoose.Schema.Types.Mixed, default: {} }
  }],
  doctorStatus: { type: String, default: 'none' },
  hospitalStatus: { type: String, default: 'none' },
  ambulanceStatus: { type: String, default: 'none' },
  requiredSpecializations: { type: [String], default: [] },
  aiAnalysis: { type: mongoose.Schema.Types.Mixed, default: null },
  escalation_level: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { collection: 'emergency_requests', timestamps: true });

delete mongoose.models.EmergencyCase;
export const EmergencyCase: mongoose.Model<any> = mongoose.model('EmergencyCase', EmergencyCaseSchema);
