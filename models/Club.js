// models/Club.js
const mongoose = require('mongoose');

const clubSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  island: {
    type: String,
    enum: ['São Miguel', 'Terceira', 'Faial', 'Pico', 'São Jorge', 'Graciosa', 'Flores', 'Corvo', 'Açores'],
    default: 'Açores'
  },
  stadium: {
    type: String,
    trim: true
  },
  foundedYear: {
    type: Number,
    min: 1800,
    max: new Date().getFullYear()
  },
  description: {
    type: String,
    trim: true
  },
  logo: {
    type: String,
    default: '⚽'
  },
  colors: {
    primary: { type: String, default: '#3b82f6' },
    secondary: { type: String, default: '#ffffff' }
  },
  players: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player'
  }],
  viewsCount: {
    type: Number,
    default: 0
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

// Índices para performance
clubSchema.index({ island: 1 });

module.exports = mongoose.model('Club', clubSchema);
