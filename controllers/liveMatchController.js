// controllers/liveMatchController.js
const LiveMatchService = require('../services/liveMatchService');
const Match = require('../models/Match');
const { notifyFavoriteTeamFollowers } = require('../services/features/notificationService');
const { isClubManagerRole } = require('../utils/accessControl');
const logger = require('../utils/logger');

/**
 * Controller para Gestão de Eventos de Jogo em Direto
 */

// ===== START MATCH =====
/**
 * POST /live-match/:matchId/start
 * Inicia um jogo (altera status para "live") e define o managerId
 */
exports.startMatch = async (req, res) => {
  try {
    const { matchId } = req.params;

    // Validar autenticação
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Utilizador não autenticado'
      });
    }

    // Buscar o match
    const match = await Match.findById(matchId);
    if (!match) {
      return res.status(404).json({
        success: false,
        message: 'Jogo não encontrado'
      });
    }

    // Validar permissão do manager antes de permitir o claim do jogo.
    try {
      await LiveMatchService.validateManagerByManagerId(matchId, req.user.id, req.user.role);
    } catch (error) {
      return res.status(403).json({
        success: false,
        message: error.message
      });
    }

    // Definir managerId se não estiver definido
    if (!match.managerId) {
      match.managerId = req.user.id;
    }

    // EXPLÍCITO: Não permitir start manual a menos que ambas as equipas tenham submetido escalações válidas
    const Lineup = require('../models/Lineup');
    const lineups = await Lineup.find({ match: matchId, team: { $in: [match.homeTeam, match.awayTeam] } });
    const homeLineup = lineups.find(l => String(l.team) === String(match.homeTeam));
    const awayLineup = lineups.find(l => String(l.team) === String(match.awayTeam));

    if (!homeLineup || !awayLineup || !homeLineup.submitted || !awayLineup.submitted) {
      return res.status(400).json({
        success: false,
        message: 'Ambas as equipas devem submeter escalações válidas antes de iniciar o jogo'
      });
    }

    // Iniciar jogo
    match.status = 'live';
    await match.save();

    await match.populate('homeTeam', 'id name logo');
    await match.populate('awayTeam', 'id name logo');

    await Promise.all([
      notifyFavoriteTeamFollowers(match.homeTeam._id, 'matchStart', {
        title: `${match.homeTeam.name} entrou em campo`,
        message: `O jogo ${match.homeTeam.name} vs ${match.awayTeam.name} acabou de começar.`,
        type: 'jogo_alterado',
        eventKey: 'match.live_update',
        actionUrl: `/live-match/${matchId}`,
        referenceId: match._id,
        meta: { icon: 'play', color: 'green', buttonText: 'Acompanhar' }
      }),
      notifyFavoriteTeamFollowers(match.awayTeam._id, 'matchStart', {
        title: `${match.awayTeam.name} entrou em campo`,
        message: `O jogo ${match.homeTeam.name} vs ${match.awayTeam.name} acabou de começar.`,
        type: 'jogo_alterado',
        eventKey: 'match.live_update',
        actionUrl: `/live-match/${matchId}`,
        referenceId: match._id,
        meta: { icon: 'play', color: 'green', buttonText: 'Acompanhar' }
      })
    ]);

    return res.status(200).json({
      success: true,
      message: 'Jogo iniciado com sucesso',
      data: match
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ===== ADD EVENT =====
/**
 * POST /live-match/:matchId/event
 * Adiciona um evento ao jogo
 *
 * BODY:
 * {
 *   type: "goal" | "yellow_card" | "red_card" | "substitution",
 *   minute: number,
 *   playerId: ObjectId (para goal, card),
 *   playerInId: ObjectId (para substitution),
 *   playerOutId: ObjectId (para substitution)
 * }
 */
exports.addMatchEvent = async (req, res) => {
  try {
    const { matchId } = req.params;
    const { type, minute, playerId, playerInId, playerOutId, assistId } = req.body;

    // Validar autenticação
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Utilizador não autenticado'
      });
    }

    // Validar autorização do manager
    try {
      await LiveMatchService.validateManagerByManagerId(matchId, req.user.id, req.user.role);
    } catch (error) {
      return res.status(403).json({
        success: false,
        message: error.message
      });
    }

    // Validações básicas
    if (!type) {
      return res.status(400).json({
        success: false,
        message: 'Tipo de evento é obrigatório'
      });
    }

    if (minute === undefined || minute === null) {
      return res.status(400).json({
        success: false,
        message: 'Minuto é obrigatório'
      });
    }

    // Validar dados por tipo de evento
    const validTypes = ['goal', 'yellow_card', 'red_card', 'substitution'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `Tipo de evento inválido. Tipos válidos: ${validTypes.join(', ')}`
      });
    }

    if (type !== 'substitution' && !playerId) {
      return res.status(400).json({
        success: false,
        message: 'playerId é obrigatório para este tipo de evento'
      });
    }

    if (type === 'substitution' && (!playerInId || !playerOutId)) {
      return res.status(400).json({
        success: false,
        message: 'playerInId e playerOutId são obrigatórios para substituições'
      });
    }

    // Adicionar evento
    const match = await LiveMatchService.addMatchEvent(matchId, req.user.id, {
      type,
      minute,
      playerId,
      assistId,
      playerInId,
      playerOutId
    });

    // Emitir Socket.io event (se Socket.io estiver configurado)
    const io = req.app.get('io');
    if (io) {
      io.emit(`match:${matchId}:update`, {
        event: 'new_event',
        match: match
      });
    }

    if (type === 'goal') {
      await Promise.all([
        notifyFavoriteTeamFollowers(match.homeTeam._id, 'goals', {
          title: `Golo em ${match.homeTeam.name} vs ${match.awayTeam.name}`,
          message: `Placar atual: ${match.homeTeam.name} ${match.homeScore} - ${match.awayScore} ${match.awayTeam.name}.`,
          type: 'jogo_alterado',
          eventKey: 'match.live_update',
          actionUrl: `/live-match/${matchId}`,
          referenceId: match._id,
          meta: { icon: 'goal', color: 'yellow', buttonText: 'Ver golo' }
        }),
        notifyFavoriteTeamFollowers(match.awayTeam._id, 'goals', {
          title: `Golo em ${match.homeTeam.name} vs ${match.awayTeam.name}`,
          message: `Placar atual: ${match.homeTeam.name} ${match.homeScore} - ${match.awayScore} ${match.awayTeam.name}.`,
          type: 'jogo_alterado',
          eventKey: 'match.live_update',
          actionUrl: `/live-match/${matchId}`,
          referenceId: match._id,
          meta: { icon: 'goal', color: 'yellow', buttonText: 'Ver golo' }
        })
      ]);
    }

    return res.status(201).json({
      success: true,
      message: 'Evento adicionado com sucesso',
      data: match
    });
  } catch (error) {
    // Tentar determinar o status code apropriado
    let statusCode = 500;
    if (error.message.includes('não encontrado')) {
      statusCode = 404;
    } else if (error.message.includes('autorizado')) {
      statusCode = 403;
    }

    logger.error('Failed to add live match event', error.message);

    return res.status(statusCode).json({
      success: false,
      message: error.message
    });
  }
};

