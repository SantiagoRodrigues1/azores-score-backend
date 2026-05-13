// controllers/userProfileController.js
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { serializeUser } = require('../utils/accessControl');
const {
  buildInitialEmailVerificationState,
  canSendVerificationEmails,
} = require('../services/emailVerificationService');
const { sendVerificationEmail } = require('../services/emailService');

// PUT /api/user/profile
exports.updateProfile = asyncHandler(async (req, res) => {
  const { name, username, avatar } = req.body;
  const userId = req.user.id;

  if (!name || !String(name).trim()) {
    return res.status(400).json({ success: false, message: 'Nome é obrigatório' });
  }

  if (username) {
    const existing = await User.findOne({
      username: String(username).trim(),
      _id: { $ne: userId },
    });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Username já está em uso' });
    }
  }

  const update = {
    name: String(name).trim(),
    avatar: avatar || null,
  };
  if (username !== undefined) {
    update.username = username ? String(username).trim() : undefined;
  }

  const user = await User.findByIdAndUpdate(userId, update, { new: true }).populate('assignedTeam');
  res.json({ success: true, data: { user: serializeUser(user) } });
});

// PUT /api/user/change-password
exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      message: 'Password atual e nova password são obrigatórias',
    });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({
      success: false,
      message: 'Nova password deve ter pelo menos 8 caracteres',
    });
  }

  const user = await User.findById(req.user.id);
  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    return res.status(400).json({ success: false, message: 'Password atual incorreta' });
  }

  user.password = newPassword;
  await user.save();

  res.json({ success: true, message: 'Password alterada com sucesso' });
});

// PUT /api/user/change-email
exports.changeEmail = asyncHandler(async (req, res) => {
  const { newEmail, currentPassword } = req.body;

  if (!newEmail || !currentPassword) {
    return res.status(400).json({
      success: false,
      message: 'Novo email e password são obrigatórios',
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(newEmail)) {
    return res.status(400).json({ success: false, message: 'Formato de email inválido' });
  }

  const user = await User.findById(req.user.id);
  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    return res.status(400).json({ success: false, message: 'Password incorreta' });
  }

  const existing = await User.findOne({
    email: newEmail.toLowerCase(),
    _id: { $ne: user._id },
  });
  if (existing) {
    return res.status(400).json({ success: false, message: 'Email já está em uso' });
  }

  // Generate new email verification token for the new address
  const { emailVerifyToken, emailVerifyExpires, verificationRawToken } =
    buildInitialEmailVerificationState();

  user.email = newEmail.toLowerCase();
  user.emailVerified = false;
  user.requiresEmailVerification = true;
  user.emailVerifyToken = emailVerifyToken;
  user.emailVerifyExpires = emailVerifyExpires;
  await user.save();

  if (verificationRawToken && canSendVerificationEmails()) {
    sendVerificationEmail(user.email, user.name, verificationRawToken).catch((err) => {
      console.error('[UserProfile] Falha ao enviar email de verificação:', err.message);
    });
  }

  res.json({
    success: true,
    message: 'Email alterado. Verifica o teu novo endereço de email para reativar o acesso.',
  });
});
