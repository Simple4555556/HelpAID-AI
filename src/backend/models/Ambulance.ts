import mongoose from 'mongoose';

const AmbulanceServiceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  address: { type: String, default: '' },
  city: { type: String, default: '' },
  district: { type: String, default: '' },
  state: { type: String, default: '' },
  latitude: { type: Number, required: true, default: 0 },
  longitude: { type: Number, required: true, default: 0 },
  vehicleType: { type: String, default: 'Basic' }, // 'Basic' | 'Cardiac' | 'ICU'
  chargePerKm: { type: Number, default: 0 },
  available: { type: Boolean, default: true },
  is_online: { type: Boolean, default: false },
  is_available: { type: Boolean, default: true },
  verified: { type: Boolean, default: false },
  source: { type: String, default: 'Seeded' },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  profileId: { type: String, default: null },
  socketRoom: { type: String, default: null },
  lastSeen: { type: Date, default: Date.now },
  onlineStatus: { type: String, default: 'offline' },
  lastUpdated: { type: Date, default: Date.now },
  embedding: { type: [Number], default: [] },
  // Compatibility
  lat: { type: Number },
  lng: { type: Number }
}, { collection: 'ambulances' });

AmbulanceServiceSchema.pre('save', function (this: any) {
  if (this.latitude && !this.lat) this.lat = this.latitude;
  if (this.longitude && !this.lng) this.lng = this.longitude;
});

export const AmbulanceService: mongoose.Model<any> = mongoose.models.AmbulanceService || mongoose.model('AmbulanceService', AmbulanceServiceSchema);
