// controllers/adminUserController.js
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');

/**
 * GET /api/admin/users
 * Lista todos os utilizadores com paginação e filtros
 */
exports.getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, role, status, search } = req.query;
    const skip = (page - 1) * limit;

    let filter = {};
    if (role) filter.role = role;
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(filter)
      .select('-password')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await User.countDocuments(filter);

    res.json({
      success: true,
      data: users,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Erro ao listar utilizadores', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao carregar utilizadores',
      error: error.message
    });
  }
};

/**
 * GET /api/admin/users/:id
 * Obtém detalhes de um utilizador específico
 */
exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilizador não encontrado'
      });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    logger.error('Erro ao obter utilizador', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao carregar utilizador',
      error: error.message
    });
  }
};

/**
 * PUT /api/admin/users/:id
 * Edita dados de um utilizador
 */
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilizador não encontrado'
      });
    }

    if (name) user.name = name;
    if (email) user.email = email;
    if (role && ['fan', 'referee', 'club_manager', 'team_manager', 'team_president', 'journalist', 'admin'].includes(role)) {
      user.role = role;
    }

    await user.save();

    res.json({
      success: true,
      message: 'Utilizador atualizado com sucesso',
      data: user
    });
  } catch (error) {
    logger.error('Erro ao atualizar utilizador', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar utilizador',
      error: error.message
    });
  }
};

/**
 * PATCH /api/admin/users/:id/role
 * Altera o papel (role) de um utilizador
 */
exports.updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    const validRoles = ['fan', 'referee', 'club_manager', 'team_manager', 'team_president', 'journalist', 'admin'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Papel inválido. Valores aceitos: ${validRoles.join(', ')}`
      });
    }

    const user = await User.findByIdAndUpdate(
      id,
      { role },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilizador não encontrado'
      });
    }

    res.json({
      success: true,
      message: `Papel alterado para: ${role}`,
      data: user
    });
  } catch (error) {
    logger.error('Erro ao atualizar papel', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar papel',
      error: error.message
    });
  }
};

/**
 * PATCH /api/admin/users/:id/status
 * Altera o estado (ativo/suspenso) de um utilizador
 */
exports.updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatus = ['active', 'suspended', 'inactive'];
    if (!validStatus.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Estado inválido. Valores aceitos: ${validStatus.join(', ')}`
      });
    }

    const user = await User.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilizador não encontrado'
      });
    }

    res.json({
      success: true,
      message: `Estado alterado para: ${status}`,
      data: user
    });
  } catch (error) {
    logger.error('Erro ao atualizar estado', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar estado',
      error: error.message
    });
  }
};

/**
 * DELETE /api/admin/users/:id
 * Apaga um utilizador
 */
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Impede auto-eliminação
    if (req.user.id === id) {
      return res.status(400).json({
        success: false,
        message: 'Não pode apagar a sua própria conta'
      });
    }

    const user = await User.findByIdAndDelete(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilizador não encontrado'
      });
    }

    res.json({
      success: true,
      message: 'Utilizador apagado com sucesso',
      data: user
    });
  } catch (error) {
    logger.error('Erro ao apagar utilizador', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao apagar utilizador',
      error: error.message
    });
  }
};

/**
 * GET /api/admin/users/stats
 * Retorna estatísticas dos utilizadores
 */
exports.getUsersStats = async (req, res) => {
  try {
    const stats = {
      total: await User.countDocuments(),
      byRole: {
        fan: await User.countDocuments({ role: 'fan' }),
        referee: await User.countDocuments({ role: 'referee' }),
        club_manager: await User.countDocuments({ role: 'club_manager' }),
        team_manager: await User.countDocuments({ role: 'team_manager' }),
        team_president: await User.countDocuments({ role: 'team_president' }),
        journalist: await User.countDocuments({ role: 'journalist' }),
        admin: await User.countDocuments({ role: 'admin' })
      },
      byStatus: {
        active: await User.countDocuments({ status: 'active' }),
        suspended: await User.countDocuments({ status: 'suspended' }),
        inactive: await User.countDocuments({ status: 'inactive' })
      },
      recentJoins: await User.find()
        .select('name email role createdAt')
        .sort({ createdAt: -1 })
        .limit(5)
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Erro ao obter estatísticas', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao obter estatísticas',
      error: error.message
    });
  }
};
