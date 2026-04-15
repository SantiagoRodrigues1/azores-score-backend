const mongoose = require('mongoose');

const proofSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['link', 'image']
  },
  value: {
    type: String,
    trim: true
  }
}, { _id: false });

const playerSnapshotSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    trim: true
  },
  name: {
    type: String,
    trim: true,
    default: ''
  },
  nome: {
    type: String,
    trim: true,
    default: ''
  },
  numero: {
    type: String,
    trim: true,
    default: ''
  },
  position: {
    type: String,
    trim: true,
    default: ''
  },
  email: {
    type: String,
    trim: true,
    default: ''
  },
  nickname: {
    type: String,
    trim: true,
    default: ''
  },
  team: {
    type: String,
    trim: true,
    default: null
  },
  teamName: {
    type: String,
    trim: true,
    default: null
  },
  photo: {
    type: String,
    trim: true,
    default: null
  },
  image: {
    type: String,
    trim: true,
    default: null
  }
}, { _id: false });

const editRequestSchema = new mongoose.Schema({
  playerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player',
    required: true
  },
  field: {
    type: String,
    enum: ['name', 'numero', 'position', 'email', 'nickname', 'photo'],
    required: true
  },
  oldValue: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  newValue: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  justification: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  proof: {
    type: proofSchema,
    default: null
  },
  playerSnapshot: {
    type: playerSnapshotSchema,
    default: null
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
    default: null,
    maxlength: 500
  },
  reviewedAt: {
    type: Date,
    default: null
  },
  appliedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

editRequestSchema.index({ status: 1, createdAt: -1 });
editRequestSchema.index({ userId: 1, createdAt: -1 });
editRequestSchema.index({ playerId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('EditRequest', editRequestSchema);