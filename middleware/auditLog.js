// middleware/auditLog.js
const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

/**
 * Middleware para registar ações administrativas
 * Uso: router.post('/path', auditLog('CREATE', 'Club'), handler)
 */
function auditLog(action, entity) {
  return async (req, res, next) => {
    // Intercept response
    const originalSend = res.send;

    res.send = async function (data) {
      try {
        const responseData = typeof data === 'string' ? JSON.parse(data) : data;
        
        if (responseData.success !== false) {
          const entityId = req.params.id || responseData.data?._id;
          const entityName = req.body?.name || req.body?.title || entityId;

          await AuditLog.create({
            action,
            entity,
            entityId,
            entityName,
            userId: req.user?._id,
            userName: req.user?.name,
            userEmail: req.user?.email,
            changes: {
              after: req.body
            },
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
            status: 'SUCCESS'
          });
        }
      } catch (err) {
        logger.error('Erro ao registar audit log', err);
      }

      originalSend.call(this, data);
    };

    next();
  };
}

module.exports = auditLog;
