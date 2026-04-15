const mongoose = require('mongoose');

const socialPostSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true, trim: true, maxlength: 1200 },
  image: { type: String, trim: true, default: null },
  likesCount: { type: Number, default: 0 },
  commentsCount: { type: Number, default: 0 },
  reportsCount: { type: Number, default: 0 }
}, { timestamps: true });

socialPostSchema.index({ createdAt: -1 });

module.exports = mongoose.model('SocialPost', socialPostSchema);
