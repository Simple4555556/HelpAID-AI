import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectDB as configConnectDB } from './src/backend/config/dbConnection.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';


dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/helpaid';

export let isDbConnected = false;

// Cryptographic helpers for sensitive medical details (PII Encryption)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'helpaid_super_secure_32_byte_key_!!!';
const IV_LENGTH = 16;

export function encryptData(text: string): string {
  if (!text) return '';
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.substring(0, 32)), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  } catch (err) {
    console.error('Encryption failed:', err);
    return text;
  }
}

export function decryptData(text: string): string {
  if (!text) return '';
  try {
    const textParts = text.split(':');
    if (textParts.length < 2) return text;
    const iv = Buffer.from(textParts.shift()!, 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.substring(0, 32)), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (err) {
    return text;
  }
}

function encryptProfile(profile: any) {
  if (!profile) return profile;
  const doc = profile.toObject ? profile.toObject() : { ...profile };
  if (doc.fullName) doc.fullName = encryptData(doc.fullName);
  if (doc.mobileNumber) doc.mobileNumber = encryptData(doc.mobileNumber);
  if (doc.medicalNotes) doc.medicalNotes = encryptData(doc.medicalNotes);
  if (Array.isArray(doc.allergies)) {
    doc.allergies = doc.allergies.map((a: string) => encryptData(a));
  }
  if (Array.isArray(doc.diseases)) {
    doc.diseases = doc.diseases.map((d: string) => encryptData(d));
  }
  if (Array.isArray(doc.chronicConditions)) {
    doc.chronicConditions = doc.chronicConditions.map((c: string) => encryptData(c));
  }
  if (Array.isArray(doc.medications)) {
    doc.medications = doc.medications.map((m: string) => encryptData(m));
  }
  return doc;
}

function decryptProfile(profile: any) {
  if (!profile) return profile;
  const doc = profile.toObject ? profile.toObject() : { ...profile };
  if (doc.fullName) doc.fullName = decryptData(doc.fullName);
  if (doc.mobileNumber) doc.mobileNumber = decryptData(doc.mobileNumber);
  if (doc.medicalNotes) doc.medicalNotes = decryptData(doc.medicalNotes);
  if (Array.isArray(doc.allergies)) {
    doc.allergies = doc.allergies.map((a: string) => decryptData(a));
  }
  if (Array.isArray(doc.diseases)) {
    doc.diseases = doc.diseases.map((d: string) => decryptData(d));
  }
  if (Array.isArray(doc.chronicConditions)) {
    doc.chronicConditions = doc.chronicConditions.map((c: string) => decryptData(c));
  }
  if (Array.isArray(doc.medications)) {
    doc.medications = doc.medications.map((m: string) => decryptData(m));
  }
  return doc;
}


// ── MONGOOSE SCHEMAS ────────────────────────────────────────────────────────

import { User } from './src/backend/models/User.js';
import { Hospital } from './src/backend/models/Hospital.js';
import { Doctor } from './src/backend/models/Doctor.js';
import { MedicalStore } from './src/backend/models/MedicalStore.js';
import { BloodBank } from './src/backend/models/BloodBank.js';
import { PoliceStation } from './src/backend/models/PoliceStation.js';
import { AmbulanceService } from './src/backend/models/Ambulance.js';
import { DoctorResponse } from './src/backend/models/DoctorResponse.js';
import { AmbulanceResponse } from './src/backend/models/AmbulanceResponse.js';
import { HospitalResponse } from './src/backend/models/HospitalResponse.js';
import { TrackingSession } from './src/backend/models/TrackingSession.js';
import Notification from './src/backend/models/Notification.js';

// 8. Disease Schema
const DiseaseSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  symptomVector: { type: [Number], default: [] },
  symptomsList: { type: [String], default: [] },
  medicines: { type: [String], default: [] },
  precautions: { type: [String], default: [] },
  embedding: { type: [Number], default: [] }
});

// 9. Symptom Schema
const SymptomSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  severity: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], default: 'LOW' },
  typicalDuration: { type: String, default: '' },
  embedding: { type: [Number], default: [] }
});

// 10. First Aid Guides Schema
const FirstAidSchema = new mongoose.Schema({
  title: { type: String, required: true },
  urgency: { type: String, default: 'MEDIUM' },
  steps: { type: [String], default: [] },
  warnings: { type: [String], default: [] },
  embedding: { type: [Number], default: [] }
});

