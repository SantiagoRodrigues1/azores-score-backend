const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { getDefaultPlanForRole } = require('../utils/accessControl');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  username: { type: String, trim: true, unique: true, sparse: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  avatar: { type: String, default: null },
  role: { type: String, enum: ['fan', 'referee', 'club_manager', 'team_manager', 'team_president', 'journalist', 'admin'], default: 'fan' },
  plan: { type: String, enum: ['free', 'club_manager', 'premium'], default: function defaultPlan() { return getDefaultPlanForRole(this.role); } },
  stripeCustomerId: { type: String, default: null, index: true, sparse: true },
  stripeSubscriptionId: { type: String, default: null, index: true, sparse: true },
  subscriptionStatus: {
    type: String,
    enum: ['inactive', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired'],
    default: 'inactive'
  },
  subscriptionCurrentPeriodEnd: { type: Date, default: null },
  status: { type: String, enum: ['active', 'suspended', 'inactive'], default: 'active' },
  
  // SISTEMA DE ÁRBITRO
  refereeStatus: { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' },
  refereeRejectionReason: { type: String }, // Motivo da rejeição
  dataSubmissaoArbitro: { type: Date }, // Data da submissão como árbitro
  dataAprovacaoArbitro: { type: Date }, // Data da aprovação
  dataRejeitadoArbitro: { type: Date }, // Data da rejeição
  
  favoriteTeams: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Club',
      default: null
    }
  ],
  assignedTeam: { type: mongoose.Schema.Types.ObjectId, ref: 'Club', default: null },

  // ──────────────────────────────────────────────
  // VERIFICAÇÃO DE EMAIL
  // emailVerified    : false enquanto não confirmar
  // emailVerifyToken : token único gerado no registo
  // emailVerifyExpires: expiração do token (24h)
  // requiresEmailVerification: true apenas para contas criadas após a feature;
  //   contas antigas ficam com false para não ficarem bloqueadas.
  // ──────────────────────────────────────────────
  emailVerified:               { type: Boolean, default: false },
  emailVerifyToken:            { type: String,  default: null, index: true },
  emailVerifyExpires:          { type: Date,    default: null },
  requiresEmailVerification:   { type: Boolean, default: false },

  preferences: {
    theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' }
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Hash password antes de salvar
userSchema.pre('save', async function() {
  this.updatedAt = new Date();

  if (this.role === 'club_manager' || this.role === 'team_manager' || this.role === 'team_president') {
    if (this.plan === 'free') {
      this.plan = 'club_manager';
    }
  } else if (this.plan === 'club_manager') {
    this.plan = 'free';
  }

  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Comparar password
userSchema.methods.comparePassword = async function(password) {
  return bcrypt.compare(password, this.password);
};

module.exports = mongoose.model('User', userSchema);
