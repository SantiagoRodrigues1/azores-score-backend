const asyncHandler = require('../utils/asyncHandler');
const teamService = require('../services/teamService');

exports.listTeams = asyncHandler(async (req, res) => {
  const teams = await teamService.listTeams();
  res.json(teams);
});

exports.getProtectedTeamRoster = asyncHandler(async (req, res) => {
  const result = await teamService.getProtectedTeamRoster(req.user, req.params.teamId);
  res.json(result);
});

exports.listPlayersByTeamName = asyncHandler(async (req, res) => {
  const players = await teamService.listPlayersByTeamName(req.params.teamName, req.params.campeonato);
  res.json(players);
});

exports.getPlayerDetails = asyncHandler(async (req, res) => {
  const player = await teamService.getPlayerDetails(req.params.playerId);
  res.json(player);
});