const User = require('../models/User');
const { signJwt } = require('../utils/jwt');
const { isClubManagerRole, serializeUser } = require('../utils/accessControl');
const { sendVerificationEmail } = require('../services/emailService');
const {
  buildVerifyEmailLookup,
  canSendVerificationEmails,
  shouldBypassEmailVerification,
  buildInitialEmailVerificationState,
  buildVerificationStateForResend,
} = require('../services/emailVerificationService');

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

/** Gera o JWT de sessão para o utilizador autenticado. */
const generateToken = (user) => {
  const payload = { 
    id: user._id, 
    role: user.role, 
    email: user.email
  };
  
  if (isClubManagerRole(user.role) && user.assignedTeam) {
    payload.assignedTeam = user.assignedTeam._id || user.assignedTeam;
  }
  
  return signJwt(payload, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
};

// ──────────────────────────────────────────────────────────────
// GET /api/auth/me
// ──────────────────────────────────────────────────────────────
const getCurrentUser = async (req, res) => {
  res.json({
    success: true,
    data: {
      user: serializeUser(req.user)
    }
  });
};

// ──────────────────────────────────────────────────────────────
// POST /api/auth/register
// ──────────────────────────────────────────────────────────────
const register = async (req, res) => {
  try {
    const { name, username, avatar, email, password } = req.body;
    const bypassEmailVerification = shouldBypassEmailVerification();

    // Validações básicas
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Nome, email e password são obrigatórios' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password deve ter pelo menos 6 caracteres' });
    }

    // Verificar duplicados
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email já está registado' });
    }

    if (username) {
      const existingUsername = await User.findOne({ username });
      if (existingUsername) {
        return res.status(400).json({ success: false, message: 'Username já está registado' });
      }
    }

    // Role is always forced to 'fan' on public registration — never trust client-supplied role
    const userRole = 'fan';
    const {
      emailVerified,
      emailVerifyToken,
      emailVerifyExpires,
      verificationRawToken,
    } = buildInitialEmailVerificationState();

    const user = new User({ 
      name, 
      username:           username || undefined,
      avatar:             avatar   || null,
      email, 
      password, 
      role:               userRole,
      assignedTeam:       null,
      emailVerified,
      emailVerifyToken,
      emailVerifyExpires,
    });
    await user.save();
    await user.populate('assignedTeam');

    // Em desenvolvimento local, sem SMTP configurado, a conta fica ativa
    // para evitar contas bloqueadas sem forma de confirmar o email.
    if (bypassEmailVerification) {
      const token = generateToken(user);

      return res.status(201).json({
        success: true,
        message: 'Conta criada com sucesso.',
        emailVerified: true,
        data: {
          user: serializeUser(user),
          token,
        },
      });
    }

    // Enviar email de verificação (não bloqueia a resposta se falhar)
    if (verificationRawToken && canSendVerificationEmails()) {
      sendVerificationEmail(email, name, verificationRawToken).catch((err) => {
        console.error('[EmailService] Falha ao enviar email de verificação:', err.message);
      });
    } else if (!shouldBypassEmailVerification()) {
      console.warn('[EmailService] EMAIL_USER / EMAIL_PASS não configurados – email de verificação não enviado.');
    }

    // Sem JWT — utilizador tem de verificar o email antes de entrar
    res.status(201).json({
      success: true,
      message: 'Conta criada com sucesso. Verifica o teu email para activar a conta.',
      emailVerified: false,
    });
  } catch (err) {
    console.error('[AuthController] register:', err);
    res.status(500).json({ success: false, message: 'Erro interno do servidor' });
  }
};

// ──────────────────────────────────────────────────────────────
// GET /api/auth/verify-email?token=XYZ
// Activa a conta quando o utilizador clica no link do email.
// ──────────────────────────────────────────────────────────────
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ success: false, message: 'Token de verificação em falta.' });
    }

    // Procurar utilizador com este token que ainda não expirou
    const user = await User.findOne(buildVerifyEmailLookup(token)).populate('assignedTeam');

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Link de verificação inválido ou expirado. Solicita um novo email de verificação.',
      });
    }

    // Activar conta e limpar campos de verificação
    user.emailVerified      = true;
    user.emailVerifyToken   = null;
    user.emailVerifyExpires = null;
    await user.save();

    // Gerar JWT para login automático após verificação
    const jwtToken = generateToken(user);

    res.json({
      success: true,
      message: 'Email verificado com sucesso! A tua conta está agora activa.',
      user: serializeUser(user),
      token: jwtToken,
    });
  } catch (err) {
    console.error('[AuthController] verifyEmail:', err);
    res.status(500).json({ success: false, message: 'Erro interno do servidor' });
  }
};

// ──────────────────────────────────────────────────────────────
// POST /api/auth/resend-verification
// Reenvio do email de verificação (caso tenha expirado).
// ──────────────────────────────────────────────────────────────
const resendVerification = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email é obrigatório.' });
    }

    const user = await User.findOne({ email });

    // Resposta genérica para não revelar se o email existe ou não
    const genericMsg = 'Se o endereço existir e ainda não estiver verificado, será enviado um novo email.';

    if (!user || user.emailVerified) {
      return res.json({ success: true, message: genericMsg });
    }

    const { emailVerifyToken, emailVerifyExpires, verificationRawToken } = buildVerificationStateForResend();
    user.emailVerifyToken = emailVerifyToken;
    user.emailVerifyExpires = emailVerifyExpires;
    await user.save();

    if (verificationRawToken && canSendVerificationEmails()) {
      sendVerificationEmail(email, user.name, verificationRawToken).catch((err) => {
        console.error('[EmailService] Falha ao reenviar email de verificação:', err.message);
      });
    }

    res.json({ success: true, message: genericMsg });
  } catch (err) {
    console.error('[AuthController] resendVerification:', err);
    res.status(500).json({ success: false, message: 'Erro interno do servidor' });
  }
};

// ──────────────────────────────────────────────────────────────
// POST /api/auth/login
// ──────────────────────────────────────────────────────────────
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email e password são obrigatórios' });
    }

    const user = await User.findOne({ email }).populate('assignedTeam');
    
    if (!user) {
      return res.status(401).json({ success: false, message: 'Email ou password incorretos' });
    }

    const isMatch = await user.comparePassword(password);
    
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Email ou password incorretos' });
    }

    // Só bloqueia login quando o utilizador está explicitamente não verificado.
    // Compatibilidade com contas antigas sem campo: undefined continua a entrar.
    if (user.emailVerified === false) {
      return res.status(403).json({
        success: false,
        message: 'Por favor verifica o teu email antes de fazer login.',
        emailNotVerified: true,
      });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ success: false, message: 'A sua conta está suspensa' });
    }

    if (user.status === 'inactive') {
      return res.status(403).json({ success: false, message: 'A sua conta está inativa' });
    }

    const token = generateToken(user);

    res.json({
      success: true,
      data: {
        user: serializeUser(user),
        token
      }
    });
  } catch (err) {
    console.error('[AuthController] login:', err);
    res.status(500).json({ success: false, message: 'Erro interno do servidor' });
  }
};

module.exports = { getCurrentUser, register, login, verifyEmail, resendVerification };
