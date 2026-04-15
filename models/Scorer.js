// models/Scorer.js
const mongoose = require('mongoose');

const scorerSchema = new mongoose.Schema({
  // Referência ao jogador (recomendado)
  player: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player',
    required: true
  },

  // Alternativa caso não queiras usar populate / ref:
  // playerName: { type: String, required: true, trim: true },

  league: {
    type: String,
    required: true,
    trim: true
    // ex: "Campeonato de Futebol dos Açores", "Liga Regional Ilha Terceira", etc.
  },

  season: {
    type: String,
    required: true,
    trim: true
    // ex: "2025/2026", "2025"
  },

  team: {
    type: String,
    trim: true
    // ex: "Madalena FC", "Angra do Heroísmo", ...
    // Alternativa: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' }
  },

  goals: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },

  // Campos opcionais mas úteis para uma tabela de artilharia mais rica
  matchesPlayed: {
    type: Number,
    default: 0,
    min: 0
  },

  minutesPlayed: {
    type: Number,
    default: 0,
    min: 0
  },

  penalties: {
    type: Number,
    default: 0,
    min: 0
  },

  // Para ordenação / desempate (muito usado em competições reais)
  goalsPerMatch: {
    type: Number,
    default: function() {
      return this.matchesPlayed > 0 ? this.goals / this.matchesPlayed : 0;
    }
  },

  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,          // cria createdAt e updatedAt automaticamente
});

// Índice composto → evita duplicados e acelera as consultas mais comuns
scorerSchema.index({ player: 1, league: 1, season: 1 }, { unique: true });

// Índice para ordenação rápida da tabela de artilharia
scorerSchema.index({ league: 1, season: 1, goals: -1, goalsPerMatch: -1 });

// Opcional: virtual para mostrar o nome do jogador quando fizeres populate
scorerSchema.virtual('playerInfo', {
  ref: 'Player',
  localField: 'player',
  foreignField: '_id',
  justOne: true
});

module.exports = mongoose.model('Scorer', scorerSchema);