const express = require('express');
const request = require('supertest');

jest.mock('../../middleware/auth', () => ({
  verifyToken: (req, _res, next) => {
    req.user = { id: 'user-1', role: 'user' };
    next();
  }
}));

jest.mock('../../models/SocialPost', () => ({
  create: jest.fn(),
  findById: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  countDocuments: jest.fn()
}));

jest.mock('../../models/User', () => ({
  findById: jest.fn()
}));

jest.mock('../../services/features/socialService', () => ({
  toggleLike: jest.fn(),
  addComment: jest.fn(),
  getComments: jest.fn()
}));

jest.mock('../../services/features/achievementService', () => ({
  getAchievementsForUser: jest.fn()
}));

const SocialPost = require('../../models/SocialPost');
const router = require('../communityRoutes');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/community', router);
  app.use((err, _req, res, _next) => {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  });
  return app;
}

describe('communityRoutes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects invalid posts at the route layer', async () => {
    const app = createApp();

    const response = await request(app)
      .post('/community/posts')
      .send({ text: '' });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it('accepts valid post creation', async () => {
    const app = createApp();
    SocialPost.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null)
    });
    SocialPost.create.mockResolvedValue({ _id: 'post-1' });
    SocialPost.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue({
        _id: 'post-1',
        text: 'Grande jogo no derby açoriano!',
        image: null,
        author: { name: 'Maria' }
      })
    });

    const response = await request(app)
      .post('/community/posts')
      .send({ text: 'Grande jogo no derby açoriano!' });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(SocialPost.create).toHaveBeenCalledWith({
      author: 'user-1',
      text: 'Grande jogo no derby açoriano!',
      image: null
    });
  });
});