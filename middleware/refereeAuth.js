/**
 * refereeAuth.js
 * Middleware para autenticação de árbitros
 */
const User = require('../models/User');
const { verifyJwt } = require('../utils/jwt');

async function loadAuthenticatedUser(userId) {
  return User.findById(userId)
    .select('name email role status assignedTeam favoriteTeams preferences stripeCustomerId stripeSubscriptionId subscriptionStatus subscriptionCurrentPeriodEnd refereeStatus refereeRejectionReason createdAt updatedAt')
    .lean();
}

/**
 * Verificar JWT Token
 */
exports.verifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Token não fornecido' });
    }

    const decoded = verifyJwt(token);
    const user = await loadAuthenticatedUser(decoded.id);

    if (!user) {
      return res.status(404).json({ error: 'Utilizador não encontrado' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Conta indisponível' });
    }

    req.user = {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
      assignedTeam: user.assignedTeam ? String(user.assignedTeam) : null,
      favoriteTeams: user.favoriteTeams || [],
      preferences: user.preferences || { theme: 'system' },
      stripeCustomerId: user.stripeCustomerId || null,
      stripeSubscriptionId: user.stripeSubscriptionId || null,
      subscriptionStatus: user.subscriptionStatus || 'inactive',
      subscriptionCurrentPeriodEnd: user.subscriptionCurrentPeriodEnd || null,
      refereeStatus: user.refereeStatus || 'none',
      refereeRejectionReason: user.refereeRejectionReason || null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      auth: decoded
    };
    next();

  } catch (error) {
    return res.status(401).json({ error: 'Token inválido' });
  }
};

/**
 * Verificar se é árbitro
 */
exports.isReferee = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Token não fornecido' });
    }

    if (req.user.role !== 'referee') {
      return res.status(403).json({ error: 'Acesso apenas para árbitros' });
    }

    next();

  } catch (error) {
    res.status(500).json({ error: 'Erro ao verificar role' });
  }
};

/**
 * Verificar se conta está aprovada
 * (Permite login mas notifica se pendente)
 */
exports.checkRefereeStatus = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Token não fornecido' });
    }

    if (req.user.refereeStatus === 'rejected') {
      return res.status(403).json({
        error: 'Conta de árbitro foi rejeitada',
        refusedReason: req.user.refereeRejectionReason,
        status: 'rejected'
      });
    }

    next();

  } catch (error) {
    res.status(500).json({ error: 'Erro ao verificar status de árbitro' });
  }
};

/**
 * Verificar se conta está aprovada (acesso completo apenas)
 */
exports.requireApprovedReferee = async (req, res, next) => {
  try {
    if (!req.user || req.user.refereeStatus !== 'approved') {
      return res.status(403).json({
        error: 'Acesso restrito. Aguarde aprovação do administrador.',
        status: req.user?.refereeStatus || 'unknown'
      });
    }

    next();

  } catch (error) {
    res.status(500).json({ error: 'Erro ao verificar status' });
  }
};

/**
 * Verificar se é admin
 */
exports.isAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Token não fornecido' });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso apenas para administradores' });
    }

    next();

  } catch (error) {
    res.status(500).json({ error: 'Erro ao verificar permissões' });
  }
};

/**
 * Verificar se é árbitro ou admin
 */
exports.isRefereeOrAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Token não fornecido' });
    }

    if (!['referee', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Acesso restrito' });
    }

    next();

  } catch (error) {
    res.status(500).json({ error: 'Erro ao verificar permissões' });
  }
};
