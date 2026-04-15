const mongoose = require('mongoose');

const imageUploadSchema = new mongoose.Schema({
  url: { type: String, required: true, trim: true },
  playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  publicId: { type: String, trim: true, default: null },
  provider: { type: String, trim: true, default: 'cloudinary' },
  mimeType: { type: String, trim: true, default: null },
  sizeBytes: { type: Number, default: 0 },
  storagePath: { type: String, trim: true, default: null },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  moderationNote: { type: String, trim: true, default: null }
}, { timestamps: true });

imageUploadSchema.index({ playerId: 1, status: 1, createdAt: -1 });
imageUploadSchema.index({ uploadedBy: 1, createdAt: -1 });
imageUploadSchema.index({ provider: 1, createdAt: -1 });

module.exports = mongoose.model('ImageUpload', imageUploadSchema);
