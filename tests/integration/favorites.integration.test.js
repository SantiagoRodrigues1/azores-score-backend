const request = require('supertest');
const FavoriteTeam = require('../../models/FavoriteTeam');
const { createTestContext, clearDatabase, destroyTestContext } = require('./helpers/testContext');
const { createAuthHeader, createClub, createUser } = require('./helpers/factories');

describe('favorites integration', () => {
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

  it('returns normalized favorite items for toggle, list, and settings update', async () => {
    const user = await createUser({ email: 'favorites-user@example.com', role: 'fan' });
    const club = await createClub({ name: 'Favorite Club' });

    const toggleOnResponse = await request(app)
      .post(`/api/user/favorites/toggle/${club._id}`)
      .set('Authorization', createAuthHeader(user));

    expect(toggleOnResponse.status).toBe(200);
    expect(toggleOnResponse.body.data.isFavorite).toBe(true);
    expect(toggleOnResponse.body.data.item.team._id).toBe(String(club._id));
    expect(toggleOnResponse.body.data.item.team.name).toBe('Favorite Club');

    const listResponse = await request(app)
      .get('/api/user/favorites')
      .set('Authorization', createAuthHeader(user));

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toHaveLength(1);
    expect(listResponse.body.data[0].team._id).toBe(String(club._id));

    const settingsResponse = await request(app)
      .put(`/api/user/favorites/settings/${club._id}`)
      .set('Authorization', createAuthHeader(user))
      .send({
        notifications: {
          matchStart: true,
          goals: false,
          finalResult: true
        }
      });

    expect(settingsResponse.status).toBe(200);
    expect(settingsResponse.body.data.team._id).toBe(String(club._id));
    expect(settingsResponse.body.data.notifications.goals).toBe(false);

    const favoriteInDb = await FavoriteTeam.findOne({ userId: user._id, teamId: String(club._id) }).lean();
    expect(favoriteInDb.notifications.goals).toBe(false);

    const toggleOffResponse = await request(app)
      .post(`/api/user/favorites/toggle/${club._id}`)
      .set('Authorization', createAuthHeader(user));

    expect(toggleOffResponse.status).toBe(200);
    expect(toggleOffResponse.body.data.isFavorite).toBe(false);
    expect(toggleOffResponse.body.data.item).toBeNull();
    expect(await FavoriteTeam.countDocuments()).toBe(0);
  });
});