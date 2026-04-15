const express = require('express');
const router = express.Router();
const Match = require('../models/Match');
const logger = require('../utils/logger');

// GET /api/matches-by-competition
// Retorna matches agrupados por competição no formato que MatchesPage espera
router.get('/', async (req, res) => {
  try {
    const matches = await Match.find({})
      .populate('homeTeam', 'name logo')
      .populate('awayTeam', 'name logo')
      .populate('competition', 'name')
      .sort({ date: 1, time: 1 })
      .lean();

    const groupedByCompetition = {};
    
    matches.forEach(match => {
      const comp = match.competition?.name || 'Sem Competição';
      if (!groupedByCompetition[comp]) {
        groupedByCompetition[comp] = [];
      }
      groupedByCompetition[comp].push(match);
    });

    const resultado = Object.entries(groupedByCompetition).map(([campeonato, matches]) => {
      return {
        campeonato: campeonato,
        temporada: new Date().getFullYear().toString(),
        proximos_jogos: [
          {
            dia: matches[0]?.date ? new Date(matches[0].date).toLocaleDateString('pt-PT') : new Date().toLocaleDateString('pt-PT'),
            jogos: matches.map(m => {
              const homeTeamName = m.homeTeam?.name || 'Equipa Casa';
              const awayTeamName = m.awayTeam?.name || 'Equipa Fora';
              
              return {
                _id: m._id,
                house: homeTeamName,
                away: awayTeamName,
                casa: homeTeamName,
                fora: awayTeamName,
                casaId: m.homeTeam?._id || null,
                foraId: m.awayTeam?._id || null,
                homeTeam: m.homeTeam ? {
                  id: m.homeTeam._id,
                  name: m.homeTeam.name,
                  logo: m.homeTeam.logo
                } : undefined,
                awayTeam: m.awayTeam ? {
                  id: m.awayTeam._id,
                  name: m.awayTeam.name,
                  logo: m.awayTeam.logo
                } : undefined,
                data_hora: m.date,
                status: m.status,
                resultado: `${m.homeScore || 0}-${m.awayScore || 0}`,
                competicao: m.competition?.name || 'Sem Competição',
                jornada: null,
                estadio: m.stadium || ''
              };
            })
          }
        ]
      };
    });
    res.json(resultado);
  } catch (err) {
    logger.error('Erro ao buscar matches', err);
    res.status(500).json({ 
      error: 'Erro ao carregar matches',
      details: err.message 
    });
  }
});

module.exports = router;
