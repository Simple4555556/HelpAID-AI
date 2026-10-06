import mongoose from 'mongoose';

const MedicalStoreSchema = new mongoose.Schema({
  name: { type: String, required: true },
  address: { type: String, default: '' },
  city: { type: String, default: '' },
  district: { type: String, default: '' },
  phone: { type: String, default: '' },
  latitude: { type: Number, required: true, default: 0 },
  longitude: { type: Number, required: true, default: 0 },
  open24x7: { type: Boolean, default: false },
  verified: { type: Boolean, default: false },
  source: { type: String, default: 'Seeded' },
  lastUpdated: { type: Date, default: Date.now },
  embedding: { type: [Number], default: [] },
  // Compatibility
  lat: { type: Number },
  lng: { type: Number }
}, { collection: 'medical_stores' });

MedicalStoreSchema.pre('save', function (this: any) {
  if (this.latitude && !this.lat) this.lat = this.latitude;
  if (this.longitude && !this.lng) this.lng = this.longitude;
});

export const MedicalStore = mongoose.models.MedicalStore || mongoose.model('MedicalStore', MedicalStoreSchema);
