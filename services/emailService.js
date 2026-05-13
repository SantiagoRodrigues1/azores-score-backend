/**
 * emailService.js
 * ────────────────────────────────────────────────────────────────────────────
 * Serviço centralizado de envio de email via SMTP (Gmail ou SMTP genérico).
 *
 * VARIÁVEIS DE AMBIENTE OBRIGATÓRIAS:
 *   EMAIL_USER     – endereço que envia (ex: santiagoescolaprofissional@gmail.com)
 *   EMAIL_PASS     – App Password do Gmail (16 chars, sem espaços)
 *
 * VARIÁVEIS OPCIONAIS (SMTP genérico / outro provider):
 *   SMTP_HOST      – ex: smtp.gmail.com  (default: smtp.gmail.com)
 *   SMTP_PORT      – ex: 587             (default: 587)
 *   SMTP_SECURE    – "true" para SSL/465, "false" para STARTTLS/587 (default: false)
 *   SMTP_FROM_NAME – Nome do remetente   (default: AzoresScore)
 *
 * COMO OBTER APP PASSWORD DO GMAIL:
 *   1. Ativar verificação em dois passos na conta Google
 *   2. Conta Google → Segurança → Palavras-passe de aplicações
 *   3. Criar para "Correio" → copiar os 16 caracteres (sem espaços)
 *   4. Definir EMAIL_PASS=xxxxxxxxxxxx no .env ou no Render Dashboard
 *
 * NO RENDER:
 *   Dashboard → Service → Environment → Add Environment Variable
 *   EMAIL_USER = santiagoescolaprofissional@gmail.com
 *   EMAIL_PASS = (app password de 16 chars)
 * ────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const nodemailer = require('nodemailer');
const logger     = require('../utils/logger');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve o URL público do frontend (para onde o link de verificação aponta).
 * Em produção nunca usa localhost, mesmo que APP_URL aponte para localhost.
 */
function resolveAppUrl() {
  const isProduction = process.env.NODE_ENV === 'production';
  const appUrl   = (process.env.APP_URL   || '').replace(/\/$/, '');
  const frontUrl = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
  const isLocalhost = (u) => /localhost|127\.0\.0\.1/.test(u);

  if (isProduction) {
    if (appUrl  && !isLocalhost(appUrl))   return appUrl;
    if (frontUrl && !isLocalhost(frontUrl)) return frontUrl;
    return 'https://azoresfootballfrontend.onrender.com';
  }
  return appUrl || frontUrl || 'http://localhost:8000';
}

/**
 * Cria um transporter Nodemailer com SMTP explícito (port 587 + STARTTLS).
 * Mais confiável em servidores cloud (Render, Railway…) do que service:'gmail'.
 */
function createTransporter() {
  const host   = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port   = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = process.env.SMTP_SECURE === 'true'; // false = STARTTLS

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    requireTLS: !secure,
    tls: { rejectUnauthorized: process.env.NODE_ENV === 'production' },
    connectionTimeout: 15_000,
    greetingTimeout:   10_000,
    socketTimeout:     30_000,
  });
}

/** Escapa caracteres HTML para evitar injeção no template. */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE HTML — email de verificação de conta
// ─────────────────────────────────────────────────────────────────────────────

