import mongoose from 'mongoose';

const HospitalSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, default: 'General' },
  address: { type: String, default: '' },
  city: { type: String, default: '' },
  district: { type: String, default: '' },
  state: { type: String, default: '' },
  pincode: { type: String, default: '' },
  phone: { type: String, default: '' },
  email: { type: String, default: '' },
  website: { type: String, default: '' },
  latitude: { type: Number, required: true, default: 0 },
  longitude: { type: Number, required: true, default: 0 },
  specializations: { type: [String], default: [] },
  emergencyAvailable: { type: Boolean, default: false },
  open24x7: { type: Boolean, default: false },
  verified: { type: Boolean, default: false },
  source: { type: String, default: 'Seeded' },
  lastUpdated: { type: Date, default: Date.now },
  embedding: { type: [Number], default: [] },
  emergencyBedsTotal: { type: Number, default: 10 },
  emergencyBedsAvailable: { type: Number, default: 5 },
  icuBedsTotal: { type: Number, default: 5 },
  icuBedsAvailable: { type: Number, default: 2 },
  ventilatorsTotal: { type: Number, default: 3 },
  ventilatorsAvailable: { type: Number, default: 1 },
  // UI backwards compatibility fields
  lat: { type: Number },
  lng: { type: Number },
  specialties: { type: [String] },
  // SOS dispatch fields
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  licenseNumber: { type: String, default: '' },
  emergencyContactNumber: { type: String, default: '' },
  is_online: { type: Boolean, default: false },
  accepting_emergency: { type: Boolean, default: true },
  status: { type: String, enum: ['active', 'pending_verification', 'suspended'], default: 'active' }
}, { collection: 'hospitals' });

// Sync UI compatible coordinates and specialty fields
HospitalSchema.pre('save', function (this: any) {
  if (this.latitude && !this.lat) this.lat = this.latitude;
  if (this.longitude && !this.lng) this.lng = this.longitude;
  if (this.specializations && this.specializations.length && (!this.specialties || !this.specialties.length)) {
    this.specialties = this.specializations;
  }
});

export const Hospital: mongoose.Model<any> = mongoose.models.Hospital || mongoose.model('Hospital', HospitalSchema);