// 11. Emergency Protocol Schema
const EmergencyProtocolSchema = new mongoose.Schema({
  name: { type: String, required: true },
  severity: { type: String, default: 'MEDIUM' },
  immediateSteps: { type: [String], default: [] },
  whatNotToDo: { type: [String], default: [] },
  ambulanceRequired: { type: Boolean, default: false }
});

// 12. Medicine Schema
const MedicineSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  category: { type: String, default: '' },
  dosageForm: { type: String, default: '' },
  sideEffects: { type: [String], default: [] },
  description: { type: String, default: '' },
  embedding: { type: [Number], default: [] }
});

// 13. Emergency Contact Schema
const EmergencyContactSchema = new mongoose.Schema({
  serviceName: { type: String, required: true }, // e.g. 'Ambulance' | 'Police' | 'Fire Brigade' | 'Women Helpline' | 'Child Helpline'
  phone: { type: String, required: true },
  state: { type: String, required: true },
  district: { type: String, required: true }
});

// 14. Medical History Schema
const MedicalHistorySchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  bloodGroup: { type: String, default: '' },
  allergies: { type: [String], default: [] },
  diabetes: { type: Boolean, default: false },
  hypertension: { type: Boolean, default: false },
  heartDisease: { type: Boolean, default: false },
  asthma: { type: Boolean, default: false },
  currentMedications: { type: [String], default: [] },
  previousSurgeries: { type: [String], default: [] },
  chronicConditions: { type: [String], default: [] }
});

// 15. User Emergency Contact Schema
const UserEmergencyContactSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  name: { type: String, required: true },
  relation: { type: String, default: '' },
  mobileNumber: { type: String, required: true }
});

// 16. Uploaded Document Schema
const UploadedDocumentSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  fileName: { type: String, required: true },
  fileType: { type: String, required: true }, // e.g., 'Prescription' | 'X-Ray' | 'MRI' | 'CT Scan' | 'Lab Report'
  fileUrl: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now }
});


// Extra schemas for profiles/reports/SOS logs
const UserProfileSchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true },
  publicId: { type: String, required: true, unique: true },
  displayName: { type: String, default: '' },
  email: { type: String, default: '' },
  fullName: { type: String, default: '' },
  age: { type: Number, default: null },
  gender: { type: String, default: '' },
  mobileNumber: { type: String, default: '' },
  bloodGroup: { type: String, default: '' },
  profilePhoto: { type: String, default: '' },
  allergies: { type: [String], default: [] },
  diseases: { type: [String], default: [] },
  chronicConditions: { type: [String], default: [] },
  previousInjuries: { type: [String], default: [] },
  medications: { type: [String], default: [] },
  medicalNotes: { type: String, default: '' },
  emergencyContacts: [
    {
      name: { type: String, default: '' },
      phone: { type: String, default: '' }
    }
  ],
  height: { type: String, default: '' },
  weight: { type: String, default: '' },
  organDonor: { type: String, default: '' },
  insuranceStatus: { type: String, default: '' },
  familyMembers: [
    {
      name: { type: String, default: '' },
      relation: { type: String, default: '' },
      profileId: { type: String, default: '' }
    }
  ]
});

import { MedicalReport } from './src/backend/models/MedicalReport.js';

const SOSLogSchema = new mongoose.Schema({
  userId: { type: String, default: 'anonymous' },
  name: { type: String, default: 'Unknown' },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now }
});

const ChatHistorySchema = new mongoose.Schema({
  userId: { type: String, required: true },
  chatId: { type: String, required: true, unique: true },
  history: [
    {
      role: { type: String, enum: ['user', 'model'], required: true },
      content: { type: String, required: true }
    }
  ],
  symptoms: { type: [String], default: [] },
  aiSuggestions: { type: [String], default: [] },
  followUpQuestions: { type: [String], default: [] },
  timestamp: { type: Date, default: Date.now }
});

const SymptomReportSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  symptoms: { type: String, required: true },
  predictedDisease: { type: String, required: true },
  confidenceScore: { type: Number, required: true },
  severity: { type: String, required: true },
  date: { type: Date, default: Date.now }
});

const InjuryReportSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  imageUrl: { type: String, default: '' },
  injuryType: { type: String, required: true },
  severity: { type: String, required: true },
  result: { type: mongoose.Schema.Types.Mixed, required: true },
  timestamp: { type: Date, default: Date.now }
});

const DoctorConsultationSchema = new mongoose.Schema({
  consultationId: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  doctorName: { type: String, default: 'General Medical Consultant' },
  status: { type: String, enum: ['PENDING', 'ACTIVE', 'COMPLETED'], default: 'PENDING' },
  reportsShared: { type: [String], default: [] },
  medicalSummary: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now }
});

const MedicalTimelineSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  helpAidId: { type: String, required: true },
  eventType: { type: String, enum: ['INJURY', 'CHAT', 'SYMPTOM', 'CONSULTATION'], required: true },
  eventTitle: { type: String, required: true },
  eventDate: { type: Date, default: Date.now },
  referenceId: { type: String, default: '' }
});

const ImportLogSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  successCount: { type: Number, default: 0 },
  errorCount: { type: Number, default: 0 },
  errors: { type: [String], default: [] },
  source: { type: String, default: '' },
  targetCollection: { type: String, default: '' }
});

import { EmergencyCase } from './src/backend/models/EmergencyRequest.js';

const ConsentLogSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  caseId: { type: String, default: null },
  consentType: { type: String, required: true }, // e.g. 'EMERGENCY_DISPATCH' | 'VAULT_SHARE'
  granted: { type: Boolean, default: true },
  ipAddress: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now }
});


// Models definitions
export { User, Hospital, Doctor, BloodBank, MedicalStore, PoliceStation, AmbulanceService, DoctorResponse, AmbulanceResponse, HospitalResponse, TrackingSession };
export const Disease: mongoose.Model<any> = mongoose.models.Disease || mongoose.model('Disease', DiseaseSchema);
export const Symptom: mongoose.Model<any> = mongoose.models.Symptom || mongoose.model('Symptom', SymptomSchema);
export const FirstAid: mongoose.Model<any> = mongoose.models.FirstAid || mongoose.model('FirstAid', FirstAidSchema);
export const EmergencyProtocol: mongoose.Model<any> = mongoose.models.EmergencyProtocol || mongoose.model('EmergencyProtocol', EmergencyProtocolSchema);
export const Medicine: mongoose.Model<any> = mongoose.models.Medicine || mongoose.model('Medicine', MedicineSchema);
export const EmergencyContact: mongoose.Model<any> = mongoose.models.EmergencyContact || mongoose.model('EmergencyContact', EmergencyContactSchema);
export const UserProfile: mongoose.Model<any> = mongoose.models.UserProfile || mongoose.model('UserProfile', UserProfileSchema);
export { MedicalReport };
export const SOSLog: mongoose.Model<any> = mongoose.models.SOSLog || mongoose.model('SOSLog', SOSLogSchema);
export const ChatHistory: mongoose.Model<any> = mongoose.models.ChatHistory || mongoose.model('ChatHistory', ChatHistorySchema);
export const SymptomReport: mongoose.Model<any> = mongoose.models.SymptomReport || mongoose.model('SymptomReport', SymptomReportSchema);
export const InjuryReport: mongoose.Model<any> = mongoose.models.InjuryReport || mongoose.model('InjuryReport', InjuryReportSchema);
export const DoctorConsultation: mongoose.Model<any> = mongoose.models.DoctorConsultation || mongoose.model('DoctorConsultation', DoctorConsultationSchema);
export const MedicalTimeline: mongoose.Model<any> = mongoose.models.MedicalTimeline || mongoose.model('MedicalTimeline', MedicalTimelineSchema);
export const MedicalHistory: mongoose.Model<any> = mongoose.models.MedicalHistory || mongoose.model('MedicalHistory', MedicalHistorySchema);
export const UserEmergencyContact: mongoose.Model<any> = mongoose.models.UserEmergencyContact || mongoose.model('UserEmergencyContact', UserEmergencyContactSchema);
export const UploadedDocument: mongoose.Model<any> = mongoose.models.UploadedDocument || mongoose.model('UploadedDocument', UploadedDocumentSchema);
export const ImportLog: mongoose.Model<any> = mongoose.models.ImportLog || mongoose.model('ImportLog', ImportLogSchema);
export { EmergencyCase };
export const ConsentLog: mongoose.Model<any> = mongoose.models.ConsentLog || mongoose.model('ConsentLog', ConsentLogSchema);
export { Notification };



