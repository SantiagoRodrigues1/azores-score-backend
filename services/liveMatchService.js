// services/liveMatchService.js
const Match = require('../models/Match');
const Standing = require('../models/Standing');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

/**
 * Serviço de Gestão de Eventos de Jogo em Direto
 */

class LiveMatchService {
  /**
   * Inicia um jogo (altera status para "live")
   */
  static async startMatch(matchId) {
    try {
      const match = await Match.findByIdAndUpdate(
        matchId,
        { status: 'live' },
        { new: true }
      )
        .populate('homeTeam', 'id name logo')
        .populate('awayTeam', 'id name logo');

      if (!match) {
        throw new Error('Jogo não encontrado');
      }

      logger.debug(`Live match started: ${match.homeTeam.name} vs ${match.awayTeam.name}`);
      return match;
    } catch (error) {
      logger.error('Failed to start live match', error.message);
      throw error;
    }
  }

  /**
   * Adiciona um evento ao jogo
   * Valida se o manager pertence a uma das equipas
   */
  static async addMatchEvent(matchId, userId, eventData) {
    try {
      const { type, minute, playerId, playerInId, playerOutId, assistId } = eventData;

      // Buscar o jogo
      const match = await Match.findById(matchId)
        .populate('homeTeam', 'id name')
        .populate('awayTeam', 'id name');

      if (!match) {
        throw new Error('Jogo não encontrado');
      }

      // Validar se o manager pertence a uma das equipas
      const user = await mongoose.model('User')
        .findById(userId);

      if (!user) {
        throw new Error('Utilizador não encontrado');
      }

      const managerTeamId = user.assignedTeam;
      const isHomeTeam = match.homeTeam._id.toString() === managerTeamId?.toString();
      const isAwayTeam = match.awayTeam._id.toString() === managerTeamId?.toString();

      if (!isHomeTeam && !isAwayTeam) {
        throw new Error('Manager não autorizado para este jogo');
      }

      const teamId = isHomeTeam ? match.homeTeam._id : match.awayTeam._id;
      const teamName = isHomeTeam ? match.homeTeam.name : match.awayTeam.name;
      logger.debug(`Manager authorized for ${teamName}`);

      // Criar evento
      const event = {
        type,
        minute,
        team: teamId,
        timestamp: new Date()
      };

      // Processar por tipo de evento
      if (type === 'goal') {
        if (!playerId) {
          throw new Error('Jogador marcador é obrigatório para golo');
        }
        event.player = playerId;

        // Adicionar assistidor se fornecido
        if (assistId) {
          event.assistedBy = assistId;
        }

        // Atualizar score
        if (isHomeTeam) {
          match.homeScore += 1;
        } else {
          match.awayScore += 1;
        }

        const assistInfo = assistId ? ' com assistência' : '';
        logger.debug(
          `Goal${assistInfo}: ${match.homeTeam.name} ${match.homeScore} - ${match.awayScore} ${match.awayTeam.name}`
        );
      } else if (type === 'yellow_card' || type === 'red_card') {
        if (!playerId) {
          throw new Error('Jogador é obrigatório para cartão');
        }
        event.player = playerId;
      } else if (type === 'substitution') {
        if (!playerInId || !playerOutId) {
          throw new Error('Jogador entrada e saída são obrigatórios para substituição');
        }
        event.playerIn = playerInId;
        event.playerOut = playerOutId;
      }

      // Adicionar evento ao jogo
      match.events.push(event);
      match.updatedAt = new Date();

      // Salvar jogo
      await match.save();

      // Buscar jogo atualizado para retornar com populações
      const updatedMatch = await Match.findById(matchId)
        .populate('homeTeam', 'id name logo')
        .populate('awayTeam', 'id name logo')
        .populate('events.player', 'name number')
        .populate('events.playerIn', 'name number')
        .populate('events.playerOut', 'name number');

      return updatedMatch;
    } catch (error) {
      logger.error('Failed to add live match event', error.message);
      throw error;
    }
  }

