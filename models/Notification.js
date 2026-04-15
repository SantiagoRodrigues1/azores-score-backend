/**
 * Notification Model
 * Sistema de notificações para árbitros e admins
 */
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  // Destinatário
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // TIPO DE NOTIFICAÇÃO
  tipo: {
    type: String,
    required: true
  },
  eventKey: {
    type: String,
    default: null,
    index: true
  },
  dedupeKey: {
    type: String,
    default: null,
    unique: true,
    sparse: true,
    index: true
  },

  // CONTEÚDO
  titulo: {
    type: String,
    required: true
  },
  mensagem: {
    type: String,
    required: true
  },
  descricao: {
    type: String,
    maxlength: 500
  },
  payload: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },

  // DADOS RELACIONADOS
  refereeProfileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RefereeProfile'
  },
  matchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Match'
  },
  matchReportId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MatchReport'
  },
  referenciaId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },

  // ÍCONE E CORES
  icone: { type: String, default: 'info' }, // info, success, warning, error, etc
  cor: { type: String, default: 'blue' }, // blue, green, yellow, red

  // STATUS
  lida: {
    type: Boolean,
    default: false
  },
  dataLeitura: {
    type: Date
  },

  // AÇÃO RECOMENDADA
  acaoUrl: { type: String }, // URL para a ação (ex: /referee/match/123)
  botaoTexto: { type: String }, // Texto do botão (ex: "Ver Jogo")

  // TIMESTAMPS
  criadoEm: {
    type: Date,
    default: Date.now
  },
  expiraEm: {
    type: Date // Para notificações que expiram (ex: depois de 30 dias)
  }
});

// Index para pesquisas rápidas
notificationSchema.index({ userId: 1, lida: 1 });
notificationSchema.index({ userId: 1, criadoEm: -1 });
notificationSchema.index({ tipo: 1 });
notificationSchema.index({ eventKey: 1, userId: 1, criadoEm: -1 });
notificationSchema.index({ referenciaId: 1 });
notificationSchema.index({ expiraEm: 1 }); // TTL index para limpeza automática

module.exports = mongoose.model('Notification', notificationSchema);
