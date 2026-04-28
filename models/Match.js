// models/Match.js
const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['goal', 'yellow_card', 'red_card', 'substitution', 'own_goal'],
    required: true
  },
  player: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  assistedBy: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  playerIn: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  playerOut: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  minute: {
    type: Number,
    min: 0,
    max: 120
  },
  team: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Club',
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const matchSchema = new mongoose.Schema({
  homeTeam: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Club',
    required: true
  },
  awayTeam: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Club',
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  time: {
    type: String,
    match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
  },
  competition: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Competition'
  },
  stadium: {
    type: String,
    trim: true
  },
  referees: {
    main: { type: mongoose.Schema.Types.ObjectId, ref: 'Referee', default: null },
    assistant1: { type: mongoose.Schema.Types.ObjectId, ref: 'Referee', default: null },
    assistant2: { type: mongoose.Schema.Types.ObjectId, ref: 'Referee', default: null },
    fourthReferee: { type: mongoose.Schema.Types.ObjectId, ref: 'Referee', default: null }
  },
  refereeTeam: [{
    referee: { type: mongoose.Schema.Types.ObjectId, ref: 'Referee', required: true },
    tipo: { type: String, required: true }
  }],
  status: {
    type: String,
    enum: ['scheduled', 'live', 'halftime', 'second_half', 'finished', 'postponed', 'cancelled'],
    default: 'scheduled'
  },
  homeScore: {
    type: Number,
    default: 0,
    min: 0
  },
  awayScore: {
    type: Number,
    default: 0,
    min: 0
  },
  referee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Referee'
  },
  managerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  events: [eventSchema],
  attendance: {
    type: Number,
    min: 0
  },
  notes: {
    type: String,
    trim: true
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

// Índices
matchSchema.index({ date: 1 });
matchSchema.index({ status: 1 });
matchSchema.index({ homeTeam: 1, awayTeam: 1 });
matchSchema.index({ competition: 1 });
matchSchema.index({ 'refereeTeam.referee': 1 });

module.exports = mongoose.model('Match', matchSchema);
