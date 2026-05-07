const crypto = require('crypto');

const DEFAULT_TTL_HOURS = 24;

function getTokenTtlMs() {
  const ttlHours = Number(process.env.EMAIL_VERIFICATION_TOKEN_TTL_HOURS || DEFAULT_TTL_HOURS);
  if (!Number.isFinite(ttlHours) || ttlHours <= 0) {
    return DEFAULT_TTL_HOURS * 60 * 60 * 1000;
  }
  return ttlHours * 60 * 60 * 1000;
}

function hashVerificationToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken)).digest('hex');
}

function buildVerifyEmailLookup(rawToken) {
  return {
    emailVerifyToken: hashVerificationToken(rawToken),
    emailVerifyExpires: { $gt: new Date() },
    emailVerified: false,
  };
}

function createVerificationToken() {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashVerificationToken(rawToken);
  const expiresAt = new Date(Date.now() + getTokenTtlMs());
  return { rawToken, tokenHash, expiresAt };
}

function canSendVerificationEmails() {
  return Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS);
}

function shouldBypassEmailVerification() {
  return process.env.NODE_ENV !== 'production' && !canSendVerificationEmails();
}

function buildInitialEmailVerificationState() {
  if (shouldBypassEmailVerification()) {
    return {
      emailVerified: true,
      emailVerifyToken: null,
      emailVerifyExpires: null,
      verificationRawToken: null,
    };
  }

  const { rawToken, tokenHash, expiresAt } = createVerificationToken();
  return {
    emailVerified: false,
    emailVerifyToken: tokenHash,
    emailVerifyExpires: expiresAt,
    verificationRawToken: rawToken,
  };
}

function buildVerificationStateForResend() {
  const { rawToken, tokenHash, expiresAt } = createVerificationToken();
  return {
    emailVerifyToken: tokenHash,
    emailVerifyExpires: expiresAt,
    verificationRawToken: rawToken,
  };
}

module.exports = {
  hashVerificationToken,
  buildVerifyEmailLookup,
  createVerificationToken,
  canSendVerificationEmails,
  shouldBypassEmailVerification,
  buildInitialEmailVerificationState,
  buildVerificationStateForResend,
};