  /**
   * Atualiza o status do jogo
   */
  static async updateMatchStatus(matchId, newStatus) {
    try {
      const validStatuses = ['scheduled', 'live', 'halftime', 'second_half', 'finished', 'postponed', 'cancelled'];

      if (!validStatuses.includes(newStatus)) {
        throw new Error(`Status inválido: ${newStatus}`);
      }

      const match = await Match.findByIdAndUpdate(
        matchId,
        { status: newStatus },
        { new: true }
      )
        .populate('homeTeam', 'id name logo')
        .populate('awayTeam', 'id name logo');

      if (!match) {
        throw new Error('Jogo não encontrado');
      }

      const statusMessages = {
        'scheduled': 'scheduled',
        'live': 'live',
        'halftime': 'halftime',
        'second_half': 'second_half',
        'finished': 'finished',
        'postponed': 'postponed',
        'cancelled': 'cancelled'
      };

      logger.debug(`Live match status updated: ${statusMessages[newStatus]}`);
      return match;
    } catch (error) {
      logger.error('Failed to update live match status', error.message);
      throw error;
    }
  }

  /**
   * Termina o jogo e atualiza as classificações
   */
  static async finishMatch(matchId, leagueName, season) {
    try {
      const match = await Match.findByIdAndUpdate(
        matchId,
        { status: 'finished' },
        { new: true }
      )
        .populate('homeTeam')
        .populate('awayTeam');

      if (!match) {
        throw new Error('Jogo não encontrado');
      }

      const homeTeamId = match.homeTeam._id;
      const awayTeamId = match.awayTeam._id;

      // Determinar resultado
      let homeResult, awayResult;
      if (match.homeScore > match.awayScore) {
        homeResult = 'win';
        awayResult = 'loss';
      } else if (match.awayScore > match.homeScore) {
        homeResult = 'loss';
        awayResult = 'win';
      } else {
        homeResult = 'draw';
        awayResult = 'draw';
      }

      // Atualizar classificação da equipa da casa
      await this._updateTeamStanding(
        homeTeamId,
        match.homeTeam.name,
        homeResult,
        match.homeScore,
        match.awayScore,
        leagueName,
        season
      );

      // Atualizar classificação da equipa visitante
      await this._updateTeamStanding(
        awayTeamId,
        match.awayTeam.name,
        awayResult,
        match.awayScore,
        match.homeScore,
        leagueName,
        season
      );
      logger.debug(`Standings updated for match ${matchId}`);

      return match;
    } catch (error) {
      logger.error('Failed to finish live match', error.message);
      throw error;
    }
  }

  /**
   * Atualiza a classificação de uma equipa (helper)
   */
  static async _updateTeamStanding(
    teamId,
    teamName,
    result,
    goalsFor,
    goalsAgainst,
    leagueName,
    season
  ) {
    try {
      // Buscar ou criar classificação
      let standing = await Standing.findOne(
        { league: leagueName, season, team: teamName }
      );

      if (!standing) {
        standing = new Standing({
          league: leagueName,
          season,
          team: teamName,
          position: 0,
          played: 0,
          won: 0,
          drawn: 0,
          lost: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          goalDifference: 0,
          points: 0
        });
      }

      // Atualizar estatísticas
      standing.played += 1;
      standing.goalsFor += goalsFor;
      standing.goalsAgainst += goalsAgainst;
      standing.goalDifference = standing.goalsFor - standing.goalsAgainst;

      switch (result) {
        case 'win':
          standing.won += 1;
          standing.points += 3;
          break;
        case 'draw':
          standing.drawn += 1;
          standing.points += 1;
          break;
        case 'loss':
          standing.lost += 1;
          break;
      }

      standing.lastUpdated = new Date();

      await standing.save();
    } catch (error) {
      logger.error(`Failed to update standing for ${teamName}`, error.message);
      throw error;
    }
  }

  /**
   * Obtém um jogo com detalhes completos
   */
  static async getMatchDetails(matchId) {
    try {
      const match = await Match.findById(matchId)
        .populate('homeTeam', 'id name logo colors')
        .populate('awayTeam', 'id name logo colors')
        .populate('events.player', 'name number position')
        .populate('events.playerIn', 'name number position')
        .populate('events.playerOut', 'name number position');

      if (!match) {
        throw new Error('Jogo não encontrado');
      }

      return match;
    } catch (error) {
      logger.error('Failed to fetch live match details', error.message);
      throw error;
    }
  }