function buildVerificationEmailHtml(userName, verifyUrl) {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="pt" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Confirma a tua conta – AzoresScore</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f0f4f8;">
    <tr><td style="padding:40px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:580px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">

        <!-- Cabeçalho -->
        <tr>
          <td style="background:linear-gradient(135deg,#0f4c8a 0%,#1a6fc4 100%);padding:36px 40px;text-align:center;">
            <div style="font-size:40px;margin-bottom:12px;">⚽</div>
            <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:800;">AzoresScore</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.75);font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Futebol Açoriano em Direto</p>
          </td>
        </tr>

        <!-- Corpo -->
        <tr>
          <td style="padding:40px 40px 32px;">
            <h2 style="margin:0 0 8px;color:#1a202c;font-size:22px;font-weight:700;">Olá, ${escapeHtml(userName)}!</h2>
            <p style="margin:0 0 24px;color:#718096;font-size:15px;line-height:1.7;">
              Obrigado por criares a tua conta no <strong style="color:#1a202c;">AzoresScore</strong>.<br/>
              Para ativares a tua conta e teres acesso a todas as funcionalidades, confirma o teu endereço de email.
            </p>

            <!-- Botão CTA -->
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td style="text-align:center;padding:8px 0 32px;">
                  <a href="${verifyUrl}" style="display:inline-block;background:linear-gradient(135deg,#0f4c8a,#1a6fc4);color:#ffffff;text-decoration:none;padding:16px 40px;border-radius:50px;font-size:16px;font-weight:700;box-shadow:0 4px 12px rgba(15,76,138,0.35);">
                    ✅&nbsp; Confirmar a minha conta
                  </a>
                </td>
              </tr>
            </table>

            <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 24px;" />

            <p style="margin:0 0 6px;color:#718096;font-size:13px;">Se o botão não funcionar, copia e cola este link no browser:</p>
            <p style="margin:0 0 24px;word-break:break-all;">
              <a href="${verifyUrl}" style="color:#0f4c8a;font-size:12px;text-decoration:underline;">${verifyUrl}</a>
            </p>

            <!-- Aviso expiração -->
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
              <tr>
                <td style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 18px;">
                  <p style="margin:0;color:#92400e;font-size:13px;line-height:1.6;">
                    ⏳ <strong>Este link expira em 24 horas.</strong><br/>
                    Após esse período, acede à página de login e solicita um novo email de verificação.
                  </p>
                </td>
              </tr>
            </table>

            <p style="margin:0;color:#a0aec0;font-size:12px;line-height:1.6;">
              Se não criaste uma conta no AzoresScore, podes ignorar este email com segurança.
            </p>
          </td>
        </tr>

        <!-- Rodapé -->
        <tr>
          <td style="background:#f7fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
            <p style="margin:0 0 4px;color:#718096;font-size:12px;">© ${year} <strong>AzoresScore</strong> · Futebol Açoriano</p>
            <p style="margin:0;color:#a0aec0;font-size:11px;">Este é um email automático — por favor não respondas diretamente.</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// VERIFICAÇÃO DE CONFIGURAÇÃO — chamada no arranque do servidor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verifica se as credenciais SMTP estão definidas e se é possível abrir ligação.
 * Deve ser chamada em server.js para feedback imediato nos logs do Render.
 * @returns {Promise<boolean>}
 */
async function verifyEmailConfiguration() {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (!user || !pass) {
    logger.warn(
      '[EmailService] ⚠️  EMAIL_USER / EMAIL_PASS não definidos.\n' +
      '  → Verificação de email DESATIVADA (modo bypass ativo).\n' +
      '  → Para ativar, define EMAIL_USER e EMAIL_PASS no Render Dashboard.'
    );
    return false;
  }

  try {
    const transporter = createTransporter();
    await transporter.verify();
    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = process.env.SMTP_PORT || '587';
    logger.info(`[EmailService] ✅ Ligação SMTP verificada — ${user} via ${host}:${port}`);
    return true;
  } catch (err) {
    logger.error(
      `[EmailService] ❌ Falha na verificação SMTP: ${err.message}\n` +
      '  Causas comuns:\n' +
      '  1. EMAIL_PASS incorreta — usa App Password (não a password normal do Gmail)\n' +
      '  2. Verificação em 2 passos desativada na conta Google\n' +
      '  3. Porta 587 bloqueada pelo servidor\n' +
      '  Solução: https://myaccount.google.com/apppasswords'
    );
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNÇÃO PÚBLICA: enviar email de verificação
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Envia o email de verificação de conta ao utilizador recém-registado.
 *
 * @param {string} toEmail      - Email do destinatário
 * @param {string} userName     - Nome do utilizador
 * @param {string} verifyToken  - Token único de verificação (raw, não hasheado)
 * @returns {Promise<void>}
 */
async function sendVerificationEmail(toEmail, userName, verifyToken) {
  const appUrl    = resolveAppUrl();
  const verifyUrl = `${appUrl}/verify-email?token=${encodeURIComponent(verifyToken)}`;
  const fromName  = process.env.SMTP_FROM_NAME || 'AzoresScore';
  const fromEmail = process.env.EMAIL_USER;

  logger.info(`[EmailService] A enviar email de verificação → ${toEmail} | link: ${verifyUrl}`);

  const transporter = createTransporter();

  const info = await transporter.sendMail({
    from:    `"${fromName}" <${fromEmail}>`,
    to:      toEmail,
    subject: '✅ Confirma a tua conta no AzoresScore',
    html:    buildVerificationEmailHtml(userName, verifyUrl),
    text: [
      `Olá, ${userName}!`,
      '',
      'Obrigado por te registares no AzoresScore.',
      'Para ativares a tua conta, acede ao link abaixo (válido 24 horas):',
      '',
      verifyUrl,
      '',
      'Se não criaste esta conta, ignora este email.',
      '',
      '— AzoresScore · Futebol Açoriano',
    ].join('\n'),
  });

  logger.info(`[EmailService] ✅ Email enviado — messageId: ${info.messageId}`);
}

/**
 * Envia email de teste para confirmar que a config SMTP está funcional.
 * Usado pelo endpoint POST /api/admin/test-email (apenas admins).
 *
 * @param {string} toEmail - Email de destino do teste
 * @returns {Promise<object>} info do nodemailer
 */
async function sendTestEmail(toEmail) {
  const fromName  = process.env.SMTP_FROM_NAME || 'AzoresScore';
  const fromEmail = process.env.EMAIL_USER;
  const host      = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port      = process.env.SMTP_PORT || '587';
  const appUrl    = resolveAppUrl();

  const transporter = createTransporter();

  const info = await transporter.sendMail({
    from:    `"${fromName} – Diagnóstico" <${fromEmail}>`,
    to:      toEmail,
    subject: '🔧 Teste SMTP – AzoresScore',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:32px;background:#f0f4f8;border-radius:12px;">
        <h2 style="color:#0f4c8a;margin-top:0;">✅ Configuração SMTP funcional!</h2>
        <p style="color:#4a5568;">O serviço de envio de emails do <strong>AzoresScore</strong> está a funcionar corretamente.</p>
        <table style="margin-top:16px;font-size:13px;color:#718096;border-collapse:collapse;">
          <tr><td style="padding:4px 8px 4px 0;"><b>Servidor:</b></td><td>${host}:${port}</td></tr>
          <tr><td style="padding:4px 8px 4px 0;"><b>Remetente:</b></td><td>${fromEmail}</td></tr>
          <tr><td style="padding:4px 8px 4px 0;"><b>Frontend URL:</b></td><td>${appUrl}</td></tr>
          <tr><td style="padding:4px 8px 4px 0;"><b>Ambiente:</b></td><td>${process.env.NODE_ENV || 'development'}</td></tr>
          <tr><td style="padding:4px 8px 4px 0;"><b>Data:</b></td><td>${new Date().toISOString()}</td></tr>
        </table>
      </div>
    `,
    text: `Config SMTP OK | Servidor: ${host}:${port} | Remetente: ${fromEmail} | Frontend: ${appUrl}`,
  });

  logger.info(`[EmailService] ✅ Email de teste enviado para ${toEmail} — messageId: ${info.messageId}`);
  return info;
}

module.exports = {
  sendVerificationEmail,
  sendTestEmail,
  verifyEmailConfiguration,
  resolveAppUrl,
};
