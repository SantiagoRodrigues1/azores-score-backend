const jwt = require('jsonwebtoken');

function getJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is required');
  }

  return process.env.JWT_SECRET;
}

function normalizeJwtPayload(payload = {}) {
  if (payload.id || !payload.userId) {
    return payload;
  }

  return {
    ...payload,
    id: payload.userId
  };
}

function signJwt(payload, options = {}) {
  return jwt.sign(normalizeJwtPayload(payload), getJwtSecret(), options);
}

function verifyJwt(token) {
  return normalizeJwtPayload(jwt.verify(token, getJwtSecret()));
}

module.exports = {
  getJwtSecret,
  normalizeJwtPayload,
  signJwt,
  verifyJwt
};