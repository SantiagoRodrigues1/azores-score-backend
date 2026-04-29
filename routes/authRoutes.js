const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

// POST /api/auth/register  → cria conta + envia email de verificação
router.post('/register', authController.register);

// POST /api/auth/login     → login (só funciona após verificação de email)
router.post('/login', authController.login);

// GET  /api/auth/me        → utilizador autenticado
router.get('/me', (req, res, next) => {
  Promise.resolve(
    requireAuth(req, res, () => authController.getCurrentUser(req, res, next))
  ).catch(next);
});

// GET  /api/auth/verify-email?token=XYZ  → activa a conta via link do email
router.get('/verify-email', authController.verifyEmail);

// POST /api/auth/resend-verification     → reenvio do email (token expirado)
router.post('/resend-verification', authController.resendVerification);

module.exports = router;
