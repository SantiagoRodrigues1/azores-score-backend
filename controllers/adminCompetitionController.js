// controllers/adminCompetitionController.js
const Competition = require('../models/Competition');
const Club = require('../models/Club');
const logger = require('../utils/logger');

/**
 * GET /api/admin/competitions
 * Lista todas as competições
 */
exports.getAllCompetitions = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, season } = req.query;
    const skip = (page - 1) * limit;

    let filter = {};
    if (status) filter.status = status;
    if (season) filter.season = season;

    const competitions = await Competition.find(filter)
      .populate('teams', 'name logo island')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ season: -1, name: 1 });

    const total = await Competition.countDocuments(filter);

    res.json({
      success: true,
      data: competitions,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Erro ao listar competições', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao carregar competições',
      error: error.message
    });
  }
};

/**
 * POST /api/admin/competitions
 * Cria uma nova competição
 */
exports.createCompetition = async (req, res) => {
  try {
    const { name, season, type, description, teams, startDate, endDate, rules } = req.body;

    if (!name || !season) {
      return res.status(400).json({
        success: false,
        message: 'Nome e época são obrigatórios'
      });
    }

    const newCompetition = new Competition({
      name,
      season: season || `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`,
      type: type || 'league',
      description,
      teams: teams || [],
      startDate,
      endDate,
      status: 'planning',
      rules: rules || {
        matchFormat: '2x45',
        pointsForWin: 3,
        pointsForDraw: 1
      }
    });

    await newCompetition.save();

    res.status(201).json({
      success: true,
      message: 'Competição criada com sucesso',
      data: newCompetition
    });
  } catch (error) {
    logger.error('Erro ao criar competição', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao criar competição',
      error: error.message
    });
  }
};

/**
 * GET /api/admin/competitions/:id
 * Obtém detalhes de uma competição
 */
exports.getCompetitionById = async (req, res) => {
  try {
    const { id } = req.params;
    const competition = await Competition.findById(id)
      .populate('teams', 'name logo island')
      .populate('standings.team', 'name logo');

    if (!competition) {
      return res.status(404).json({
        success: false,
        message: 'Competição não encontrada'
      });
    }

    res.json({
      success: true,
      data: competition
    });
  } catch (error) {
    logger.error('Erro ao obter competição', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao carregar competição',
      error: error.message
    });
  }
};

/**
 * PUT /api/admin/competitions/:id
 * Edita uma competição
 */
exports.updateCompetition = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, description, startDate, endDate, status, rules } = req.body;

    const competition = await Competition.findById(id);
    if (!competition) {
      return res.status(404).json({
        success: false,
        message: 'Competição não encontrada'
      });
    }

    if (name) competition.name = name;
    if (type) competition.type = type;
    if (description) competition.description = description;
    if (startDate) competition.startDate = startDate;
    if (endDate) competition.endDate = endDate;
    if (status && ['planning', 'active', 'finished'].includes(status)) {
      competition.status = status;
    }
    if (rules) competition.rules = rules;
    competition.updatedAt = new Date();

    await competition.save();

    res.json({
      success: true,
      message: 'Competição atualizada com sucesso',
      data: competition
    });
  } catch (error) {
    logger.error('Erro ao atualizar competição', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar competição',
      error: error.message
    });
  }
};

/**
 * PATCH /api/admin/competitions/:id/teams
 * Adiciona ou remove equipas de uma competição
 */
exports.updateCompetitionTeams = async (req, res) => {
  try {
    const { id } = req.params;
    const { teams } = req.body;

    if (!Array.isArray(teams)) {
      return res.status(400).json({
        success: false,
        message: 'Teams deve ser um array'
      });
    }

    const competition = await Competition.findById(id);
    if (!competition) {
      return res.status(404).json({
        success: false,
        message: 'Competição não encontrada'
      });
    }

    competition.teams = teams;
    
    // Inicializa as classificações
    competition.standings = teams.map(teamId => ({
      team: teamId,
      points: 0,
      played: 0,
      won: 0,
      draw: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0
    }));

    await competition.save();

    res.json({
      success: true,
      message: 'Equipas da competição atualizadas com sucesso',
      data: competition
    });
  } catch (error) {
    logger.error('Erro ao atualizar equipas da competição', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar equipas',
      error: error.message
    });
  }
};

/**
 * DELETE /api/admin/competitions/:id
 * Apaga uma competição
 */
exports.deleteCompetition = async (req, res) => {
  try {
    const { id } = req.params;

    const competition = await Competition.findByIdAndDelete(id);
    if (!competition) {
      return res.status(404).json({
        success: false,
        message: 'Competição não encontrada'
      });
    }

    res.json({
      success: true,
      message: 'Competição apagada com sucesso',
      data: competition
    });
  } catch (error) {
    logger.error('Erro ao apagar competição', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao apagar competição',
      error: error.message
    });
  }
};

/**
 * GET /api/admin/competitions/stats
 * Estatísticas das competições
 */
exports.getCompetitionsStats = async (req, res) => {
  try {
    const stats = {
      total: await Competition.countDocuments(),
      byStatus: {
        planning: await Competition.countDocuments({ status: 'planning' }),
        active: await Competition.countDocuments({ status: 'active' }),
        finished: await Competition.countDocuments({ status: 'finished' })
      },
      activeCompetitions: await Competition.find({ status: 'active' })
        .select('name season type')
        .limit(5)
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Erro ao obter estatísticas de competições', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao obter estatísticas',
      error: error.message
    });
  }
};
