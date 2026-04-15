const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['player', 'team', 'match', 'image'],
    required: true
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  reviewNote: {
    type: String,
    trim: true,
    default: null
  },
  materializedEntityType: {
    type: String,
    enum: ['player', 'team', 'match', 'image', null],
    default: null
  },
  materializedEntityId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  materializedAt: {
    type: Date,
    default: null
  },
  validationVersion: {
    type: Number,
    default: 1
  }
}, { timestamps: true });

submissionSchema.index({ userId: 1, createdAt: -1 });
submissionSchema.index({ status: 1, type: 1, createdAt: -1 });

module.exports = mongoose.model('Submission', submissionSchema);
