// controllers/playerController.js
/**
 * Player Controller
 * Gestão de jogadores do plantel
 * - Team Managers conseguem CREATE/UPDATE/DELETE seus jogadores
 * - Qualquer user consegue READ (visualizar públicamente)
 */

const Player = require('../models/Player');
const Club = require('../models/Club');
const mongoose = require('mongoose');
const { getClient } = require('../config/db');
const { isClubManagerRole } = require('../utils/accessControl');
const logger = require('../utils/logger');
const teamService = require('../services/teamService');

function getPlayerPhoto(player) {
  return player.photo || player.image || '';
}

function mapLegacyPlayer(player, teamId = null, teamName = null) {
  return {
    id: player._id?.toString?.() || String(player._id || player.id_jogador || `${player.equipa || 'team'}-${player.nome || 'player'}`),
    name: player.name || player.nome || '',
    numero: player.numero || player.numero_camisola || player.number || 0,
    position: player.position || player.posicao || player.posicao_print || 'Outro',
    goals: player.goals || player.golos || 0,
    assists: player.assists || 0,
    teamId,
    teamName: teamName || player.equipa || null,
    email: player.email || '',
    nickname: player.nickname || null,
    photo: player.photo || player.image || null,
    image: player.image || player.photo || null,
    createdAt: player.createdAt || null
  };
}

async function getLegacyPlayersForClub(club) {
  const client = await getClient();
  const database = client.db();
  const teamName = String(club.name || '').trim();
  const collections = await database
    .listCollections({ name: { $in: [teamName, 'jogadores'] } }, { nameOnly: true })
    .toArray();
  const collectionNames = new Set(collections.map((entry) => entry.name));
  const players = [];

  if (collectionNames.has(teamName)) {
    const teamPlayers = await database.collection(teamName).find({}).toArray();
    players.push(...teamPlayers.map((player) => mapLegacyPlayer(player, String(club._id), teamName)));
  }

  if (collectionNames.has('jogadores')) {
    const genericPlayers = await database.collection('jogadores').find({ equipa: teamName }).toArray();
    players.push(...genericPlayers.map((player) => mapLegacyPlayer(player, String(club._id), teamName)));
  }

  const unique = new Map();
  for (const player of players) {
    const key = [player.id, player.name, String(player.numero || ''), player.position].join('::');
    if (!unique.has(key)) {
      unique.set(key, player);
    }
  }

  return Array.from(unique.values());
}

async function getLegacyPlayerById(playerId) {
  const client = await getClient();
  const database = client.db();
  const collections = await database.listCollections({}, { nameOnly: true }).toArray();
  const candidateIds = [{ _id: playerId }];

  if (mongoose.Types.ObjectId.isValid(playerId)) {
    candidateIds.push({ _id: new mongoose.Types.ObjectId(playerId) });
  }

  for (const collection of collections) {
    const collectionName = collection.name;
    if (collectionName.startsWith('system.')) {
      continue;
    }

    try {
      for (const filter of candidateIds) {
        const found = await database.collection(collectionName).findOne(filter);
        if (found) {
          return mapLegacyPlayer(found, null, found.equipa || collectionName);
        }
      }
    } catch (_error) {
      // Ignore collections with incompatible _id types and continue searching.
    }
  }

  return null;
}

/**
 * GET /api/players/team/:teamId
 * Obter todos os jogadores de uma equipa (PÚBLICO)
 */
exports.getTeamPlayers = async (req, res) => {
  try {
    const { teamId } = req.params;

    // Validar teamId
    if (!teamId) {
      return res.status(400).json({
        success: false,
        message: 'Team ID é obrigatório'
      });
    }

    // Buscar jogadores da equipa
    const club = await Club.findById(teamId).lean();
    if (!club) {
      return res.status(404).json({
        success: false,
        message: 'Equipa não encontrada'
      });
    }

    // Mongoose Players - search by ObjectId string AND by club name
    const players = await Player.find({
      $or: [{ team: String(teamId) }, { team: club.name }]
    })
      .select('_id name nome numero number position goals assists team createdAt photo image')
      .sort({ numero: 1 })
      .lean();

    // Legacy players from raw championship collections (searches all databases)
    let legacyPlayers = [];
    try {
      legacyPlayers = await teamService.findLegacyPlayersForClubName(club.name);
    } catch (legacyError) {
      logger.error('Legacy player lookup error', legacyError.message);
    }

    // Transformar resposta para formato esperado pelo frontend
    const formattedPlayers = players.map(player => ({
      id: player._id?.toString() || player._id,
      name: player.name || player.nome || '',
      numero: String(player.numero || player.number || ''),
      number: parseInt(player.numero) || parseInt(player.number) || 0,
      position: player.position || 'Outro',
      goals: player.goals || 0,
      assists: player.assists || 0,
      photo: getPlayerPhoto(player),
      teamId
    }));

    // Format legacy players
    const formattedLegacy = legacyPlayers.map(p => ({
      id: p._id || p.id,
      name: p.name || p.nome || '',
      numero: String(p.numero || p.number || ''),
      number: p.number || parseInt(String(p.numero || ''), 10) || 0,
      position: p.position || p.posicao || 'Outro',
      goals: p.goals || 0,
      assists: p.assists || 0,
      photo: p.photo || p.image || '',
      teamId,
      teamName: p.teamName || club.name
    }));

    // Merge and deduplicate
    const mergedPlayers = [...formattedPlayers];
    for (const legacy of formattedLegacy) {
      const key = [legacy.name, String(legacy.number), legacy.position].join('::').toLowerCase();
      const exists = mergedPlayers.some(p =>
        [p.name, String(p.number), p.position].join('::').toLowerCase() === key
      );
      if (!exists) {
        mergedPlayers.push(legacy);
      }
    }

    res.json({
      success: true,
      data: mergedPlayers,
      total: mergedPlayers.length
    });
  } catch (error) {
    logger.error('Failed to fetch team players', error.message);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar jogadores',
      error: error.message
    });
  }
};

