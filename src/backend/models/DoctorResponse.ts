import mongoose from 'mongoose';

const DoctorResponseSchema = new mongoose.Schema({
  caseId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmergencyCase', required: true, index: true },
  responderId: { type: String, required: true },
  responderName: { type: String, default: '' },
  action: { type: String, enum: ['ACCEPTED', 'REJECTED', 'FORWARDED'], required: true },
  forwardedTo: { type: String, default: null },
  distanceKm: { type: Number, default: 0 },
  timestamp: { type: Date, default: Date.now }
}, { collection: 'doctor_responses' });

export const DoctorResponse: mongoose.Model<any> = mongoose.models.DoctorResponse || mongoose.model('DoctorResponse', DoctorResponseSchema);