// ===== UPDATE MATCH STATUS =====
/**
 * POST /live-match/:matchId/status
 * Atualiza o status do jogo
 *
 * BODY:
 * {
 *   status: "live" | "halftime" | "second_half" | "finished"
 * }
 */
exports.updateMatchStatus = async (req, res) => {
  try {
    const { matchId } = req.params;
    const { status } = req.body;

    // Validar autenticação
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Utilizador não autenticado'
      });
    }

    // Validar autorização do manager
    try {
      await LiveMatchService.validateManagerByManagerId(matchId, req.user.id, req.user.role);
    } catch (error) {
      return res.status(403).json({
        success: false,
        message: error.message
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status é obrigatório'
      });
    }

    // Atualizar status
    const match = await LiveMatchService.updateMatchStatus(matchId, status);

    // Emitir Socket.io event
    const io = req.app.get('io');
    if (io) {
      io.emit(`match:${matchId}:update`, {
        event: 'status_change',
        status: status,
        match: match
      });
    }

    return res.status(200).json({
      success: true,
      message: `Status do jogo atualizado para: ${status}`,
      data: match
    });
  } catch (error) {
    logger.error('Failed to update live match status', error.message);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ===== FINISH MATCH =====
/**
 * POST /live-match/:matchId/finish
 * Termina o jogo e atualiza as classificações automaticamente
 *
 * BODY:
 * {
 *   league: string,
 *   season: string
 * }
 */
exports.finishMatch = async (req, res) => {
  try {
    const { matchId } = req.params;
    const { league, season } = req.body;

    // Validar autenticação
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Utilizador não autenticado'
      });
    }

    // Validar autorização do manager
    try {
      await LiveMatchService.validateManagerByManagerId(matchId, req.user.id, req.user.role);
    } catch (error) {
      return res.status(403).json({
        success: false,
        message: error.message
      });
    }

    if (!league || !season) {
      return res.status(400).json({
        success: false,
        message: 'Liga e temporada são obrigatórias'
      });
    }

    // Terminar jogo e atualizar classificações
    const match = await LiveMatchService.finishMatch(matchId, league, season);

    // Emitir Socket.io event
    const io = req.app.get('io');
    if (io) {
      io.emit(`match:${matchId}:update`, {
        event: 'match_finished',
        match: match
      });
    }

    await Promise.all([
      notifyFavoriteTeamFollowers(match.homeTeam._id, 'finalResult', {
        title: `Final: ${match.homeTeam.name} ${match.homeScore} - ${match.awayScore} ${match.awayTeam.name}`,
        message: `O jogo terminou com resultado final ${match.homeScore}-${match.awayScore}.`,
        type: 'relatório_recebido',
        eventKey: 'favorite.team_update',
        actionUrl: `/match/${matchId}`,
        referenceId: match._id,
        meta: { icon: 'flag', color: 'blue', buttonText: 'Ver resumo' }
      }),
      notifyFavoriteTeamFollowers(match.awayTeam._id, 'finalResult', {
        title: `Final: ${match.homeTeam.name} ${match.homeScore} - ${match.awayScore} ${match.awayTeam.name}`,
        message: `O jogo terminou com resultado final ${match.homeScore}-${match.awayScore}.`,
        type: 'relatório_recebido',
        eventKey: 'favorite.team_update',
        actionUrl: `/match/${matchId}`,
        referenceId: match._id,
        meta: { icon: 'flag', color: 'blue', buttonText: 'Ver resumo' }
      })
    ]);

    return res.status(200).json({
      success: true,
      message: 'Jogo terminado e classificações atualizadas',
      data: match
    });
  } catch (error) {
    logger.error('Failed to finish match', error.message);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ===== GET MATCH DETAILS =====
/**
 * GET /live-match/:matchId
 * Obtém detalhes completos do jogo com eventos
 */
// Método GET - Obter detalhes do jogo
exports.getMatchDetails = async (req, res) => {
  try {
    const { matchId } = req.params;

    // Validar autenticação
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Utilizador não autenticado'
      });
    }

    // Validação básica
    if (!matchId) {
      return res.status(400).json({
        success: false,
        message: 'ID do jogo é obrigatório'
      });
    }

    // Obter detalhes do jogo
    const match = await LiveMatchService.getMatchDetails(matchId);

    if (!match) {
      return res.status(404).json({
        success: false,
        message: 'Jogo não encontrado'
      });
    }

    // Verificar autorização
    // NOTA: Qualquer user autenticado pode VER os detalhes do jogo (read-only)
    // Restrições aplicam-se apenas a operações de ESCRITA (editar, adicionar eventos, etc)
    
    // Adicionar flag de permissão ao response
    let canEditMatch = false;

    if (req.user.role === 'admin') {
      canEditMatch = true;
    } else if (isClubManagerRole(req.user.role)) {
      const managerTeamId = req.user.assignedTeam ? String(req.user.assignedTeam) : null;
      const homeTeamId = match.homeTeam?._id ? String(match.homeTeam._id) : null;
      const awayTeamId = match.awayTeam?._id ? String(match.awayTeam._id) : null;
      const isTeamInMatch = managerTeamId && (managerTeamId === homeTeamId || managerTeamId === awayTeamId);

      logger.info(`[canEdit] user=${req.user.id} role=${req.user.role} assignedTeam=${managerTeamId} homeTeam=${homeTeamId} awayTeam=${awayTeamId} isTeamInMatch=${isTeamInMatch} managerId=${match.managerId}`);

      // Qualquer manager cuja equipa está no jogo pode editar
      if (isTeamInMatch) {
        canEditMatch = true;
      }
    }

    res.status(200).json({
      success: true,
      data: match,
      permissions: {
        canEdit: canEditMatch,
        _debug: {
          userId: req.user.id,
          userRole: req.user.role,
          userAssignedTeam: req.user.assignedTeam,
          matchHomeTeamId: match.homeTeam?._id ? String(match.homeTeam._id) : null,
          matchAwayTeamId: match.awayTeam?._id ? String(match.awayTeam._id) : null
        }
      }
    });
  } catch (error) {
    logger.error('Failed to fetch live match details', error.message);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ===== ADD ADDED TIME =====
/**
 * POST /live-match/:matchId/added-time
 * Adiciona tempo adicional ao jogo
 *
 * BODY:
 * {
 *   minutes: number
 * }
 */
exports.addAddedTime = async (req, res) => {
  try {
    const { matchId } = req.params;
    const { minutes } = req.body;

    // Validar autenticação
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Utilizador não autenticado'
      });
    }

    // Validar autorização do manager
    try {
      await LiveMatchService.validateManagerByManagerId(matchId, req.user.id, req.user.role);
    } catch (error) {
      return res.status(403).json({
        success: false,
        message: error.message
      });
    }

    if (!minutes || minutes <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Minutos válidos são obrigatórios'
      });
    }

    // Atualizar tempo adicional
    const match = await Match.findByIdAndUpdate(
      matchId,
      { $inc: { 'addedTime': minutes } },
      { new: true }
    )
      .populate('homeTeam', 'id name logo')
      .populate('awayTeam', 'id name logo');

    if (!match) {
      return res.status(404).json({
        success: false,
        message: 'Jogo não encontrado'
      });
    }

    // Emitir Socket.io event
    const io = req.app.get('io');
    if (io) {
      io.emit(`match:${matchId}:update`, {
        event: 'added_time',
        addedTime: match.addedTime,
        match: match
      });
    }

    return res.status(200).json({
      success: true,
      message: `${minutes} minuto(s) adicional(is) adicionado(s)`,
      data: match
    });
  } catch (error) {
    logger.error('Failed to add stoppage time', error.message);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ===== GET LINEUP =====
/**
 * GET /live-match/:matchId/lineup/:teamId
 * Obtém a escalação (starters + substitutes) de uma equipa num jogo
 */
exports.getLineup = async (req, res) => {
  try {
    const { matchId, teamId } = req.params;

    if (!matchId || !teamId) {
      return res.status(400).json({
        success: false,
        message: 'matchId e teamId são obrigatórios'
      });
    }

    const lineup = await LiveMatchService.getLineup(matchId, teamId);

    if (!lineup) {
      return res.status(200).json({
        success: true,
        data: null,
        message: 'Escalacao ainda nao registada'
      });
    }

    return res.status(200).json({
      success: true,
      data: lineup
    });
  } catch (error) {
    logger.error('Failed to fetch live match lineup', error.message);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ===== GET ALL LINEUPS FOR MATCH =====
/**
 * GET /live-match/:matchId/lineups
 * Obtém as escalações de ambas as equipas num jogo
 */
exports.getMatchLineups = async (req, res) => {
  try {
    const { matchId } = req.params;

    if (!matchId) {
      return res.status(400).json({
        success: false,
        message: 'matchId é obrigatório'
      });
    }

    const lineupData = await LiveMatchService.getMatchLineups(matchId);

    return res.status(200).json({
      success: true,
      data: lineupData
    });
  } catch (error) {
    if (error.message === 'Jogo não encontrado') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    logger.error('Failed to fetch all live match lineups', error.message);

    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
