const CLUB_MANAGER_ROLES = new Set(['club_manager', 'team_manager']);
const PREMIUM_ACTIVE_STATUSES = new Set(['active', 'trialing', 'past_due']);

function isClubManagerRole(role) {
  return CLUB_MANAGER_ROLES.has(String(role || ''));
}

function normalizeRole(role) {
  if (isClubManagerRole(role)) {
    return 'club_manager';
  }

  return String(role || 'fan');
}

function getDefaultPlanForRole(role) {
  return isClubManagerRole(role) ? 'club_manager' : 'free';
}

function resolveUserPlan(user) {
  if (!user) {
    return 'free';
  }

  if (user.plan === 'premium') {
    return 'premium';
  }

  if (user.plan === 'club_manager' || isClubManagerRole(user.role)) {
    return 'club_manager';
  }

  return 'free';
}

function hasPremiumAccess(user) {
  if (!user) {
    return false;
  }

  if (user.role === 'admin') {
    return true;
  }

  return resolveUserPlan(user) === 'premium' && PREMIUM_ACTIVE_STATUSES.has(String(user.subscriptionStatus || 'inactive'));
}

function hasClubManagerAccess(user) {
  if (!user) {
    return false;
  }

  return user.role === 'admin' || isClubManagerRole(user.role);
}

function serializeUser(user) {
  if (!user) {
    return null;
  }

  const assignedTeam = user.assignedTeam && typeof user.assignedTeam === 'object'
    ? user.assignedTeam._id || user.assignedTeam.id || user.assignedTeam
    : user.assignedTeam || null;

  return {
    id: user._id || user.id,
    name: user.name,
    username: user.username || null,
    avatar: user.avatar || null,
    email: user.email,
    role: user.role,
    normalizedRole: normalizeRole(user.role),
    plan: resolveUserPlan(user),
    stripeCustomerId: user.stripeCustomerId || null,
    stripeSubscriptionId: user.stripeSubscriptionId || null,
    subscriptionStatus: user.subscriptionStatus || 'inactive',
    subscriptionCurrentPeriodEnd: user.subscriptionCurrentPeriodEnd || null,
    refereeStatus: user.refereeStatus || 'none',
    assignedTeam: assignedTeam ? String(assignedTeam) : null,
    favoriteTeams: user.favoriteTeams || [],
    preferences: user.preferences || { theme: 'system' },
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

module.exports = {
  CLUB_MANAGER_ROLES,
  PREMIUM_ACTIVE_STATUSES,
  getDefaultPlanForRole,
  hasClubManagerAccess,
  hasPremiumAccess,
  isClubManagerRole,
  normalizeRole,
  resolveUserPlan,
  serializeUser
};