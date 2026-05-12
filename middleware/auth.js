const User = require('../models/User');
const { verifyJwt } = require('../utils/jwt');
const { hasClubManagerAccess, hasPremiumAccess } = require('../utils/accessControl');

async function loadCurrentUser(userId) {
  return User.findById(userId)
    .select('name username email avatar role plan stripeCustomerId stripeSubscriptionId subscriptionStatus subscriptionCurrentPeriodEnd status assignedTeam favoriteTeams preferences refereeStatus createdAt updatedAt')
    .populate('assignedTeam', '_id')
    .lean();
}

/**
 * Verifica token JWT
 */
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: 'Token não fornecido. Autenticação necessária.'
      });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token inválido.'
      });
    }

    const decoded = verifyJwt(token);
    const currentUser = await loadCurrentUser(decoded.id);

    if (!currentUser) {
      return res.status(401).json({
        success: false,
        message: 'Utilizador não encontrado.'
      });
    }

    if (currentUser.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Conta indisponível.'
      });
    }

    req.user = {
      id: String(currentUser._id),
      name: currentUser.name,
      username: currentUser.username || null,
      email: currentUser.email,
      avatar: currentUser.avatar || null,
      role: currentUser.role,
      plan: currentUser.plan,
      stripeCustomerId: currentUser.stripeCustomerId || null,
      stripeSubscriptionId: currentUser.stripeSubscriptionId || null,
      subscriptionStatus: currentUser.subscriptionStatus || 'inactive',
      subscriptionCurrentPeriodEnd: currentUser.subscriptionCurrentPeriodEnd || null,
      assignedTeam: currentUser.assignedTeam?._id ? String(currentUser.assignedTeam._id) : currentUser.assignedTeam ? String(currentUser.assignedTeam) : null,
      favoriteTeams: currentUser.favoriteTeams || [],
      preferences: currentUser.preferences || { theme: 'system' },
      refereeStatus: currentUser.refereeStatus || 'none',
      createdAt: currentUser.createdAt,
      updatedAt: currentUser.updatedAt,
      auth: decoded
    };

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Token inválido ou expirado'
    });
  }
};

/**
 * Verifica se o utilizador é admin
 */
const verifyAdmin = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Utilizador não autenticado'
      });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado. Apenas administradores podem aceder este recurso.'
      });
    }

    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Erro na verificação de permissões'
    });
  }
};

/**
 * Verifica permissões por role
 */
const verifyRole = (requiredRoles = []) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Utilizador não autenticado'
        });
      }

      if (!requiredRoles.includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: `Acesso negado. Papéis necessários: ${requiredRoles.join(', ')}`
        });
      }

      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Erro na verificação de papéis'
      });
    }
  };
};

const requireAuth = verifyToken;

const requireClubManager = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Utilizador não autenticado' });
    }

    if (!hasClubManagerAccess(req.user)) {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado. Requer perfil de Club Manager.'
      });
    }

    next();
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Erro na verificação do perfil de club manager' });
  }
};

// Allows approved referees OR club managers to control live match state
const requireRefereeOrClubManager = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Utilizador não autenticado' });
    }
    const isReferee = req.user.role === 'referee' && req.user.refereeStatus === 'approved';
    if (!isReferee && !hasClubManagerAccess(req.user)) {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado. Requer árbitro aprovado ou club manager.'
      });
    }
    next();
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Erro na verificação de acesso' });
  }
};

const requirePremium = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Utilizador não autenticado' });
    }

    if (!hasPremiumAccess(req.user)) {
      return res.status(403).json({
        success: false,
        code: 'PREMIUM_REQUIRED',
        message: 'Esta funcionalidade requer uma subscrição Premium ativa.'
      });
    }

    next();
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Erro na verificação do plano premium' });
  }
};

module.exports = {
  requireAuth,
  requireClubManager,
  requireRefereeOrClubManager,
  requirePremium,
  verifyToken,
  verifyAdmin,
  verifyRole
};
