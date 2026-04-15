/**
 * RefereeProfile Model
 * Armazena dados detalhados de cada árbitro
 */
const mongoose = require('mongoose');

const refereeProfileSchema = new mongoose.Schema({
  // Referência ao utilizador
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },

  // DADOS PESSOAIS
  nomeCompleto: {
    type: String,
    required: true,
    trim: true
  },
  dataNascimento: {
    type: Date,
    required: true
  },
  idade: {
    type: Number,
    min: 18
  },
  telefone: {
    type: String,
    required: true,
    trim: true
  },

  // DADOS DE ARBITRAGEM
  numeroCartaoArbitro: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  federacao: {
    type: String,
    required: true,
    enum: ['FAA', 'FPF', 'Outra'], // Federação Açoreana / Federação Portuguesa
    default: 'FAA'
  },
  regiao: {
    type: String,
    required: true,
    enum: ['São Miguel', 'Terceira', 'Pico', 'São Jorge', 'Graciosa', 'Santa Maria', 'Flores'],
    default: 'São Miguel'
  },
  categoria: {
    type: String,
    required: true,
    enum: ['Distrital', 'Nacional', 'Internacional'],
    default: 'Distrital'
  },
  anosExperiencia: {
    type: Number,
    required: true,
    min: 0
  },

  // DOCUMENTAÇÃO
  documentoURL: {
    type: String // URL do cartão de árbitro (imagem ou PDF)
  },
  documentoType: {
    type: String,
    enum: ['image', 'pdf']
  },
  dataUploadDocumento: {
    type: Date
  },

  // ESTATÍSTICAS
  jogosTotais: {
    type: Number,
    default: 0
  },
  jogosEsteMes: {
    type: Number,
    default: 0
  },
  avaliacaoMedia: {
    type: Number,
    min: 0,
    max: 5,
    default: 0
  },
  relatóriosEnviados: {
    type: Number,
    default: 0
  },

  // DISPONIBILIDADE
  disponibilidadeSemanal: {
    segunda: { type: Boolean, default: true },
    terca: { type: Boolean, default: true },
    quarta: { type: Boolean, default: true },
    quinta: { type: Boolean, default: true },
    sexta: { type: Boolean, default: true },
    sabado: { type: Boolean, default: true },
    domingo: { type: Boolean, default: true }
  },

  // HISTÓRICO
  jogosHistorico: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Match'
  }],

  // TIMESTAMPS
  criadoEm: {
    type: Date,
    default: Date.now
  },
  atualizadoEm: {
    type: Date,
    default: Date.now
  }
});

// Middleware para calcular idade automaticamente
refereeProfileSchema.pre('save', function(next) {
  if (this.dataNascimento) {
    const hoje = new Date();
    let anos = hoje.getFullYear() - this.dataNascimento.getFullYear();
    const mes = hoje.getMonth() - this.dataNascimento.getMonth();
    
    if (mes < 0 || (mes === 0 && hoje.getDate() < this.dataNascimento.getDate())) {
      anos--;
    }
    
    this.idade = anos;
  }
  
  this.atualizadoEm = Date.now();
  next();
});

// Index para pesquisas rápidas
refereeProfileSchema.index({ regiao: 1 });
refereeProfileSchema.index({ categoria: 1 });

module.exports = mongoose.model('RefereeProfile', refereeProfileSchema);
