const request = require('supertest');
const User = require('../../models/User');
const { createTestContext, clearDatabase, destroyTestContext } = require('./helpers/testContext');
const { createUser, createAuthHeader } = require('./helpers/factories');

describe('auth integration', () => {
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

  it('forces public registration to fan role even if admin is requested', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Alice',
        email: 'alice@example.com',
        password: 'password123',
        role: 'admin'
      });

    expect(response.status).toBe(201);
    expect(response.body.user.role).toBe('fan');

    const savedUser = await User.findOne({ email: 'alice@example.com' }).lean();
    expect(savedUser.role).toBe('fan');
  });

  it('allows a registered user to log in', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Bob',
        email: 'bob@example.com',
        password: 'password123'
      });

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'bob@example.com', password: 'password123' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.role).toBe('fan');
    expect(response.body.data.token).toBeTruthy();
  });

  it('blocks public admin registration', async () => {
    const response = await request(app)
      .post('/api/admin/auth/register')
      .send({ email: 'admin@example.com', password: 'password123' });

    expect(response.status).toBe(401);
  });

  it('allows an authenticated admin to create another admin', async () => {
    const adminUser = await createUser({
      name: 'Admin',
      email: 'seed-admin@example.com',
      password: 'password123',
      role: 'admin'
    });

    const response = await request(app)
      .post('/api/admin/auth/register')
      .set('Authorization', createAuthHeader(adminUser))
      .send({ email: 'new-admin@example.com', password: 'password123' });

    expect(response.status).toBe(201);
    expect(response.body.message).toContain('Admin registado');
  });
});