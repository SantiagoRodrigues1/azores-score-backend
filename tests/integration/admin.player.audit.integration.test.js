const request = require('supertest');
const AuditLog = require('../../models/AuditLog');
const EditRequest = require('../../models/EditRequest');
const Player = require('../../models/Player');
const { createTestContext, clearDatabase, destroyTestContext } = require('./helpers/testContext');
const { createAuthHeader, createClub, createPlayer, createUser } = require('./helpers/factories');

describe('admin player audit integration', () => {
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

  it('closes pending edit requests and records an audit log when admin updates a player via admin route', async () => {
    const club = await createClub({ name: 'Madalena Audit Club' });
    const adminUser = await createUser({ email: 'admin-player-audit@example.com', role: 'admin' });
    const requester = await createUser({ email: 'fan-player-audit@example.com', role: 'fan' });
    const player = await createPlayer({ team: club._id, name: 'Audit Player', numero: 7, position: 'Defesa Central' });

    await EditRequest.create({
      playerId: player._id,
      field: 'position',
      oldValue: 'Defesa Central',
      newValue: 'Avançado',
      justification: 'Pedido pendente para testar reconciliação.',
      userId: requester._id,
      playerSnapshot: {
        id: String(player._id),
        name: player.name,
        nome: player.nome,
        numero: String(player.numero),
        position: player.position,
        email: player.email || '',
        nickname: player.nickname || '',
        team: String(player.team),
        teamName: club.name,
        photo: player.photo || null,
        image: player.image || null
      }
    });

    const response = await request(app)
      .put(`/api/admin/players/${player._id}`)
      .set('Authorization', createAuthHeader(adminUser))
      .send({ position: 'Médio', email: 'audit-player@example.com', photo: 'https://example.com/player.png' });

    expect(response.status).toBe(200);

    const refreshedPlayer = await Player.findById(player._id).lean();
    expect(refreshedPlayer.position).toBe('Médio');
    expect(refreshedPlayer.email).toBe('audit-player@example.com');
    expect(refreshedPlayer.photo).toBe('https://example.com/player.png');

    const closedRequest = await EditRequest.findOne({ playerId: player._id }).lean();
    expect(closedRequest.status).toBe('rejected');
    expect(closedRequest.reviewedBy.toString()).toBe(adminUser._id.toString());
    expect(closedRequest.reviewNote).toMatch(/alteração administrativa direta/i);

    const auditEntry = await AuditLog.findOne({ entity: 'Player', action: 'UPDATE', entityId: String(player._id) }).lean();
    expect(auditEntry).toBeTruthy();
    expect(auditEntry.userId.toString()).toBe(adminUser._id.toString());
    expect(auditEntry.changes.before.position).toBe('Defesa Central');
    expect(auditEntry.changes.after.position).toBe('Médio');
    expect(auditEntry.changes.after.photo).toBe('https://example.com/player.png');
  });

  it('closes pending edit requests and records an audit log when admin deletes a player via manager route', async () => {
    const club = await createClub({ name: 'Delete Audit Club' });
    const adminUser = await createUser({ email: 'admin-player-delete@example.com', role: 'admin' });
    const requester = await createUser({ email: 'fan-player-delete@example.com', role: 'fan' });
    const player = await createPlayer({ team: club._id, name: 'Delete Me', numero: 22, position: 'Médio' });

    await EditRequest.create({
      playerId: player._id,
      field: 'nickname',
      oldValue: '',
      newValue: 'Capitão',
      justification: 'Pedido pendente antes da remoção.',
      userId: requester._id,
      playerSnapshot: {
        id: String(player._id),
        name: player.name,
        nome: player.nome,
        numero: String(player.numero),
        position: player.position,
        email: player.email || '',
        nickname: player.nickname || '',
        team: String(player.team),
        teamName: club.name,
        photo: player.photo || null,
        image: player.image || null
      }
    });

    const response = await request(app)
      .delete(`/api/players/${player._id}`)
      .set('Authorization', createAuthHeader(adminUser));

    expect(response.status).toBe(200);
    expect(await Player.findById(player._id).lean()).toBeNull();

    const closedRequest = await EditRequest.findOne({ playerId: player._id }).lean();
    expect(closedRequest.status).toBe('rejected');
    expect(closedRequest.reviewNote).toMatch(/removid[oa] pela administração/i);

    const auditEntry = await AuditLog.findOne({ entity: 'Player', action: 'DELETE', entityId: String(player._id) }).lean();
    expect(auditEntry).toBeTruthy();
    expect(auditEntry.userId.toString()).toBe(adminUser._id.toString());
    expect(auditEntry.changes.before.name).toBe('Delete Me');
    expect(auditEntry.changes.after).toBeNull();
  });
});