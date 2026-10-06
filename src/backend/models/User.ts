import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin', 'hospital_admin', 'doctor', 'ambulance_driver', 'hospital'], default: 'user' },
  hospitalId: { type: String, default: null }, // Link to Hospital if role is hospital_admin
  displayName: { type: String, default: '' },
  phone: { type: String, default: '' },
  is_online: { type: Boolean, default: false },
  status: { type: String, enum: ['active', 'pending_verification', 'suspended'], default: 'active' },
  doctorProfileId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', default: null },
  hospitalProfileId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', default: null },
  ambulanceProfileId: { type: mongoose.Schema.Types.ObjectId, ref: 'AmbulanceService', default: null },
  ambulanceId: { type: String, default: null },
  lastLoginAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  helpAidId: { type: String, default: '' },
  patientName: { type: String, default: '' },
  age: { type: Number, default: null },
  gender: { type: String, default: '' },
  bloodGroup: { type: String, default: '' },
  emergencyContact: { type: String, default: '' }
}, { collection: 'patients' });

// Hash password before saving
UserSchema.pre('save', async function (this: any) {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

UserSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

export const User: mongoose.Model<any> = mongoose.models.User || mongoose.model('User', UserSchema);
