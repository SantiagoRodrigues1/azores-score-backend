const mongoose = require('mongoose');

const viewEventSchema = new mongoose.Schema({
  entityType: { type: String, enum: ['player', 'team', 'news'], required: true },
  entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  viewedAt: { type: Date, default: Date.now }
}, { timestamps: false });

viewEventSchema.index({ entityType: 1, entityId: 1, viewedAt: -1 });
viewEventSchema.index({ viewedAt: -1 });

module.exports = mongoose.model('ViewEvent', viewEventSchema);
