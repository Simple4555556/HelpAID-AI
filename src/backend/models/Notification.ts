import mongoose from 'mongoose';

const NotificationSchema = new mongoose.Schema({
  recipientId: { type: String, required: true, index: true },
  type: { type: String, enum: ['SOS_ALERT', 'CASE_ACCEPTED', 'CASE_REJECTED', 'CASE_FORWARDED', 'CASE_CLOSED', 'SYSTEM'], required: true },
  caseId: { type: String, default: null },
  title: { type: String, default: '' },
  message: { type: String, default: '' },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
}, { collection: 'notifications' });

const Notification: mongoose.Model<any> = mongoose.models.Notification || mongoose.model('Notification', NotificationSchema);

export default Notification;
