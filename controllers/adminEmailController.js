// controllers/adminEmailController.js
// ─────────────────────────────────────────────────────────────────────────────
// Endpoints de diagnóstico do serviço de email (apenas admins).
//
//   GET  /api/admin/email-status  → verifica se SMTP está configurado
//   POST /api/admin/test-email    → envia email de teste para o endereço indicado
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const { sendTestEmail, verifyEmailConfiguration, resolveAppUrl } = require('../services/emailService');
const { canSendVerificationEmails } = require('../services/emailVerificationService');
const logger = require('../utils/logger');

/**
 * GET /api/admin/email-status
 * Retorna o estado atual da configuração de email.
 */
exports.getEmailStatus = async (req, res) => {
  const configured = canSendVerificationEmails();
  const appUrl     = resolveAppUrl();
  const host       = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port       = process.env.SMTP_PORT || '587';

  if (!configured) {
    return res.status(200).json({
      ok:           false,
      configured:   false,
      bypassActive: true,
      message:      'EMAIL_USER / EMAIL_PASS não definidos. Verificação de email desativada.',
      appUrl,
      smtpHost:     host,
      smtpPort:     port,
    });
  }

  // Tenta verificar ligação SMTP em tempo real
  let smtpReachable = false;
  let smtpError     = null;
  try {
    smtpReachable = await verifyEmailConfiguration();
  } catch (err) {
    smtpError = err.message;
  }

  return res.status(200).json({
    ok:           smtpReachable,
    configured:   true,
    bypassActive: false,
    smtpReachable,
    smtpError,
    emailUser:    process.env.EMAIL_USER,
    smtpHost:     host,
    smtpPort:     port,
    appUrl,
    verifyLinkExample: `${appUrl}/verify-email?token=<token>`,
  });
};

/**
 * POST /api/admin/test-email
 * Envia um email de teste para confirmar que o SMTP está funcional.
 * Body: { email: "destino@exemplo.com" }
 */
exports.sendTestEmail = async (req, res) => {
  const { email } = req.body;

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ message: 'Campo "email" inválido ou em falta.' });
  }

  if (!canSendVerificationEmails()) {
    return res.status(503).json({
      message: 'Serviço de email não configurado. Define EMAIL_USER e EMAIL_PASS no Render Dashboard.',
    });
  }

  try {
    const info = await sendTestEmail(email.trim().toLowerCase());
    logger.info(`[AdminEmail] Email de teste enviado para ${email} pelo admin ${req.user?.username || req.user?._id}`);
    return res.status(200).json({
      ok:        true,
      message:   `Email de teste enviado com sucesso para ${email}.`,
      messageId: info.messageId,
    });
  } catch (err) {
    logger.error(`[AdminEmail] Falha ao enviar email de teste: ${err.message}\n${err.stack}`);
    return res.status(500).json({
      ok:      false,
      message: 'Falha ao enviar email de teste.',
      error:   err.message,
      hint: [
        'Verifica se EMAIL_PASS é uma App Password do Gmail (não a password normal).',
        'Confirma que a verificação em 2 passos está ativa na conta Google.',
        'URL: https://myaccount.google.com/apppasswords',
      ],
    });
  }
};
