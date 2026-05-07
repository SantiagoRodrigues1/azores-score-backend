const request = require('supertest');
const Club = require('../../models/Club');
const Competition = require('../../models/Competition');
const Match = require('../../models/Match');
const Referee = require('../../models/Referee');
const { createTestContext, clearDatabase, destroyTestContext } = require('./helpers/testContext');
const { createAuthHeader, createClub, createUser } = require('./helpers/factories');

describe('admin contracts integration', () => {
  let app;

  beforeAll(async () => {
    ({ app } = await createTestContext());
  });

  afterEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await destroyTestContext();
  });

  async function createRefereeTeam() {
    const referees = await Referee.create([
      { name: 'Árbitro Principal Teste', email: 'ref-main@example.com', tipo: 'Árbitro Principal' },
      { name: 'Assistente Um Teste', email: 'ref-ass1@example.com', tipo: 'Assistente 1' },
      { name: 'Assistente Dois Teste', email: 'ref-ass2@example.com', tipo: 'Assistente 2' },
      { name: 'Quarto Árbitro Teste', email: 'ref-fourth@example.com', tipo: '4º Árbitro' },
    ]);

    return [
      { referee: String(referees[0]._id), tipo: 'Árbitro Principal' },
      { referee: String(referees[1]._id), tipo: 'Assistente 1' },
      { referee: String(referees[2]._id), tipo: 'Assistente 2' },
      { referee: String(referees[3]._id), tipo: '4º Árbitro' },
    ];
  }

  it('rejects invalid competition ids when creating clubs', async () => {
    const adminUser = await createUser({ email: 'admin-club-invalid@example.com', role: 'admin' });

    const response = await request(app)
      .post('/api/admin/clubs')
      .set('Authorization', createAuthHeader(adminUser))
      .send({
        name: 'Clube Inválido',
        competitionId: 'competition:invalid'
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/competição inválido|competição inválida|ID de competição inválido/i);
    expect(await Club.countDocuments()).toBe(0);
  });

  it('creates clubs and attaches them to the selected competition', async () => {
    const adminUser = await createUser({ email: 'admin-club-attach@example.com', role: 'admin' });
    const competition = await Competition.create({
      name: 'Campeonato de Teste',
      season: '2025/2026',
      teams: [],
      standings: []
    });

    const response = await request(app)
      .post('/api/admin/clubs')
      .set('Authorization', createAuthHeader(adminUser))
      .send({
        name: 'Clube Canónico',
        competitionId: String(competition._id)
      });

    expect(response.status).toBe(201);

    const refreshedCompetition = await Competition.findById(competition._id).lean();
    expect(refreshedCompetition.teams.map(String)).toContain(String(response.body.data._id));
    expect(refreshedCompetition.standings.some((entry) => String(entry.team) === String(response.body.data._id))).toBe(true);
  });

  it('rejects synthetic team ids when creating matches and returns a 400', async () => {
    const adminUser = await createUser({ email: 'admin-match-invalid@example.com', role: 'admin' });
    const competition = await Competition.create({
      name: 'Campeonato Admin',
      season: '2025/2026',
      teams: [],
      standings: []
    });
    const refereeTeam = await createRefereeTeam();

    const response = await request(app)
      .post('/api/admin/matches')
      .set('Authorization', createAuthHeader(adminUser))
      .send({
        homeTeamId: 'team:azores_score:angrense',
        awayTeamId: 'team:azores_score:maritimo',
        competitionId: String(competition._id),
        date: '2026-08-15T15:00:00.000Z',
        time: '15:00',
        refereeTeam
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/equipa da casa|equipa visitante/i);
    expect(await Match.countDocuments()).toBe(0);
  });

  it('creates matches only when clubs belong to the selected competition', async () => {
    const adminUser = await createUser({ email: 'admin-match-valid@example.com', role: 'admin' });
    const homeClub = await createClub({ name: 'Angrense Teste' });
    const awayClub = await createClub({ name: 'Marítimo Teste' });
    const outsiderClub = await createClub({ name: 'Outsider Teste' });
    const competition = await Competition.create({
      name: 'Campeonato Canonico',
      season: '2025/2026',
      teams: [homeClub._id, awayClub._id],
      standings: [
        { team: homeClub._id, points: 0, played: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
        { team: awayClub._id, points: 0, played: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
      ]
    });
    const refereeTeam = await createRefereeTeam();

    const invalidResponse = await request(app)
      .post('/api/admin/matches')
      .set('Authorization', createAuthHeader(adminUser))
      .send({
        homeTeamId: String(homeClub._id),
        awayTeamId: String(outsiderClub._id),
        competitionId: String(competition._id),
        date: '2026-08-15T15:00:00.000Z',
        time: '15:00',
        refereeTeam
      });

    expect(invalidResponse.status).toBe(400);
    expect(invalidResponse.body.error).toMatch(/não pertencem ao campeonato/i);

    const validResponse = await request(app)
      .post('/api/admin/matches')
      .set('Authorization', createAuthHeader(adminUser))
      .send({
        homeTeamId: String(homeClub._id),
        awayTeamId: String(awayClub._id),
        competitionId: String(competition._id),
        date: '2026-08-15T15:00:00.000Z',
        time: '15:00',
        refereeTeam
      });

    expect(validResponse.status).toBe(201);
    expect(validResponse.body.data.homeTeam._id || validResponse.body.data.homeTeam).toBeDefined();
    expect(await Match.countDocuments()).toBe(1);
  });
});