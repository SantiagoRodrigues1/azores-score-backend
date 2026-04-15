const Club = require('../../../models/Club');
const Match = require('../../../models/Match');
const Player = require('../../../models/Player');
const User = require('../../../models/User');
const { signJwt } = require('../../../utils/jwt');

async function createUser(overrides = {}) {
  const user = await User.create({
    name: overrides.name || 'Test User',
    email: overrides.email || `user-${Date.now()}-${Math.random()}@example.com`,
    password: overrides.password || 'password123',
    role: overrides.role || 'fan',
    assignedTeam: overrides.assignedTeam || null,
    status: overrides.status || 'active'
  });

  return user;
}

function createAuthHeader(user) {
  return `Bearer ${signJwt({ id: user._id.toString(), email: user.email, role: user.role, assignedTeam: user.assignedTeam || null }, { expiresIn: '1h' })}`;
}

async function createClub(overrides = {}) {
  return Club.create({
    name: overrides.name || `Clube ${Date.now()} ${Math.random()}`,
    island: overrides.island || 'Açores',
    stadium: overrides.stadium || 'Estádio Teste',
    foundedYear: overrides.foundedYear || 1990,
    colors: overrides.colors || { primary: '#0f766e', secondary: '#ffffff' }
  });
}

async function createPlayer(overrides = {}) {
  return Player.create({
    name: overrides.name || 'Jogador Teste',
    nome: overrides.nome || overrides.name || 'Jogador Teste',
    numero: String(overrides.numero || 10),
    position: overrides.position || 'Médio',
    team: String(overrides.team),
    email: overrides.email || ''
  });
}

async function createMatch(overrides = {}) {
  return Match.create({
    homeTeam: overrides.homeTeam,
    awayTeam: overrides.awayTeam,
    competition: overrides.competition || null,
    date: overrides.date || new Date('2026-04-11T15:00:00.000Z'),
    time: overrides.time || '15:00',
    status: overrides.status || 'scheduled',
    homeScore: overrides.homeScore || 0,
    awayScore: overrides.awayScore || 0,
    managerId: overrides.managerId || null
  });
}

module.exports = {
  createUser,
  createAuthHeader,
  createClub,
  createPlayer,
  createMatch
};