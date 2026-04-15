const mongoose = require('mongoose');

const newsSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 160 },
  content: { type: String, required: true, trim: true },
  image: { type: String, trim: true, default: null },
  category: { type: String, required: true, trim: true, maxlength: 60 },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  likesCount: { type: Number, default: 0 },
  commentsCount: { type: Number, default: 0 },
  viewsCount: { type: Number, default: 0 },
  tags: [{ type: String, trim: true }]
}, { timestamps: true });

newsSchema.index({ createdAt: -1 });
newsSchema.index({ category: 1, createdAt: -1 });
newsSchema.index({ title: 'text', content: 'text', category: 'text' });

module.exports = mongoose.model('News', newsSchema);
