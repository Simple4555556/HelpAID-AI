import mongoose from 'mongoose';

const DoctorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  specialization: { type: String, required: true },
  clinic: { type: String, default: '' },
  hospital: { type: String, default: '' },
  phone: { type: String, default: '' },
  city: { type: String, default: '' },
  state: { type: String, default: '' },
  district: { type: String, default: '' },
  experience: { type: Number, default: 0 },
  registrationNumber: { type: String, default: '' },
  availability: { type: [String], default: [] },
  verified: { type: Boolean, default: false },
  source: { type: String, default: 'Seeded' },
  lastUpdated: { type: Date, default: Date.now },
  embedding: { type: [Number], default: [] },
  lat: { type: Number },
  lng: { type: Number },
  latitude: { type: Number },
  longitude: { type: Number },
  // SOS dispatch fields
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  is_online: { type: Boolean, default: false },
  status: { type: String, enum: ['active', 'pending_verification', 'suspended'], default: 'active' }
}, { collection: 'doctors' });

DoctorSchema.pre('save', function (this: any) {
  if (this.latitude && !this.lat) this.lat = this.latitude;
  if (this.longitude && !this.lng) this.lng = this.longitude;
  if (this.lat && !this.latitude) this.latitude = this.lat;
  if (this.lng && !this.longitude) this.longitude = this.lng;
});

export const Doctor: mongoose.Model<any> = mongoose.models.Doctor || mongoose.model('Doctor', DoctorSchema);
