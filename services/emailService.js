/**
 * emailService.js
 * ───────────────────────────────────────────────────────────────
 * Serviço centralizado de envio de email via SMTP (Gmail).
 *
 * Variáveis de ambiente necessárias (.env):
 *   EMAIL_USER     – endereço Gmail que envia (ex: santiagoescolaprofissional@gmail.com)
 *   EMAIL_PASS     – App Password do Gmail (não a password normal)
 *   APP_URL        – URL base da aplicação (ex: http://localhost:8001)
 *
 * Para obter uma App Password do Gmail:
 *   1. Activar verificação em dois passos na conta Google
 *   2. Ir a Conta Google → Segurança → Palavras-passe de aplicações
 *   3. Gerar uma palavra-passe para "Mail" / "Windows"
 * ───────────────────────────────────────────────────────────────
 */

const nodemailer = require('nodemailer');

// ──────────────────────────────────────────────────────────────
// TRANSPORTER — ligação autenticada ao Gmail via SMTP
// ──────────────────────────────────────────────────────────────
function createTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,  // remetente
      pass: process.env.EMAIL_PASS,  // App Password (não a password normal)
    },
  });
}

// ──────────────────────────────────────────────────────────────
// TEMPLATE HTML — email de verificação de conta
// ──────────────────────────────────────────────────────────────
function buildVerificationEmailHtml(userName, verifyUrl) {
  return `
<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Confirme a sua conta – AzoresScore</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:8px;overflow:hidden;
                      box-shadow:0 2px 8px rgba(0,0,0,0.08);">

          <!-- Cabeçalho com cor do projeto -->
          <tr>
            <td style="background:#0f4c8a;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;letter-spacing:1px;">
                ⚽ AzoresScore
              </h1>
              <p style="margin:6px 0 0;color:#a8c8f0;font-size:13px;">
                Futebol Açoriano em Direto
              </p>
            </td>
          </tr>

          <!-- Corpo da mensagem -->
          <tr>
            <td style="padding:40px 40px 24px;">
              <h2 style="margin:0 0 16px;color:#1a1a2e;font-size:20px;">
                Olá, ${userName}!
              </h2>
              <p style="margin:0 0 16px;color:#4a4a6a;font-size:15px;line-height:1.6;">
                Obrigado por te registares no <strong>AzoresScore</strong>.
                Para activarmos a tua conta e teres acesso a todas as funcionalidades,
                precisamos de confirmar o teu endereço de email.
              </p>
              <p style="margin:0 0 28px;color:#4a4a6a;font-size:15px;line-height:1.6;">
                Clica no botão abaixo para confirmar a tua conta:
              </p>

              <!-- Botão de verificação -->
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center">
                    <a href="${verifyUrl}"
                       style="display:inline-block;background:#0f4c8a;color:#ffffff;
                              text-decoration:none;padding:14px 36px;border-radius:6px;
                              font-size:15px;font-weight:bold;letter-spacing:0.5px;">
                      ✅ Confirmar a minha conta
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:28px 0 8px;color:#6b6b8a;font-size:13px;line-height:1.6;">
                Se o botão não funcionar, copia e cola o link abaixo no teu browser:
              </p>
              <p style="margin:0 0 24px;word-break:break-all;">
                <a href="${verifyUrl}" style="color:#0f4c8a;font-size:13px;">${verifyUrl}</a>
              </p>

              <!-- Aviso de expiração -->
              <div style="background:#fff8e1;border-left:4px solid #f5a623;
                          padding:14px 16px;border-radius:4px;margin-bottom:24px;">
                <p style="margin:0;color:#7a5c00;font-size:13px;">
                  ⚠️ Este link é válido durante <strong>24 horas</strong>.
                  Após esse período, será necessário solicitar um novo email de verificação.
                </p>
              </div>

              <p style="margin:0;color:#6b6b8a;font-size:13px;line-height:1.6;">
                Se não criaste uma conta no AzoresScore, podes ignorar este email com segurança.
              </p>
            </td>
          </tr>

          <!-- Rodapé -->
          <tr>
            <td style="background:#f4f4f7;padding:20px 40px;text-align:center;
                       border-top:1px solid #e0e0e8;">
              <p style="margin:0;color:#9999aa;font-size:12px;">
                © ${new Date().getFullYear()} AzoresScore · Futebol Açoriano<br/>
                Este é um email automático — por favor não respondas diretamente.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

// ──────────────────────────────────────────────────────────────
// FUNÇÃO PÚBLICA: enviar email de verificação
// ──────────────────────────────────────────────────────────────
/**
 * Envia o email de verificação de conta ao utilizador recém-registado.
 *
 * @param {string} toEmail      - Email do destinatário
 * @param {string} userName     - Nome do utilizador (para personalizar a mensagem)
 * @param {string} verifyToken  - Token único de verificação
 * @returns {Promise<void>}
 */
async function sendVerificationEmail(toEmail, userName, verifyToken) {
  const appUrl = (process.env.APP_URL || 'http://localhost:8001').replace(/\/$/, '');
  const verifyUrl = `${appUrl}/verify-email?token=${encodeURIComponent(verifyToken)}`;

  const transporter = createTransporter();

  const mailOptions = {
    from: `"AzoresScore" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: '✅ Confirma a tua conta no AzoresScore',
    html: buildVerificationEmailHtml(userName, verifyUrl),
    // Versão texto simples (fallback para clientes sem HTML)
    text: [
      `Olá, ${userName}!`,
      '',
      'Obrigado por te registares no AzoresScore.',
      'Para activares a tua conta, clica no link abaixo (válido 24 horas):',
      '',
      verifyUrl,
      '',
      'Se não criaste esta conta, ignora este email.',
      '',
      '— AzoresScore · Futebol Açoriano',
    ].join('\n'),
  };

  await transporter.sendMail(mailOptions);
}

module.exports = { sendVerificationEmail };