// ── INITIALIZATION / DATABASE SEEDING ──────────────────────────────────────

export async function connectDB() {
  await configConnectDB(
    MONGODB_URI,
    async () => {
      isDbConnected = true;
      await runDatabaseMigrations();
    },
    async () => {
      isDbConnected = false;
    }
  );
}

async function runDatabaseMigrations() {
  try {
    console.log('🔄 Running HelpAid Database Migrations...');

    // 1. Migrate Users: Set default status and is_online fields
    const usersResult = await User.updateMany(
      { $or: [{ is_online: { $exists: false } }, { status: { $exists: false } }] },
      { $set: { is_online: false, status: 'active' } }
    );
    if (usersResult.modifiedCount > 0) {
      console.log(`✅ Migrated ${usersResult.modifiedCount} User documents.`);
    }

    // 2. Migrate Doctors: Set default is_online, status fields if missing
    const doctorsResult = await Doctor.updateMany(
      { $or: [{ is_online: { $exists: false } }, { status: { $exists: false } }] },
      { $set: { is_online: false, status: 'active' } }
    );
    if (doctorsResult.modifiedCount > 0) {
      console.log(`✅ Migrated ${doctorsResult.modifiedCount} Doctor documents.`);
    }

    // 3. Migrate Hospitals: Set default is_online, status, accepting_emergency fields if missing
    const hospitalsResult = await Hospital.updateMany(
      { $or: [{ is_online: { $exists: false } }, { status: { $exists: false } }, { accepting_emergency: { $exists: false } }] },
      { $set: { is_online: false, status: 'active', accepting_emergency: true } }
    );
    if (hospitalsResult.modifiedCount > 0) {
      console.log(`✅ Migrated ${hospitalsResult.modifiedCount} Hospital documents.`);
    }

    console.log('✅ HelpAid Database Migrations completed successfully.');
  } catch (err: any) {
    console.error('❌ Failed to run Database Migrations:', err.message);
  }
}

// ── DATA ACCESS LAYOUTS ───────────────────────────────────────────────────

export async function getAllHospitals() {
  return await Hospital.find({});
}

export async function findBloodStocks(bloodGroup: string) {
  return await BloodBank.find({ $or: [{ bloodGroup }, { availableBloodGroups: bloodGroup }] });
}

export async function getAllFirstAidGuides() {
  return await FirstAid.find({});
}

export async function getEmergencyProtocol(name: string) {
  return await EmergencyProtocol.findOne({ name: new RegExp(name, 'i') });
}

export async function saveMedicalReport(reportData: { userId: string; type: string; result: any }) {
  return await MedicalReport.create(reportData);
}

export async function getMedicalReports(userId: string) {
  return await MedicalReport.find({ userId }).sort({ timestamp: -1 });
}

export async function createSOSLog(sosData: { userId?: string; name?: string; lat: number; lng: number }) {
  return await SOSLog.create(sosData);
}

export async function getSOSLogs() {
  return await SOSLog.find({}).sort({ timestamp: -1 });
}

export function generateHelpAidId(): string {
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `HA-2026-${rand}`;
}

export async function saveUserProfile(uid: string, profileData: any) {
  if (!profileData.publicId) {
    const existing = await getUserProfile(uid);
    profileData.publicId = existing?.publicId || generateHelpAidId();
  }
  const encryptedData = encryptProfile(profileData);
  const doc = await UserProfile.findOneAndUpdate({ uid }, encryptedData, { upsert: true, new: true });
  return decryptProfile(doc);
}

export async function getUserProfile(uid: string) {
  let profile = await UserProfile.findOne({ uid });
  if (!profile) {
    profile = await UserProfile.create({
      uid,
      publicId: generateHelpAidId(),
      displayName: 'HelpAid User'
    });
  }
  return decryptProfile(profile);
}

export async function getUserProfileByHelpAidId(helpAidId: string) {
  const doc = await UserProfile.findOne({ publicId: helpAidId });
  return decryptProfile(doc);
}

