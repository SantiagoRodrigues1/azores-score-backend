const express = require('express');
const router = express.Router();
const JournalistRequest = require('../models/JournalistRequest');
const User = require('../models/User');
const { verifyToken, verifyAdmin } = require('../middleware/auth');

// ===========================
// JOURNALIST REQUEST FLOW
// ===========================

// POST /api/journalist/request — User submits journalist request
router.post('/request', verifyToken, async (req, res) => {
  try {
    const { name, company } = req.body;

    if (!name || !company) {
      return res.status(400).json({ success: false, message: 'Nome e empresa são obrigatórios.' });
    }

    // Check if user already has a pending or approved request
    const existing = await JournalistRequest.findOne({
      userId: req.user.id,
      status: { $in: ['pending', 'approved'] }
    });

    if (existing) {
      const msg = existing.status === 'pending'
        ? 'Já tem um pedido pendente.'
        : 'O seu pedido já foi aprovado.';
      return res.status(400).json({ success: false, message: msg });
    }

    // If user is already a journalist
    if (req.user.role === 'journalist') {
      return res.status(400).json({ success: false, message: 'Já é jornalista.' });
    }

    const request = new JournalistRequest({
      userId: req.user.id,
      name: name.trim(),
      company: company.trim()
    });
    await request.save();

    res.status(201).json({ success: true, data: request });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro ao submeter pedido.' });
  }
});

// GET /api/journalist/my-request — Check current user's request status
router.get('/my-request', verifyToken, async (req, res) => {
  try {
    const request = await JournalistRequest.findOne({ userId: req.user.id })
      .sort({ createdAt: -1 });

    res.json({ success: true, data: request || null });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro ao obter pedido.' });
  }
});

// ===========================
// ADMIN — JOURNALIST REQUESTS
// ===========================

// GET /api/journalist/admin/requests — List all journalist requests (admin only)
router.get('/admin/requests', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const requests = await JournalistRequest.find(filter)
      .populate('userId', 'name email role avatar')
      .populate('reviewedBy', 'name')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: requests });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro ao listar pedidos.' });
  }
});

// PUT /api/journalist/admin/requests/:id/approve — Approve a request
router.put('/admin/requests/:id/approve', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const request = await JournalistRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Pedido não encontrado.' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Pedido já foi processado.' });
    }

    // Update request
    request.status = 'approved';
    request.reviewedBy = req.user.id;
    request.reviewedAt = new Date();
    await request.save();

    // Promote user to journalist
    await User.findByIdAndUpdate(request.userId, { role: 'journalist' });

    res.json({ success: true, data: request });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro ao aprovar pedido.' });
  }
});

// PUT /api/journalist/admin/requests/:id/reject — Reject a request
router.put('/admin/requests/:id/reject', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const request = await JournalistRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Pedido não encontrado.' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Pedido já foi processado.' });
    }

    request.status = 'rejected';
    request.reviewedBy = req.user.id;
    request.reviewedAt = new Date();
    request.rejectionReason = req.body.reason || null;
    await request.save();

    res.json({ success: true, data: request });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro ao rejeitar pedido.' });
  }
});

// ===========================
// ADMIN — USER MANAGEMENT
// ===========================

// GET /api/journalist/admin/users — List all users (admin only)
router.get('/admin/users', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { role, search, page = 1, limit = 20 } = req.query;
    const filter = {};

    if (role) filter.role = role;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [users, total] = await Promise.all([
      User.find(filter)
        .select('name email role plan status avatar createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      User.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data: users,
      pagination: { page: Number(page), totalPages: Math.ceil(total / Number(limit)), total }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro ao listar utilizadores.' });
  }
});

// PUT /api/journalist/admin/users/:id/role — Change user role (admin only)
router.put('/admin/users/:id/role', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    const validRoles = ['fan', 'referee', 'club_manager', 'team_manager', 'team_president', 'journalist', 'admin'];

    if (!role || !validRoles.includes(role)) {
      return res.status(400).json({ success: false, message: 'Role inválido.' });
    }

    // Don't allow changing own role
    if (req.params.id === req.user.id) {
      return res.status(400).json({ success: false, message: 'Não pode alterar o próprio perfil.' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true }
    ).select('name email role plan status avatar');

    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilizador não encontrado.' });
    }

    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro ao alterar role.' });
  }
});

// POST /api/journalist/admin/users — Create a new user (admin only)
router.post('/admin/users', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const validRoles = ['fan', 'referee', 'club_manager', 'team_manager', 'team_president', 'journalist', 'admin'];

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Nome, email e password são obrigatórios.' });
    }

    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ success: false, message: 'Role inválido.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password deve ter pelo menos 6 caracteres.' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email já está registado.' });
    }

    const user = new User({
      name,
      email,
      password,
      role: role || 'fan'
    });
    await user.save();

    res.status(201).json({
      success: true,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro ao criar utilizador.' });
  }
});

// ===========================
// JOURNALIST — MY NEWS
// ===========================

// GET /api/journalist/my-news — Get news created by current journalist
router.get('/my-news', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'journalist' && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Acesso restrito a jornalistas.' });
    }

    const News = require('../models/News');
    const news = await News.find({ author: req.user.id })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, data: news });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro ao obter notícias.' });
  }
});

module.exports = router;
