const mongoose = require('mongoose');

const journalistRequestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true, trim: true },
  company: { type: String, required: true, trim: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  rejectionReason: { type: String, default: null }
}, { timestamps: true });

journalistRequestSchema.index({ userId: 1 });
journalistRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('JournalistRequest', journalistRequestSchema);
