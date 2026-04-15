// controllers/adminClubController.js
const Club = require('../models/Club');
const Competition = require('../models/Competition');
const logger = require('../utils/logger');

function getNormalizedColors({ colors, primaryColor, secondaryColor }) {
  if (colors && typeof colors === 'object') {
    return {
      primary: colors.primary || '#3b82f6',
      secondary: colors.secondary || '#ffffff'
    };
  }

  if (primaryColor || secondaryColor) {
    return {
      primary: primaryColor || '#3b82f6',
      secondary: secondaryColor || '#ffffff'
    };
  }

  return null;
}

function getNormalizedFoundedYear(foundedYear, founded) {
  const candidate = foundedYear ?? founded;
  const parsed = Number(candidate);

  if (!Number.isInteger(parsed) || parsed < 1800) {
    return null;
  }

  return parsed;
}

async function attachClubToCompetition(clubId, competitionId) {
  if (!competitionId) {
    return;
  }

  const competition = await Competition.findById(competitionId);
  if (!competition) {
    return;
  }

  const clubIdString = String(clubId);
  const competitionTeamIds = competition.teams.map((teamId) => String(teamId));

  if (!competitionTeamIds.includes(clubIdString)) {
    competition.teams.push(clubId);
  }

  const alreadyInStandings = competition.standings.some((entry) => String(entry.team) === clubIdString);
  if (!alreadyInStandings) {
    competition.standings.push({
      team: clubId,
      points: 0,
      played: 0,
      won: 0,
      draw: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0
    });
  }

  await competition.save();
}

/**
 * GET /api/admin/clubs
 * Lista todos os clubes
 */
exports.getAllClubs = async (req, res) => {
  try {
    const { page = 1, limit = 20, island, search } = req.query;
    const skip = (page - 1) * limit;

    let filter = {};
    if (island) filter.island = island;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { stadium: { $regex: search, $options: 'i' } }
      ];
    }

    const clubs = await Club.find(filter)
      .populate('players', 'name position')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ name: 1 });

    const total = await Club.countDocuments(filter);

    res.json({
      success: true,
      data: clubs,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Erro ao listar clubes', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao carregar clubes',
      error: error.message
    });
  }
};

/**
 * POST /api/admin/clubs
 * Cria um novo clube
 */
exports.createClub = async (req, res) => {
  try {
    const { name, island, stadium, foundedYear, founded, description, logo, colors, primaryColor, secondaryColor, competitionId } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Nome do clube é obrigatório'
      });
    }

    const existingClub = await Club.findOne({ name });
    if (existingClub) {
      return res.status(400).json({
        success: false,
        message: 'Clube com este nome já existe'
      });
    }

    const normalizedFoundedYear = getNormalizedFoundedYear(foundedYear, founded);
    const normalizedColors = getNormalizedColors({ colors, primaryColor, secondaryColor }) || {
      primary: '#3b82f6',
      secondary: '#ffffff'
    };

    const newClub = new Club({
      name,
      island: island || 'Açores',
      stadium,
      foundedYear: normalizedFoundedYear || undefined,
      description,
      logo: logo || '⚽',
      colors: normalizedColors
    });

    await newClub.save();
    await attachClubToCompetition(newClub._id, competitionId);

    res.status(201).json({
      success: true,
      message: 'Clube criado com sucesso',
      data: newClub
    });
  } catch (error) {
    logger.error('Erro ao criar clube', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao criar clube',
      error: error.message
    });
  }
};

/**
 * GET /api/admin/clubs/:id
 * Obtém detalhes de um clube
 */
exports.getClubById = async (req, res) => {
  try {
    const { id } = req.params;
    const club = await Club.findById(id).populate('players');

    if (!club) {
      return res.status(404).json({
        success: false,
        message: 'Clube não encontrado'
      });
    }

    res.json({
      success: true,
      data: club
    });
  } catch (error) {
    logger.error('Erro ao obter clube', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao carregar clube',
      error: error.message
    });
  }
};

/**
 * PUT /api/admin/clubs/:id
 * Edita um clube
 */
exports.updateClub = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, island, stadium, foundedYear, founded, description, logo, colors, primaryColor, secondaryColor, competitionId } = req.body;

    const club = await Club.findById(id);
    if (!club) {
      return res.status(404).json({
        success: false,
        message: 'Clube não encontrado'
      });
    }

    if (name && name !== club.name) {
      const existing = await Club.findOne({ name });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'Outro clube com este nome já existe'
        });
      }
      club.name = name;
    }

    if (island !== undefined) club.island = island;
    if (stadium !== undefined) club.stadium = stadium;

    const normalizedFoundedYear = getNormalizedFoundedYear(foundedYear, founded);
    if (normalizedFoundedYear) {
      club.foundedYear = normalizedFoundedYear;
    }

    if (description !== undefined) club.description = description;
    if (logo !== undefined && logo !== '') club.logo = logo;

    const normalizedColors = getNormalizedColors({ colors, primaryColor, secondaryColor });
    if (normalizedColors) {
      club.colors = normalizedColors;
    }

    club.updatedAt = new Date();

    await club.save();
    await attachClubToCompetition(club._id, competitionId);

    res.json({
      success: true,
      message: 'Clube atualizado com sucesso',
      data: club
    });
  } catch (error) {
    logger.error('Erro ao atualizar clube', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar clube',
      error: error.message
    });
  }
};

/**
 * DELETE /api/admin/clubs/:id
 * Apaga um clube
 */
exports.deleteClub = async (req, res) => {
  try {
    const { id } = req.params;

    const club = await Club.findByIdAndDelete(id);
    if (!club) {
      return res.status(404).json({
        success: false,
        message: 'Clube não encontrado'
      });
    }

    res.json({
      success: true,
      message: 'Clube apagado com sucesso',
      data: club
    });
  } catch (error) {
    logger.error('Erro ao apagar clube', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao apagar clube',
      error: error.message
    });
  }
};

/**
 * GET /api/admin/clubs/stats
 * Estatísticas dos clubes
 */
exports.getClubsStats = async (req, res) => {
  try {
    const stats = {
      total: await Club.countDocuments(),
      byIsland: {},
      totalPlayers: 0
    };

    const islands = ['São Miguel', 'Terceira', 'Faial', 'Pico', 'São Jorge', 'Graciosa', 'Flores', 'Corvo'];
    
    for (const island of islands) {
      stats.byIsland[island] = await Club.countDocuments({ island });
    }

    const clubs = await Club.find().populate('players');
    stats.totalPlayers = clubs.reduce((sum, club) => sum + club.players.length, 0);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Erro ao obter estatísticas de clubes', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao obter estatísticas',
      error: error.message
    });
  }
};
