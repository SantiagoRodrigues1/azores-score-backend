// models/Competition.js
const mongoose = require('mongoose');

const competitionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  season: {
    type: String,
    required: true,
    match: /^\d{4}\/\d{4}$/,
    default: `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`
  },
  type: {
    type: String,
    enum: ['league', 'cup', 'tournament'],
    default: 'league'
  },
  description: {
    type: String,
    trim: true
  },
  teams: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Club'
  }],
  startDate: {
    type: Date
  },
  endDate: {
    type: Date
  },
  status: {
    type: String,
    enum: ['planning', 'active', 'finished'],
    default: 'planning'
  },
  standings: [{
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Club'
    },
    points: { type: Number, default: 0 },
    played: { type: Number, default: 0 },
    won: { type: Number, default: 0 },
    draw: { type: Number, default: 0 },
    lost: { type: Number, default: 0 },
    goalsFor: { type: Number, default: 0 },
    goalsAgainst: { type: Number, default: 0 }
  }],
  rules: {
    matchFormat: { type: String, default: '2x45' },
    pointsForWin: { type: Number, default: 3 },
    pointsForDraw: { type: Number, default: 1 }
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

competitionSchema.index({ name: 1, season: 1 });
competitionSchema.index({ status: 1 });

module.exports = mongoose.model('Competition', competitionSchema);
