const request = require('supertest');
const EditRequest = require('../../models/EditRequest');
const Match = require('../../models/Match');
const Player = require('../../models/Player');
const { createTestContext, clearDatabase, destroyTestContext } = require('./helpers/testContext');
const { createAuthHeader, createClub, createMatch, createPlayer, createUser } = require('./helpers/factories');

describe('authorization and workflow integration', () => {
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

  it('blocks fan users from admin-only routes', async () => {
    const fanUser = await createUser({ email: 'fan-protected@example.com', role: 'fan' });

    const response = await request(app)
      .get('/api/admin/users')
      .set('Authorization', createAuthHeader(fanUser));

    expect(response.status).toBe(403);
  });

  it('creates, approves, and rejects edit requests through the real app', async () => {
    const club = await createClub({ name: 'São Roque' });
    const fanUser = await createUser({ email: 'fan-edit@example.com', role: 'fan' });
    const adminUser = await createUser({ email: 'admin-edit@example.com', role: 'admin' });
    const player = await createPlayer({ team: club._id, name: 'João Silva', numero: 8, position: 'Médio' });

    const createResponse = await request(app)
      .post('/api/edit-requests')
      .set('Authorization', createAuthHeader(fanUser))
      .send({
        playerId: player._id.toString(),
        field: 'position',
        newValue: 'Avançado',
        justification: 'O jogador passou a atuar mais adiantado nas últimas jornadas.'
      });

    expect(createResponse.status).toBe(201);

    const pendingRequest = await EditRequest.findOne({ userId: fanUser._id }).lean();
    expect(pendingRequest).toBeTruthy();

    const approveResponse = await request(app)
      .put(`/api/edit-requests/${pendingRequest._id}/approve`)
      .set('Authorization', createAuthHeader(adminUser))
      .send({ reviewNote: 'Confirmado pela equipa técnica.' });

    expect(approveResponse.status).toBe(200);

    const updatedPlayer = await Player.findById(player._id).lean();
    expect(updatedPlayer.position).toBe('Avançado');

    const secondCreateResponse = await request(app)
      .post('/api/edit-requests')
      .set('Authorization', createAuthHeader(fanUser))
      .send({
        playerId: player._id.toString(),
        field: 'nickname',
        newValue: 'Craque',
        justification: 'Pedido de atualização de alcunha para refletir uso recente.'
      });

    expect(secondCreateResponse.status).toBe(201);

    const secondRequest = await EditRequest.findOne({ field: 'nickname' }).lean();

    const rejectResponse = await request(app)
      .put(`/api/edit-requests/${secondRequest._id}/reject`)
      .set('Authorization', createAuthHeader(adminUser))
      .send({ reviewNote: 'Sem confirmação documental suficiente.' });

    expect(rejectResponse.status).toBe(200);

    const rejectedRequest = await EditRequest.findById(secondRequest._id).lean();
    expect(rejectedRequest.status).toBe('rejected');
  });

  it('prevents team managers from editing players of other teams', async () => {
    const ownClub = await createClub({ name: 'Operário Lagoa' });
    const otherClub = await createClub({ name: 'Rabo de Peixe' });
    const manager = await createUser({
      email: 'manager@example.com',
      role: 'team_manager',
      assignedTeam: ownClub._id
    });
    const foreignPlayer = await createPlayer({ team: otherClub._id, name: 'Jogador Visitante', numero: 14 });

    const response = await request(app)
      .put(`/api/players/${foreignPlayer._id}`)
      .set('Authorization', createAuthHeader(manager))
      .send({ name: 'Novo Nome' });

    expect(response.status).toBe(403);
  });

  it('allows only the assigned manager or admin to start a live match', async () => {
    const homeClub = await createClub({ name: 'Santa Clara B' });
    const awayClub = await createClub({ name: 'Angrense' });
    const thirdClub = await createClub({ name: 'União Micaelense' });
    const eligibleManager = await createUser({
      email: 'eligible-manager@example.com',
      role: 'team_manager',
      assignedTeam: homeClub._id
    });
    const unrelatedManager = await createUser({
      email: 'unrelated-manager@example.com',
      role: 'team_manager',
      assignedTeam: thirdClub._id
    });

    const fanUser = await createUser({ email: 'fan-live@example.com', role: 'fan' });
    const match = await createMatch({ homeTeam: homeClub._id, awayTeam: awayClub._id });

    const fanResponse = await request(app)
      .post(`/api/live-match/${match._id}/start`)
      .set('Authorization', createAuthHeader(fanUser))
      .send();

    expect(fanResponse.status).toBe(403);

    const unrelatedResponse = await request(app)
      .post(`/api/live-match/${match._id}/start`)
      .set('Authorization', createAuthHeader(unrelatedManager))
      .send();

    expect(unrelatedResponse.status).toBe(403);

    const successResponse = await request(app)
      .post(`/api/live-match/${match._id}/start`)
      .set('Authorization', createAuthHeader(eligibleManager))
      .send();

    expect(successResponse.status).toBe(200);

    const updatedMatch = await Match.findById(match._id).lean();
    expect(updatedMatch.status).toBe('live');
    expect(String(updatedMatch.managerId)).toBe(String(eligibleManager._id));
  });
});