  /**
   * Busca a escalação de um jogo para uma equipa específica
   */
  static async getLineup(matchId, teamId) {
    try {
      const Lineup = mongoose.model('Lineup');
      
      const lineup = await Lineup.findOne({
        match: matchId,
        team: teamId
      })
        .populate('team', 'id name logo')
        .populate('starters.playerId', 'id name number position')
        .populate('substitutes.playerId', 'id name number position');

      if (!lineup) {
        return null;
      }
      return lineup;
    } catch (error) {
      logger.error('Failed to fetch live match lineup', error.message);
      throw error;
    }
  }

  /**
   * Busca as escalações de ambas as equipas de um jogo
   */
  static async getMatchLineups(matchId) {
    try {
      const Match = require('../models/Match');
      const Lineup = mongoose.model('Lineup');

      // Buscar o match para obter as equipas
      const match = await Match.findById(matchId)
        .populate('homeTeam', 'id name')
        .populate('awayTeam', 'id name');

      if (!match) {
        throw new Error('Jogo não encontrado');
      }

      // Buscar escalações de ambas as equipas
      const lineups = await Lineup.find({
        match: matchId,
        team: { $in: [match.homeTeam._id, match.awayTeam._id] }
      })
        .populate('team', 'id name logo')
        .populate('starters.playerId', 'id name number position')
        .populate('substitutes.playerId', 'id name number position');
      return {
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        lineups: lineups
      };
    } catch (error) {
      logger.error('Failed to fetch live match lineups', error.message);
      throw error;
    }
  }

  /**
   * Valida se um manager pode gerenciar um jogo
   */
  static async validateManagerPermission(matchId, userId) {
    try {
      const user = await mongoose.model('User').findById(userId);
      const match = await Match.findById(matchId);

      if (!user) {
        throw new Error('Utilizador não encontrado');
      }

      if (!match) {
        throw new Error('Jogo não encontrado');
      }

      // Admins têm permissão completa
      if (user.role === 'admin') {
        return {
          authorized: true,
          teamId: match.homeTeam,
          isHomeTeam: true
        };
      }

      // Gestores de equipa só podem gerir seus jogos
      const managerTeamId = user.assignedTeam;
      const homeTeamStr = match.homeTeam.toString();
      const awayTeamStr = match.awayTeam.toString();
      const assignedTeamStr = managerTeamId?.toString();
      
      const isHomeTeam = homeTeamStr === assignedTeamStr;
      const isAwayTeam = awayTeamStr === assignedTeamStr;

      if (!isHomeTeam && !isAwayTeam) {
        throw new Error('Manager não está autorizado para gerenciar este jogo');
      }

      return {
        authorized: true,
        teamId: isHomeTeam ? match.homeTeam : match.awayTeam,
        isHomeTeam
      };
    } catch (error) {
      logger.error('Failed to validate manager permission', error.message);
      throw error;
    }
  }

  /**
   * Valida se o user está autorizado a gerenciar o jogo usando managerId
   * 
   * Se managerId estiver definido: verifica se user é admin ou o manager registado
   * Se managerId NÃO estiver definido: faz fallback para validação de assignedTeam
   */
  static async validateManagerByManagerId(matchId, userId, userRole) {
    try {
      const match = await Match.findById(matchId);
      if (!match) {
        throw new Error('Jogo não encontrado');
      }

      // Se for admin, tem autorização total
      if (userRole === 'admin') {
        return true;
      }

      // Validar comparando user.assignedTeam com homeTeam/awayTeam
      const user = await mongoose.model('User').findById(userId);
      if (!user) {
        throw new Error('Utilizador não encontrado');
      }

      const managerTeamId = user.assignedTeam;
      const homeTeamStr = match.homeTeam.toString();
      const awayTeamStr = match.awayTeam.toString();
      const assignedTeamStr = managerTeamId?.toString();

      const isHomeTeam = homeTeamStr === assignedTeamStr;
      const isAwayTeam = awayTeamStr === assignedTeamStr;

      if (isHomeTeam || isAwayTeam) {
        return true;
      }

      throw new Error('Manager não está autorizado para gerenciar este jogo');
    } catch (error) {
      logger.error('Failed to validate live match manager', error.message);
      throw error;
    }
  }
}

module.exports = LiveMatchService;
