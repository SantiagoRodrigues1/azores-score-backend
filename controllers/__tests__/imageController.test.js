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
const { createUserNotification } = require('../../services/features/notificationService');
const imageController = require('../imageController');

function flushPromises() {
  return new Promise((resolve) => setImmediate(resolve));
}

function createResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
}

describe('imageController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uploads a player image with provider metadata', async () => {
    const req = {
      body: { playerId: 'player-1', imageBase64: 'data:image/png;base64,AAAA' },
      user: { id: 'user-1' }
    };
    const res = createResponse();

    Player.findById.mockResolvedValue({ _id: 'player-1' });
    uploadBase64Image.mockResolvedValue({
      url: 'https://cdn.example.com/player.png',
      publicId: 'player-image',
      provider: 'cloudinary',
      mimeType: 'image/png',
      sizeBytes: 1234,
      storagePath: null
    });
    ImageUpload.create.mockResolvedValue({ _id: 'upload-1' });

    imageController.uploadPlayerImage(req, res, jest.fn());
    await flushPromises();

    expect(uploadBase64Image).toHaveBeenCalledWith('data:image/png;base64,AAAA', 'azores-score/players');
    expect(ImageUpload.create).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://cdn.example.com/player.png',
      playerId: 'player-1',
      uploadedBy: 'user-1',
      provider: 'cloudinary'
    }));
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('approves an upload and updates the player image', async () => {
    const image = {
      playerId: 'player-1',
      uploadedBy: 'user-2',
      url: 'https://cdn.example.com/player.png',
      save: jest.fn()
    };
    const req = {
      params: { id: 'upload-1' },
      body: { status: 'approved', moderationNote: 'Imagem limpa' }
    };
    const res = createResponse();

    ImageUpload.findById.mockResolvedValue(image);

    imageController.reviewUpload(req, res, jest.fn());
    await flushPromises();

    expect(image.status).toBe('approved');
    expect(image.moderationNote).toBe('Imagem limpa');
    expect(image.save).toHaveBeenCalled();
    expect(Player.findByIdAndUpdate).toHaveBeenCalledWith('player-1', {
      image: 'https://cdn.example.com/player.png',
      photo: 'https://cdn.example.com/player.png'
    });
    expect(createUserNotification).toHaveBeenCalled();
  });
});