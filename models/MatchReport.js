/**
 * MatchReport Model
 * Relatórios pós-jogo dos árbitros
 */
const mongoose = require('mongoose');

const matchReportSchema = new mongoose.Schema({
  // Referências
  matchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Match',
    required: true
  },
  refereeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RefereeProfile',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // CONTEÚDO DO RELATÓRIO
  comentario: {
    type: String,
    maxlength: 5000,
    trim: true
  },
  
  // FICHEIRO
  pdfURL: {
    type: String // URL do PDF do relatório
  },
  imagenURL: [{
    type: String // URLs de imagens adicionais
  }],

  // AVALIAÇÃO DO ÁRBITRO (por admin)
  avaliacao: {
    type: Number,
    min: 0,
    max: 5,
    default: null
  },
  comentarioAdmin: {
    type: String,
    maxlength: 2000,
    trim: true
  },

  // STATUS
  status: {
    type: String,
    enum: ['enviado', 'recebido', 'revisado', 'aprovado', 'rejeitado'],
    default: 'enviado'
  },

  // INCIDENTES (campos opcionais para destaque de eventos)
  cartõesAmarelos: { type: Number, default: 0 },
  cartõesVermelhos: { type: Number, default: 0 },
  penalidades: { type: Number, default: 0 },

  // TIMESTAMPS
  dataEnvio: {
    type: Date,
    default: Date.now
  },
  dataRecebimento: {
    type: Date
  },
  dataRevisao: {
    type: Date
  },
  criadoEm: {
    type: Date,
    default: Date.now
  },
  atualizadoEm: {
    type: Date,
    default: Date.now
  }
});

// Index para pesquisas rápidas
matchReportSchema.index({ matchId: 1 });
matchReportSchema.index({ refereeId: 1 });
matchReportSchema.index({ userId: 1 });
matchReportSchema.index({ status: 1 });
matchReportSchema.index({ dataEnvio: -1 });

module.exports = mongoose.model('MatchReport', matchReportSchema);
