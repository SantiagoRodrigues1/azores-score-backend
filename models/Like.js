const mongoose = require('mongoose');

const likeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  entityType: { type: String, enum: ['news', 'post', 'comment'], required: true },
  entityId: { type: mongoose.Schema.Types.ObjectId, required: true }
}, { timestamps: true });

likeSchema.index({ userId: 1, entityType: 1, entityId: 1 }, { unique: true });
likeSchema.index({ entityType: 1, entityId: 1 });

module.exports = mongoose.model('Like', likeSchema);
