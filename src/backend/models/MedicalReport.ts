import mongoose from 'mongoose';

const MedicalReportSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  type: { type: String, required: true }, // 'SYMPTOM', 'INJURY', 'ACCIDENT', 'HEART', 'EMERGENCY'
  result: { type: mongoose.Schema.Types.Mixed, required: true },
  timestamp: { type: Date, default: Date.now }
}, { collection: 'medical_reports' });

export const MedicalReport: mongoose.Model<any> = mongoose.models.MedicalReport || mongoose.model('MedicalReport', MedicalReportSchema);
