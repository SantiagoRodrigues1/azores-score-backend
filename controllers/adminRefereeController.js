// controllers/adminRefereeController.js
const Referee = require('../models/Referee');
const logger = require('../utils/logger');

/**
 * GET /api/admin/referees
 * Lista todos os árbitros
 */
exports.getAllReferees = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const skip = (page - 1) * limit;

    let filter = {};
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const referees = await Referee.find(filter)
      .populate('matches')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ name: 1 });

    const total = await Referee.countDocuments(filter);

    res.json({
      success: true,
      data: referees,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Erro ao listar árbitros', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao carregar árbitros',
      error: error.message
    });
  }
};

/**
 * POST /api/admin/referees
 * Cria um novo árbitro
 */
exports.createReferee = async (req, res) => {
  try {
    const { name, age, association, email, phone, license, photo } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Nome do árbitro é obrigatório'
      });
    }

    const newReferee = new Referee({
      name,
      age: age || null,
      association: association || 'FAA (Federação Açoreana de Futebol)',
      email: email || null,
      phone: phone || null,
      license: license || null,
      photo: photo || null,
      status: 'active'
    });

    await newReferee.save();

    res.status(201).json({
      success: true,
      message: 'Árbitro criado com sucesso',
      data: newReferee
    });
  } catch (error) {
    logger.error('Erro ao criar árbitro', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao criar árbitro',
      error: error.message
    });
  }
};

/**
 * GET /api/admin/referees/:id
 * Obtém detalhes de um árbitro
 */
exports.getRefereeById = async (req, res) => {
  try {
    const { id } = req.params;
    const referee = await Referee.findById(id).populate('matches');

    if (!referee) {
      return res.status(404).json({
        success: false,
        message: 'Árbitro não encontrado'
      });
    }

    res.json({
      success: true,
      data: referee
    });
  } catch (error) {
    logger.error('Erro ao obter árbitro', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao carregar árbitro',
      error: error.message
    });
  }
};

/**
 * PUT /api/admin/referees/:id
 * Edita um árbitro
 */
exports.updateReferee = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, age, association, email, phone, license, photo, status } = req.body;

    const referee = await Referee.findById(id);
    if (!referee) {
      return res.status(404).json({
        success: false,
        message: 'Árbitro não encontrado'
      });
    }

    if (name) referee.name = name;
    if (age) referee.age = age;
    if (association) referee.association = association;
    if (email) referee.email = email;
    if (phone) referee.phone = phone;
    if (license) referee.license = license;
    if (photo) referee.photo = photo;
    if (status && ['active', 'inactive', 'suspended'].includes(status)) {
      referee.status = status;
    }
    referee.updatedAt = new Date();

    await referee.save();

    res.json({
      success: true,
      message: 'Árbitro atualizado com sucesso',
      data: referee
    });
  } catch (error) {
    logger.error('Erro ao atualizar árbitro', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar árbitro',
      error: error.message
    });
  }
};

/**
 * DELETE /api/admin/referees/:id
 * Apaga um árbitro
 */
exports.deleteReferee = async (req, res) => {
  try {
    const { id } = req.params;

    const referee = await Referee.findByIdAndDelete(id);
    if (!referee) {
      return res.status(404).json({
        success: false,
        message: 'Árbitro não encontrado'
      });
    }

    res.json({
      success: true,
      message: 'Árbitro apagado com sucesso',
      data: referee
    });
  } catch (error) {
    logger.error('Erro ao apagar árbitro', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao apagar árbitro',
      error: error.message
    });
  }
};

/**
 * GET /api/admin/referees/stats
 * Estatísticas dos árbitros
 */
exports.getRefereesStats = async (req, res) => {
  try {
    const stats = {
      total: await Referee.countDocuments(),
      byStatus: {
        active: await Referee.countDocuments({ status: 'active' }),
        inactive: await Referee.countDocuments({ status: 'inactive' }),
        suspended: await Referee.countDocuments({ status: 'suspended' })
      },
      topReferees: await Referee.find()
        .sort({ matchesOfficiated: -1 })
        .select('name matchesOfficiated yellowCardsGiven redCardsGiven')
        .limit(5)
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Erro ao obter estatísticas de árbitros', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao obter estatísticas',
      error: error.message
    });
  }
};