export async function saveChatHistory(chatData: any) {
  const session = await ChatHistory.findOneAndUpdate({ chatId: chatData.chatId }, chatData, { upsert: true, new: true });
  // Add to timeline if first time
  const timelineExists = await MedicalTimeline.findOne({ referenceId: chatData.chatId });
  if (!timelineExists) {
    const profile = await UserProfile.findOne({ uid: chatData.userId });
    await MedicalTimeline.create({
      userId: chatData.userId,
      helpAidId: profile?.publicId || 'HA-2026-UNKNOWN',
      eventType: 'CHAT',
      eventTitle: `AI Chat Consultation`,
      referenceId: chatData.chatId,
      eventDate: new Date()
    });
  }
  return session;
}

export async function getChatHistories(userId: string) {
  return await ChatHistory.find({ userId }).sort({ timestamp: -1 });
}

export async function getChatHistory(chatId: string) {
  return await ChatHistory.findOne({ chatId });
}

export async function createSymptomReport(reportData: any) {
  const report = await SymptomReport.create(reportData);
  const profile = await UserProfile.findOne({ uid: reportData.userId });
  await MedicalTimeline.create({
    userId: reportData.userId,
    helpAidId: profile?.publicId || 'HA-2026-UNKNOWN',
    eventType: 'SYMPTOM',
    eventTitle: `Symptom Analysis: ${reportData.predictedDisease} (${reportData.confidenceScore}%)`,
    referenceId: report._id.toString(),
    eventDate: reportData.date || new Date()
  });
  return report;
}

export async function getSymptomReports(userId: string) {
  return await SymptomReport.find({ userId }).sort({ date: -1 });
}

export async function createInjuryReport(reportData: any) {
  const report = await InjuryReport.create(reportData);
  const profile = await UserProfile.findOne({ uid: reportData.userId });
  await MedicalTimeline.create({
    userId: reportData.userId,
    helpAidId: profile?.publicId || 'HA-2026-UNKNOWN',
    eventType: 'INJURY',
    eventTitle: `Injury Scan: ${reportData.injuryType} (${reportData.severity})`,
    referenceId: report._id.toString(),
    eventDate: reportData.timestamp || new Date()
  });
  return report;
}

export async function getInjuryReports(userId: string) {
  return await InjuryReport.find({ userId }).sort({ timestamp: -1 });
}

export async function createDoctorConsultation(consultData: any) {
  const consult = await DoctorConsultation.create(consultData);
  const profile = await UserProfile.findOne({ uid: consultData.userId });
  await MedicalTimeline.create({
    userId: consultData.userId,
    helpAidId: profile?.publicId || 'HA-2026-UNKNOWN',
    eventType: 'CONSULTATION',
    eventTitle: `Doctor Consultation Request: ${consultData.doctorName}`,
    referenceId: consult._id.toString(),
    eventDate: consultData.timestamp || new Date()
  });
  return consult;
}

export async function getDoctorConsultations(userId: string) {
  return await DoctorConsultation.find({ userId }).sort({ timestamp: -1 });
}

export async function getAllDoctorConsultations() {
  return await DoctorConsultation.find({}).sort({ timestamp: -1 });
}

export async function createTimelineEvent(eventData: any) {
  return await MedicalTimeline.create(eventData);
}

export async function getMedicalTimeline(userId: string) {
  return await MedicalTimeline.find({ userId }).sort({ eventDate: -1 });
}

// ── NEW DATA ACCESS LAYOUTS ──────────────────────────────────────────────────

export async function getMedicalHistory(userId: string) {
  let history = await MedicalHistory.findOne({ userId });
  if (!history) {
    history = await MedicalHistory.create({ userId });
  }
  return history;
}

export async function saveMedicalHistory(userId: string, historyData: any) {
  return await MedicalHistory.findOneAndUpdate({ userId }, historyData, { upsert: true, new: true });
}

export async function getUserEmergencyContacts(userId: string) {
  return await UserEmergencyContact.find({ userId });
}

export async function saveUserEmergencyContact(userId: string, contactData: any) {
  if (contactData._id) {
    return await UserEmergencyContact.findByIdAndUpdate(contactData._id, contactData, { new: true });
  }
  return await UserEmergencyContact.create({ userId, ...contactData });
}

export async function deleteUserEmergencyContact(userId: string, contactId: string) {
  return await UserEmergencyContact.deleteOne({ _id: contactId, userId });
}

export async function getUploadedDocuments(userId: string) {
  return await UploadedDocument.find({ userId }).sort({ uploadedAt: -1 });
}

