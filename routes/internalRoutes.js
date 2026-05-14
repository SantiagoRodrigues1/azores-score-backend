"use strict";

const express = require('express');
const router = express.Router();
const { sendTestEmail, verifyEmailConfiguration } = require('../services/emailService');
const logger = require('../utils/logger');

/**
 * POST /internal/test-email
 * Headers: { 'x-internal-secret': process.env.INTERNAL_TEST_EMAIL_SECRET }
 * Body: { email: string }
 *
 * Endpoint de diagnóstico rápido para testar SMTP em deploys onde o painel admin
 * não está acessível. Protegido por uma secret definida em env var.
 */
router.post('/test-email', async (req, res) => {
  try {
    const provided = req.headers['x-internal-secret'];
    const expected = process.env.INTERNAL_TEST_EMAIL_SECRET;

    if (!expected) {
      return res.status(503).json({ ok: false, message: 'Internal test secret não configurada.' });
    }
    if (!provided || provided !== expected) {
      return res.status(401).json({ ok: false, message: 'Unauthorized' });
    }

    const { email } = req.body || {};
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ ok: false, message: 'Campo "email" inválido.' });
    }

    // Verifica configuração SMTP antes de tentar enviar
    const ok = await verifyEmailConfiguration();
    if (!ok) {
      return res.status(503).json({ ok: false, message: 'SMTP não alcançável. Verifica logs do servidor.' });
    }

    const info = await sendTestEmail(email.trim().toLowerCase());
    return res.status(200).json({ ok: true, message: `Email de teste enviado para ${email}.`, messageId: info.messageId });
  } catch (err) {
    logger.error('[InternalRoutes] Falha em /internal/test-email: ' + (err && err.stack || err));
    return res.status(500).json({ ok: false, message: 'Erro interno ao enviar email de teste.', error: err && err.message });
  }
});

module.exports = router;
