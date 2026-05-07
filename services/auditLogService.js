const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

async function writeAuditLog({
  action,
  entity,
  entityId = null,
  entityName = null,
  user,
  before = null,
  after = null,
  requestMeta = {},
  description = null,
  status = 'SUCCESS'
}) {
  const userId = user?.id || user?._id;
  if (!userId) {
    return null;
  }

  try {
    return await AuditLog.create({
      action,
      entity,
      entityId: entityId ? String(entityId) : null,
      entityName: entityName || null,
      userId,
      userName: user?.name || null,
      userEmail: user?.email || null,
      changes: {
        before,
        after
      },
      ipAddress: requestMeta.ipAddress || null,
      userAgent: requestMeta.userAgent || null,
      description: description || null,
      status
    });
  } catch (error) {
    logger.error('Erro ao registar audit log', error);
    return null;
  }
}

module.exports = {
  writeAuditLog
};