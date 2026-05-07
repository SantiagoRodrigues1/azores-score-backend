// middleware/auditLog.js
const { writeAuditLog } = require('../services/auditLogService');

/**
 * Middleware para registar ações administrativas
 * Uso: router.post('/path', auditLog('CREATE', 'Club'), handler)
 */
function auditLog(action, entity) {
  return async (req, res, next) => {
    const originalSend = res.send;

    res.send = async function (data) {
      try {
        const responseData = typeof data === 'string' ? JSON.parse(data) : data;
        
        if (responseData.success !== false) {
          const entityId = req.params.id || responseData.data?._id;
          const entityName = req.body?.name || req.body?.title || entityId;

          await writeAuditLog({
            action,
            entity,
            entityId,
            entityName,
            user: req.user,
            after: req.body,
            requestMeta: {
              ipAddress: req.ip,
              userAgent: req.get('user-agent')
            },
          });
        }
      } catch (_error) {
        // Ignore audit failures to avoid blocking successful responses.
      }

      originalSend.call(this, data);
    };

    next();
  };
}

module.exports = auditLog;
