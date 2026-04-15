const express = require('express');
const request = require('supertest');

jest.mock('../../middleware/auth', () => ({
  verifyToken: (req, _res, next) => {
    req.user = { id: 'user-1', role: 'admin' };
    next();
  },
  verifyAdmin: (_req, _res, next) => next()
}));

jest.mock('../../models/ImageUpload', () => ({
  create: jest.fn(),
  find: jest.fn(),
  findById: jest.fn()
}));

jest.mock('../../models/Player', () => ({
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn()
}));

jest.mock('../../services/features/cloudinaryService', () => ({
  uploadBase64Image: jest.fn()
}));

jest.mock('../../services/features/notificationService', () => ({
  createUserNotification: jest.fn()
}));

const ImageUpload = require('../../models/ImageUpload');
const Player = require('../../models/Player');
const { uploadBase64Image } = require('../../services/features/cloudinaryService');
const router = require('../imageRoutes');

function createApp() {
  const app = express();
  app.use(express.json({ limit: '6mb' }));
  app.use('/images', router);
  app.use((err, _req, res, _next) => {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  });
  return app;
}

describe('imageRoutes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects invalid image payloads before controller execution', async () => {
    const app = createApp();

    const response = await request(app)
      .post('/images')
      .send({ playerId: '507f1f77bcf86cd799439011', imageBase64: 'invalid-base64' });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it('accepts valid image uploads', async () => {
    const app = createApp();
    Player.findById.mockResolvedValue({ _id: 'player-1' });
    uploadBase64Image.mockResolvedValue({
      url: 'https://cdn.example.com/player.png',
      publicId: 'player-image',
      provider: 'cloudinary',
      mimeType: 'image/png',
      sizeBytes: 512,
      storagePath: null
    });
    ImageUpload.create.mockResolvedValue({ _id: 'upload-1' });

    const response = await request(app)
      .post('/images')
      .send({
        playerId: '507f1f77bcf86cd799439011',
        imageBase64: 'data:image/png;base64,AAAA'
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(uploadBase64Image).toHaveBeenCalled();
  });
});