/**
 * POST /api/players
 * Criar novo jogador (JÁ TEAM MANAGER OU ADMIN)
 */
exports.createPlayer = async (req, res) => {
  try {
    const { name, numero, position, email, photo, photoUrl, teamId } = req.body;
    const userTeamId = req.user.role === 'admin' ? (teamId || req.user.assignedTeam) : req.user.assignedTeam;

    // Validações
    if (!name || !numero) {
      return res.status(400).json({
        success: false,
        message: 'Nome e número de camisola são obrigatórios'
      });
    }

    if (isNaN(numero) || numero < 1 || numero > 99) {
      return res.status(400).json({
        success: false,
        message: 'Número de camisola deve ser entre 1 e 99'
      });
    }

    // Verificar se já existe jogador com este número na equipa
    const existingPlayer = await Player.findOne({
      team: String(userTeamId),
      numero: numero.toString()
    });

    if (existingPlayer) {
      return res.status(409).json({
        success: false,
        message: `Já existe um jogador com o número ${numero} nesta equipa`
      });
    }

    // Criar novo jogador
    const newPlayer = new Player({
      name: name.trim(),
      numero: numero.toString(),
      position: position || 'Outro',
      email: email ? email.toLowerCase().trim() : '',
      photo: photoUrl || photo || '',
      image: photoUrl || photo || '',
      team: String(userTeamId),
      goals: 0,
      assists: 0
    });

    await newPlayer.save();

    res.status(201).json({
      success: true,
      message: 'Jogador adicionado com sucesso',
      data: newPlayer
    });
  } catch (error) {
    logger.error('Failed to create player', error.message);
    res.status(500).json({
      success: false,
      message: 'Erro ao criar jogador',
      error: error.message
    });
  }
};

/**
 * PUT /api/players/:playerId
 * Atualizar jogador (SÓ TEAM MANAGER DA EQUIPA OU ADMIN)
 */
exports.updatePlayer = async (req, res) => {
  try {
    const { playerId } = req.params;
    const { name, numero, position, email, photo, photoUrl, goals, assists } = req.body;
    const userTeamId = req.user.assignedTeam; // Team Manager's team

    // Validar playerId
    if (!playerId) {
      return res.status(400).json({
        success: false,
        message: 'Player ID é obrigatório'
      });
    }

    // Buscar jogador
    const player = await Player.findById(playerId);

    if (!player) {
      return res.status(404).json({
        success: false,
        message: 'Jogador não encontrado'
      });
    }

    // Verificar permissão: só team manager da equipa ou admin
    if (isClubManagerRole(req.user.role) && req.user.role !== 'admin' && player.team.toString() !== userTeamId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado. Pode apenas editar jogadores da sua equipa.'
      });
    }

    // Se mudar número, validar
    if (numero && numero !== player.numero.toString()) {
      if (isNaN(numero) || numero < 1 || numero > 99) {
        return res.status(400).json({
          success: false,
          message: 'Número de camisola deve ser entre 1 e 99'
        });
      }

      // Verificar duplicado
      const duplicate = await Player.findOne({
        team: player.team,
        numero: numero.toString(),
        _id: { $ne: playerId }
      });

      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: `Já existe outro jogador com o número ${numero}`
        });
      }
    }

    // Atualizar campos (apenas os permitidos)
    if (name) player.name = name.trim();
    if (numero) player.numero = numero.toString();
    if (position) player.position = position;
    if (email) player.email = email.toLowerCase().trim();
    if (photoUrl || photo) {
      player.photo = photoUrl || photo;
      player.image = photoUrl || photo;
    }
    if (goals !== undefined) player.goals = goals;
    if (assists !== undefined) player.assists = assists;

    await player.save();

    res.json({
      success: true,
      message: 'Jogador atualizado com sucesso',
      data: player
    });
  } catch (error) {
    logger.error('Failed to update player', error.message);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar jogador',
      error: error.message
    });
  }
};

