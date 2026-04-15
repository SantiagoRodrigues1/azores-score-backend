const Notification = require('../../models/Notification');
const FavoriteTeam = require('../../models/FavoriteTeam');
const User = require('../../models/User');

function buildNotificationDedupeKey({ userId, eventKey, referenceId, actionUrl, fingerprint }) {
  const segments = [String(userId || ''), String(eventKey || ''), String(referenceId || ''), String(actionUrl || ''), String(fingerprint || '')]
    .filter(Boolean);

  return segments.length ? segments.join('::') : null;
}

async function processInBatches(items, batchSize, handler) {
  const results = [];

  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize);
    const batchResults = await Promise.all(batch.map(handler));
    results.push(...batchResults);
  }

  return results;
}

async function findExistingUnreadNotification({ userId, title, message, type, actionUrl, referenceId }) {
  return Notification.findOne({
    userId,
    tipo: type,
    titulo: title,
    mensagem: message,
    acaoUrl: actionUrl || null,
    referenciaId: referenceId || null,
    lida: false,
    criadoEm: { $gte: new Date(Date.now() - 12 * 60 * 60 * 1000) }
  });
}

async function createUserNotification({ userId, title, message, type = 'system', eventKey = null, dedupeKey = null, actionUrl, referenceId, meta = {}, payload = null }) {
  const effectiveDedupeKey = dedupeKey || buildNotificationDedupeKey({ userId, eventKey, referenceId, actionUrl, fingerprint: `${title}:${message}` });

  if (effectiveDedupeKey) {
    const existingByDedupeKey = await Notification.findOne({ dedupeKey: effectiveDedupeKey });

    if (existingByDedupeKey) {
      return existingByDedupeKey;
    }
  }

  const existingNotification = await findExistingUnreadNotification({
    userId,
    title,
    message,
    type,
    actionUrl,
    referenceId
  });

  if (existingNotification) {
    return existingNotification;
  }

  return Notification.create({
    userId,
    tipo: type,
    eventKey,
    dedupeKey: effectiveDedupeKey,
    titulo: title,
    mensagem: message,
    descricao: meta.description,
    payload,
    icone: meta.icon || 'info',
    cor: meta.color || 'blue',
    acaoUrl: actionUrl,
    botaoTexto: meta.buttonText,
    referenciaId: referenceId || null
  });
}

async function createRoleNotifications({ role, title, message, type = 'system', eventKey = null, actionUrl, referenceId, meta = {}, payload = null }) {
  const users = await User.find({ role, status: 'active' }).select('_id').lean();

  if (!users.length) {
    return [];
  }

  return processInBatches(users, 50, (user) =>
    createUserNotification({
      userId: user._id,
      title,
      message,
      type,
      eventKey,
      dedupeKey: buildNotificationDedupeKey({ userId: user._id, eventKey, referenceId, actionUrl, fingerprint: `${title}:${message}` }),
      actionUrl,
      referenceId,
      meta,
      payload
    })
  );
}

async function notifyFavoriteTeamFollowers(teamId, trigger, payload) {
  const preferenceField = `notifications.${trigger}`;
  const followers = await FavoriteTeam.find({
    teamId,
    [preferenceField]: true
  });

  if (!followers.length) {
    return;
  }

  await processInBatches(followers, 50, (favorite) =>
    createUserNotification({
      userId: favorite.userId,
      title: payload.title,
      message: payload.message,
      type: payload.type,
      eventKey: payload.eventKey || 'favorite.team_update',
      dedupeKey: buildNotificationDedupeKey({
        userId: favorite.userId,
        eventKey: payload.eventKey || 'favorite.team_update',
        referenceId: payload.referenceId || teamId,
        actionUrl: payload.actionUrl,
        fingerprint: `${trigger}:${payload.title}:${payload.message}`
      }),
      actionUrl: payload.actionUrl,
      referenceId: payload.referenceId,
      meta: payload.meta || {},
      payload: payload.payload || { trigger, teamId: String(teamId) }
    })
  );
}

module.exports = {
  buildNotificationDedupeKey,
  createUserNotification,
  createRoleNotifications,
  notifyFavoriteTeamFollowers
};
