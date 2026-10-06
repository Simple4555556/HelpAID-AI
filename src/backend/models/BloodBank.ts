import mongoose from 'mongoose';

const BloodBankSchema = new mongoose.Schema({
  name: { type: String, required: true },
  address: { type: String, default: '' },
  city: { type: String, default: '' },
  district: { type: String, default: '' },
  phone: { type: String, default: '' },
  latitude: { type: Number, required: true, default: 0 },
  longitude: { type: Number, required: true, default: 0 },
  availableBloodGroups: { type: [String], default: [] },
  open24x7: { type: Boolean, default: false },
  verified: { type: Boolean, default: false },
  source: { type: String, default: 'Seeded' },
  lastUpdated: { type: Date, default: Date.now },
  embedding: { type: [Number], default: [] },
  // Compatibility fields
  bloodGroup: { type: String },
  availability: { type: Boolean, default: true },
  distance: { type: String, default: '' },
  lat: { type: Number },
  lng: { type: Number }
}, { collection: 'blood_banks' });

BloodBankSchema.pre('save', function (this: any) {
  if (this.latitude && !this.lat) this.lat = this.latitude;
  if (this.longitude && !this.lng) this.lng = this.longitude;
});

export const BloodBank: mongoose.Model<any> = mongoose.models.BloodBank || mongoose.model('BloodBank', BloodBankSchema);
