import mongoose from 'mongoose';

const HospitalResponseSchema = new mongoose.Schema({
  caseId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmergencyCase', required: true, index: true },
  responderId: { type: String, required: true },
  responderName: { type: String, default: '' },
  action: { type: String, enum: ['ACCEPTED', 'REJECTED'], required: true },
  distanceKm: { type: Number, default: 0 },
  timestamp: { type: Date, default: Date.now }
}, { collection: 'hospital_responses' });

export const HospitalResponse: mongoose.Model<any> = mongoose.models.HospitalResponse || mongoose.model('HospitalResponse', HospitalResponseSchema);
