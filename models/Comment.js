const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  entityType: {
    type: String,
    enum: ['news', 'post'],
    required: true
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  parentCommentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment',
    default: null
  },
  likesCount: {
    type: Number,
    default: 0
  },
  repliesCount: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

commentSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
commentSchema.index({ parentCommentId: 1, createdAt: 1 });

module.exports = mongoose.model('Comment', commentSchema);