export async function saveUploadedDocument(userId: string, documentData: { fileName: string; fileType: string; fileUrl: string }) {
  return await UploadedDocument.create({ userId, ...documentData });
}

export async function deleteUploadedDocument(userId: string, docId: string) {
  return await UploadedDocument.deleteOne({ _id: docId, userId });
}

// ── DIRECTORY DATA ACCESS WRAPPERS ──────────────────────────────────────────

export async function getHospitals(filter: any = {}) {
  const docs = await Hospital.find(filter);
  if (Object.keys(filter).length === 0) {
    console.log(`[DB] getHospitals() found ${docs.length} records in MongoDB`);
  }
  return docs;
}

export async function getDoctors(filter: any = {}) {
  const docs = await Doctor.find(filter);
  if (Object.keys(filter).length === 0) {
    console.log(`[DB] getDoctors() found ${docs.length} records in MongoDB`);
  }
  return docs;
}

export async function getBloodBanks(filter: any = {}) {
  return await BloodBank.find(filter);
}

export async function getMedicalStores(filter: any = {}) {
  return await MedicalStore.find(filter);
}

export async function getPoliceStations(filter: any = {}) {
  return await PoliceStation.find(filter);
}

export async function getAmbulanceServices(filter: any = {}) {
  return await AmbulanceService.find(filter);
}

export async function upsertHospital(query: any, data: any) {
  return await Hospital.findOneAndUpdate(query, { ...data, lastUpdated: new Date() }, { upsert: true, new: true });
}

export async function upsertDoctor(query: any, data: any) {
  return await Doctor.findOneAndUpdate(query, { ...data, lastUpdated: new Date() }, { upsert: true, new: true });
}

export async function deleteDoctor(doctorId: string) {
  return await Doctor.deleteOne({ _id: doctorId });
}

export async function upsertBloodBank(query: any, data: any) {
  return await BloodBank.findOneAndUpdate(query, { ...data, lastUpdated: new Date() }, { upsert: true, new: true });
}

export async function upsertMedicalStore(query: any, data: any) {
  return await MedicalStore.findOneAndUpdate(query, { ...data, lastUpdated: new Date() }, { upsert: true, new: true });
}

export async function upsertPoliceStation(query: any, data: any) {
  return await PoliceStation.findOneAndUpdate(query, { ...data, lastUpdated: new Date() }, { upsert: true, new: true });
}

export async function upsertAmbulanceService(query: any, data: any) {
  return await AmbulanceService.findOneAndUpdate(query, { ...data, lastUpdated: new Date() }, { upsert: true, new: true });
}

export async function getImportLogs() {
  return await ImportLog.find({}).sort({ timestamp: -1 });
}

export async function createImportLog(logData: any) {
  const timestamp = new Date();
  return await ImportLog.create({ ...logData, timestamp });
}

export async function getDiseases(filter: any = {}) {
  return await Disease.find(filter);
}

export async function getSymptoms(filter: any = {}) {
  return await Symptom.find(filter);
}

export async function getFirstAids(filter: any = {}) {
  return await FirstAid.find(filter);
}

export async function getMedicines(filter: any = {}) {
  return await Medicine.find(filter);
}

export async function upsertDisease(query: any, data: any) {
  return await Disease.findOneAndUpdate(query, data, { upsert: true, new: true });
}

export async function upsertSymptom(query: any, data: any) {
  return await Symptom.findOneAndUpdate(query, data, { upsert: true, new: true });
}

export async function upsertFirstAid(query: any, data: any) {
  return await FirstAid.findOneAndUpdate(query, data, { upsert: true, new: true });
}

export async function upsertMedicine(query: any, data: any) {
  return await Medicine.findOneAndUpdate(query, data, { upsert: true, new: true });
}

export async function getConsentLogs(filter: any = {}) {
  return await ConsentLog.find(filter).sort({ timestamp: -1 });
}

export async function createConsentLog(logData: any) {
  const timestamp = new Date();
  return await ConsentLog.create({ ...logData, timestamp });
}

export async function getNotificationLogs(filter: any = {}) {
  return await Notification.find(filter).sort({ sentAt: -1 });
}

export async function createNotificationLog(logData: any) {
  const sentAt = new Date();
  return await Notification.create({ ...logData, sentAt });
}