/**
 * DELETE /api/players/:playerId
 * Remover jogador (SÓ TEAM MANAGER DA EQUIPA OU ADMIN)
 */
exports.deletePlayer = async (req, res) => {
  try {
    const { playerId } = req.params;
    const userTeamId = req.user.assignedTeam;

    // Validar playerId
    if (!playerId) {
      return res.status(400).json({
        success: false,
        message: 'Player ID é obrigatório'
      });
    }

    // Buscar jogador
    const player = await Player.findById(playerId);

    if (!player) {
      return res.status(404).json({
        success: false,
        message: 'Jogador não encontrado'
      });
    }

    // Verificar permissão
    if (isClubManagerRole(req.user.role) && req.user.role !== 'admin' && player.team.toString() !== userTeamId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado. Pode apenas remover jogadores da sua equipa.'
      });
    }

    // Remover
    await Player.findByIdAndDelete(playerId);

    res.json({
      success: true,
      message: 'Jogador removido com sucesso',
      data: { id: playerId, name: player.name }
    });
  } catch (error) {
    logger.error('Failed to delete player', error.message);
    res.status(500).json({
      success: false,
      message: 'Erro ao remover jogador',
      error: error.message
    });
  }
};

/**
 * GET /api/players/:playerId
 * Obter detalhes de um jogador específico (PÚBLICO)
 */
exports.getPlayerById = async (req, res) => {
  try {
    const { playerId } = req.params;

    const player = await Player.findById(playerId)
      .select('name nome numero position goals assists team email nickname photo image createdAt')
      .lean();

    if (!player) {
      try {
        const teamPlayer = await teamService.getPlayerDetails(playerId);

        return res.json({
          success: true,
          data: {
            ...teamPlayer,
            team: teamPlayer.teamId,
            teamId: teamPlayer.teamId,
            teamName: teamPlayer.teamName,
            photo: getPlayerPhoto(teamPlayer)
          }
        });
      } catch (_error) {
        // Fall through to the legacy fallback below.
      }

      const legacyPlayer = await getLegacyPlayerById(playerId);
      if (!legacyPlayer) {
        return res.status(404).json({
          success: false,
          message: 'Jogador não encontrado'
        });
      }

      return res.json({
        success: true,
        data: {
          ...legacyPlayer,
          team: legacyPlayer.teamId,
          teamId: legacyPlayer.teamId,
          teamName: legacyPlayer.teamName,
          photo: getPlayerPhoto(legacyPlayer)
        }
      });
    }

    const relatedClub = player.team ? await Club.findById(player.team).select('name equipa').lean() : null;

    res.json({
      success: true,
      data: {
        ...player,
        id: player._id?.toString(),
        teamId: player.team,
        teamName: relatedClub?.equipa || relatedClub?.name || null,
        photo: getPlayerPhoto(player)
      }
    });
  } catch (error) {
    logger.error('Failed to fetch player details', error.message);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar jogador',
      error: error.message
    });
  }
};

/**
 * GET /api/players/team/:teamId/stats
 * Obter estatísticas do plantel (PÚBLICO)
 */
exports.getTeamStats = async (req, res) => {
  try {
    const { teamId } = req.params;

    const club = await Club.findById(teamId).lean();
    if (!club) {
      return res.status(404).json({
        success: false,
        message: 'Equipa não encontrada'
      });
    }

    const stats = await Player.aggregate([
      { $match: { team: String(teamId) } },
      {
        $group: {
          _id: null,
          totalPlayers: { $sum: 1 },
          totalGoals: { $sum: '$goals' },
          totalAssists: { $sum: '$assists' },
          avgGoals: { $avg: '$goals' },
          topScorer: { $max: '$goals' }
        }
      }
    ]);

    const legacyPlayers = await getLegacyPlayersForClub(club);
    const modernStats = stats[0] || {
      totalPlayers: 0,
      totalGoals: 0,
      totalAssists: 0,
      avgGoals: 0,
      topScorer: 0
    };

    const combinedPlayers = modernStats.totalPlayers > 0 ? null : legacyPlayers;
    const responseStats = combinedPlayers
      ? {
          totalPlayers: combinedPlayers.length,
          totalGoals: combinedPlayers.reduce((sum, player) => sum + (player.goals || 0), 0),
          totalAssists: combinedPlayers.reduce((sum, player) => sum + (player.assists || 0), 0),
          avgGoals: combinedPlayers.length
            ? combinedPlayers.reduce((sum, player) => sum + (player.goals || 0), 0) / combinedPlayers.length
            : 0,
          topScorer: combinedPlayers.reduce((max, player) => Math.max(max, player.goals || 0), 0)
        }
      : modernStats;

    res.json({
      success: true,
      data: responseStats
    });
  } catch (error) {
    logger.error('Failed to fetch team player stats', error.message);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar estatísticas',
      error: error.message
    });
  }
};
