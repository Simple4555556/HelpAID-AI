import mongoose from 'mongoose';

const TrackingSessionSchema = new mongoose.Schema({
  caseId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmergencyCase', required: true, index: true },
  ambulanceId: { type: mongoose.Schema.Types.ObjectId, ref: 'AmbulanceService', default: null },
  patientLoc: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  ambulanceLoc: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null }
  },
  doctorLoc: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null }
  },
  hospitalLoc: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null }
  },
  distanceRemaining: { type: Number, default: 0 },
  eta: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now }
}, { collection: 'tracking_sessions' });

export const TrackingSession: mongoose.Model<any> = mongoose.models.TrackingSession || mongoose.model('TrackingSession', TrackingSessionSchema);

