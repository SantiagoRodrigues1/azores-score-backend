// models/Referee.js
const mongoose = require('mongoose');

const refereeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  age: {
    type: Number,
    min: 18,
    max: 100
  },
  association: {
    type: String,
    trim: true,
    default: 'FAA (Federação Açoreana de Futebol)'
  },
  email: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  license: {
    type: String,
    trim: true
  },
  matches: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Match'
  }],
  matchesOfficiated: {
    type: Number,
    default: 0
  },
  yellowCardsGiven: {
    type: Number,
    default: 0
  },
  redCardsGiven: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  },
  photo: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

refereeSchema.index({ name: 1 });
refereeSchema.index({ status: 1 });

module.exports = mongoose.model('Referee', refereeSchema);
