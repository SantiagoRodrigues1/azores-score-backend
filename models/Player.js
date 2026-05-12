// models/Player.js
const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  nome: {
    type: String,
    trim: true
  },
  numero: {
    type: String,
    trim: true
  },
  nickname: {
    type: String,
    trim: true
  },
  email: {
    type: String,
    lowercase: true,
    trim: true,
    sparse: true
  },
  team: {
    type: String,
    trim: true
  },
  position: {
    type: String,
    enum: ['Guarda-redes', 'Defesa Central', 'Lateral Esquerdo', 'Lateral Direito', 'Médio Defensivo', 'Médio', 'Médio Ofensivo', 'Extremo Esquerdo', 'Extremo Direito', 'Avançado', 'Outro'],
    default: 'Outro'
  },
  goals: {
    type: Number,
    default: 0
  },
  assists: {
    type: Number,
    default: 0
  },
  photo: {
    type: String,
    default: null
  },
  image: {
    type: String,
    default: null
  },
  age: {
    type: Number,
    default: null
  },
  nationality: {
    type: String,
    trim: true,
    default: null
  },
  height: {
    type: Number, // cm
    default: null
  },
  weight: {
    type: Number, // kg
    default: null
  },
  preferredFoot: {
    type: String,
    enum: ['right', 'left', 'both', null],
    default: null
  },
  viewsCount: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Índices (opcional mas recomendado)
playerSchema.index({ name: 'text', nickname: 'text', nome: 'text' });
playerSchema.index({ team: 1, numero: 1 }, { unique: false });
playerSchema.index({ team: 1, createdAt: -1 });

module.exports = mongoose.model('Player', playerSchema);