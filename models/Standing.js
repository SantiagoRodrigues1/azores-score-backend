// models/Standing.js
const mongoose = require('mongoose');

const standingSchema = new mongoose.Schema({
  // Campos principais da classificação (ajusta conforme precisares)
  league: {
    type: String,
    required: true,
    trim: true,
    // ex: "Campeonato dos Açores", "Liga Meo Azores", etc.
  },
  season: {
    type: String,
    required: true,
    // ex: "2025/2026"
  },
  team: {
    type: String,
    required: true,
    trim: true,
  },
  // Ou se preferires referenciar um modelo Team existente:
  // team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },

  position: {
    type: Number,
    required: true,
    min: 1,
  },
  played: {
    type: Number,
    default: 0,
  },
  won: {
    type: Number,
    default: 0,
  },
  drawn: {
    type: Number,
    default: 0,
  },
  lost: {
    type: Number,
    default: 0,
  },
  goalsFor: {
    type: Number,
    default: 0,
  },
  goalsAgainst: {
    type: Number,
    default: 0,
  },
  goalDifference: {
    type: Number,
    default: 0,
  },
  points: {
    type: Number,
    default: 0,
  },
  // Útil para saber quando foi atualizado (ex: após inserir resultado)
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
}, {
  // Cria índice composto para evitar duplicados e acelerar buscas
  timestamps: true,
});

standingSchema.index({ league: 1, season: 1, team: 1 }, { unique: true });

module.exports = mongoose.model('Standing', standingSchema);