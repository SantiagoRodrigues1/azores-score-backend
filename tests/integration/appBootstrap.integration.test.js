const request = require('supertest');
const { createTestContext, clearDatabase, destroyTestContext } = require('./helpers/testContext');

describe('app bootstrap integration', () => {
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

  it('serves the root health endpoint', async () => {
    const response = await request(app).get('/');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Backend AzoresScore');
  });

  it('returns a JSON 404 for unknown routes', async () => {
    const response = await request(app).get('/api/unknown-route');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      error: 'Route not found'
    });
  });
});