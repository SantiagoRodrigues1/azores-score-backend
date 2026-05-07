const EditRequest = require('../models/EditRequest');
const { writeAuditLog } = require('./auditLogService');

function buildPlayerSnapshot(player) {
  if (!player) {
    return null;
  }

  return {
    id: String(player._id || player.id || ''),
    name: player.name || player.nome || '',
    nome: player.nome || player.name || '',
    numero: player.numero !== undefined && player.numero !== null ? String(player.numero) : '',
    position: player.position || player.posicao || 'Outro',
    email: player.email || '',
    nickname: player.nickname || '',
    team: player.team ? String(player.team) : null,
    photo: player.photo || player.image || null,
    image: player.image || player.photo || null
  };
}

async function closePendingEditRequestsForPlayer(playerId, adminUserId, reviewNote) {
  if (!playerId || !adminUserId) {
    return 0;
  }

  const result = await EditRequest.updateMany(
    { playerId, status: 'pending' },
    {
      $set: {
        status: 'rejected',
        reviewNote,
        reviewedBy: adminUserId,
        reviewedAt: new Date()
      }
    }
  );

  return result.modifiedCount || 0;
}

async function recordAdminPlayerAudit({ action, actor, before = null, after = null, requestMeta = {}, description = null }) {
  const target = after || before;

  if (!target) {
    return null;
  }

  return writeAuditLog({
    action,
    entity: 'Player',
    entityId: target._id || target.id,
    entityName: target.name || target.nome || null,
    user: actor,
    before: buildPlayerSnapshot(before),
    after: buildPlayerSnapshot(after),
    requestMeta,
    description
  });
}

module.exports = {
  buildPlayerSnapshot,
  closePendingEditRequestsForPlayer,
  recordAdminPlayerAudit
};