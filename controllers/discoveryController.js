const Player = require('../models/Player');
const Club = require('../models/Club');
const mongoose = require('mongoose');
const asyncHandler = require('../utils/asyncHandler');
const { trackView, getTrending, smartSearch, getRecentActivity } = require('../services/features/discoveryService');
const { getAchievementsForUser } = require('../services/features/achievementService');
const teamService = require('../services/teamService');

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseComparisonTeamFilter(teamFilter = '') {
  const [campeonato, ...teamNameParts] = String(teamFilter || '').split('::');

  if (teamNameParts.length > 0) {
    return {
      campeonato: campeonato || 'azores_score',
      teamName: teamNameParts.join('::').trim()
    };
  }

  return {
    campeonato: 'azores_score',
    teamName: String(teamFilter || '').trim()
  };
}

function mapPlayerForComparison(player, fallbackTeamName = null) {
  const playerId = String(player._id || player.id || '');

  return {
    _id: playerId,
    id: playerId,
    name: player.name || player.nome || 'Sem nome',
    nome: player.nome || player.name || 'Sem nome',
    numero: String(player.numero || player.number || ''),
    position: player.position || 'Outro',
    team: player.team || player.teamId || null,
    teamId: player.teamId || player.team || null,
    teamName: player.teamName || fallbackTeamName || null,
    photo: player.photo || player.image || null,
    image: player.image || player.photo || null,
    goals: player.goals || 0,
    assists: player.assists || 0
  };
}

function filterPlayersByName(players, nameQuery) {
  if (!nameQuery) {
    return players;
  }

  const regex = new RegExp(escapeRegExp(nameQuery), 'i');
  return players.filter((player) =>
    regex.test(String(player.name || '')) ||
    regex.test(String(player.nome || '')) ||
    regex.test(String(player.nickname || ''))
  );
}

exports.listComparisonPlayers = asyncHandler(async (req, res) => {
  const name = String(req.query.name || '').trim();
  const team = String(req.query.team || '').trim();
  const limit = Math.min(Math.max(Number(req.query.limit || 30), 1), 100);

  if (team) {
    const { campeonato, teamName } = parseComparisonTeamFilter(team);
    const players = await teamService.findPlayersForTeamName(teamName, campeonato);
    const filteredPlayers = filterPlayersByName(players, name)
      .slice(0, limit)
      .map((player) => mapPlayerForComparison(player, teamName));

    return res.json({ success: true, data: filteredPlayers });
  }

  const query = name
    ? {
        $or: [
          { name: { $regex: escapeRegExp(name), $options: 'i' } },
          { nome: { $regex: escapeRegExp(name), $options: 'i' } },
          { nickname: { $regex: escapeRegExp(name), $options: 'i' } }
        ]
      }
    : {};
  const players = await Player.find(query).sort({ name: 1, nome: 1 }).limit(limit).lean();
  const relatedClubIds = Array.from(
    new Set(players.map((player) => String(player.team || '')).filter((value) => mongoose.Types.ObjectId.isValid(value)))
  );
  const clubsById = new Map(
    (relatedClubIds.length ? await Club.find({ _id: { $in: relatedClubIds } }).select('name').lean() : []).map((club) => [String(club._id), club.name])
  );

  res.json({
    success: true,
    data: players.map((player) => mapPlayerForComparison(player, clubsById.get(String(player.team || ''))))
  });
});

exports.trackView = asyncHandler(async (req, res) => {
  await trackView({
    entityType: req.body.entityType,
    entityId: req.body.entityId,
    userId: req.user?.id
  });
  res.status(201).json({ success: true });
});

exports.getTrending = asyncHandler(async (req, res) => {
  const data = await getTrending(Number(req.query.limit || 5));
  res.json({ success: true, data });
});

exports.smartSearch = asyncHandler(async (req, res) => {
  const query = String(req.query.q || '').trim();
  if (!query) {
    return res.json({ success: true, data: { players: [], teams: [], news: [] } });
  }
  const results = await smartSearch(query, Number(req.query.limit || 6));
  res.json({ success: true, data: results });
});

exports.comparePlayers = asyncHandler(async (req, res) => {
  const firstPlayerId = String(req.query.firstPlayerId || '').trim();
  const secondPlayerId = String(req.query.secondPlayerId || '').trim();

  if (!firstPlayerId || !secondPlayerId) {
    return res.status(400).json({ success: false, message: 'É obrigatório indicar dois jogadores.' });
  }

  if (firstPlayerId === secondPlayerId) {
    return res.status(400).json({ success: false, message: 'Os jogadores a comparar têm de ser diferentes.' });
  }

  const [first, second] = await Promise.all([
    teamService.getPlayerDetails(firstPlayerId),
    teamService.getPlayerDetails(secondPlayerId)
  ]);

  res.json({
    success: true,
    data: {
      first,
      second,
      comparison: {
        goals: { first: first.goals || 0, second: second.goals || 0 },
        assists: { first: first.assists || 0, second: second.assists || 0 },
        position: { first: first.position, second: second.position },
        team: {
          first: first.teamName || first.team || null,
          second: second.teamName || second.team || null
        }
      }
    }
  });
});

exports.getMyAchievements = asyncHandler(async (req, res) => {
  const achievements = await getAchievementsForUser(req.user.id);
  res.json({ success: true, data: achievements });
});

exports.getRecentActivity = asyncHandler(async (req, res) => {
  const items = await getRecentActivity(Number(req.query.limit || 8));
  res.json({ success: true, data: items });
});
