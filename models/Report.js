const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  entityType: { type: String, enum: ['post', 'comment'], required: true },
  entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
  reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reason: { type: String, required: true, trim: true, maxlength: 120 },
  details: { type: String, trim: true, default: null, maxlength: 500 },
  status: { type: String, enum: ['pending', 'reviewed', 'dismissed'], default: 'pending' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ entityType: 1, entityId: 1 });

module.exports = mongoose.model('Report', reportSchema);
