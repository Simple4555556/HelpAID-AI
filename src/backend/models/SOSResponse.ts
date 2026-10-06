import mongoose from 'mongoose';

const SOSResponseSchema = new mongoose.Schema({
  caseId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmergencyCase', required: true, index: true },
  responderId: { type: String, required: true },
  responderRole: { type: String, enum: ['doctor', 'hospital', 'hospital_admin'], required: true },
  responderName: { type: String, default: '' },
  action: { type: String, enum: ['ACCEPTED', 'REJECTED', 'FORWARDED'], required: true },
  forwardedTo: { type: String, default: null },
  distanceKm: { type: Number, default: 0 },
  timestamp: { type: Date, default: Date.now }
}, { collection: 'sos_responses' });

export const SOSResponse = mongoose.models.SOSResponse || mongoose.model('SOSResponse', SOSResponseSchema);
