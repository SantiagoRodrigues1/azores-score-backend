const express = require('express');
const request = require('supertest');

jest.mock('../../middleware/auth', () => ({
  verifyToken: (req, _res, next) => {
    req.user = {
      id: req.headers['x-user-id'] || 'user-1',
      role: req.headers['x-user-role'] || 'fan',
      name: req.headers['x-user-name'] || 'Utilizador Teste',
      assignedTeam: req.headers['x-assigned-team'] || null
    };
    next();
  },
  verifyAdmin: (req, res, next) => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Acesso negado.' });
    }
    next();
  }
}));

jest.mock('../../models/EditRequest', () => ({
  create: jest.fn(),
  find: jest.fn(),
  findById: jest.fn()
}));

jest.mock('../../models/Player', () => ({
  findById: jest.fn()
}));

jest.mock('../../models/User', () => ({
  find: jest.fn()
}));

jest.mock('../../services/features/notificationService', () => ({
  createUserNotification: jest.fn(),
  createRoleNotifications: jest.fn()
}));

jest.mock('../../services/teamService', () => ({
  getPlayerDetails: jest.fn(),
  updatePlayerField: jest.fn()
}));

const EditRequest = require('../../models/EditRequest');
const Player = require('../../models/Player');
const teamService = require('../../services/teamService');
const { createRoleNotifications, createUserNotification } = require('../../services/features/notificationService');
const router = require('../editRequestRoutes');

function createApp() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/edit-requests', router);
  app.use((err, _req, res, _next) => {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  });
  return app;
}

describe('editRequestRoutes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a player edit request for a normal authenticated user', async () => {
    const app = createApp();
    Player.findById.mockResolvedValue({
      _id: '507f1f77bcf86cd799439012',
      name: 'João Silva',
      team: '507f1f77bcf86cd799439013',
      numero: '8',
      position: 'Médio'
    });
    EditRequest.create.mockResolvedValue({ _id: 'edit-1', status: 'pending' });

    const response = await request(app)
      .post('/edit-requests')
      .set('x-user-role', 'fan')
      .send({
        playerId: '507f1f77bcf86cd799439012',
        field: 'position',
        newValue: 'Avançado',
        justification: 'O jogador foi reposicionado nas últimas jornadas.'
      });

    expect(response.status).toBe(201);
    expect(EditRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      field: 'position',
      oldValue: 'Médio',
      newValue: 'Avançado'
    }));
    expect(createRoleNotifications).toHaveBeenCalled();
  });

  it('approves a pending request and notifies the user', async () => {
    const app = createApp();
    const savePlayer = jest.fn().mockResolvedValue(undefined);
    const saveEditRequest = jest.fn().mockResolvedValue(undefined);

    EditRequest.findById.mockResolvedValue({
      _id: 'edit-1',
      playerId: '507f1f77bcf86cd799439012',
      userId: '507f1f77bcf86cd799439099',
      field: 'position',
      newValue: 'Avançado',
      status: 'pending',
      save: saveEditRequest
    });
    Player.findById.mockResolvedValue({
      _id: '507f1f77bcf86cd799439012',
      name: 'João Silva',
      position: 'Médio',
      save: savePlayer
    });

    const response = await request(app)
      .put('/edit-requests/edit-1/approve')
      .set('x-user-role', 'admin')
      .send({ reviewNote: 'Confirmado com a equipa técnica.' });

    expect(response.status).toBe(200);
    expect(savePlayer).toHaveBeenCalled();
    expect(saveEditRequest).toHaveBeenCalled();
    expect(createUserNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: '507f1f77bcf86cd799439099',
      type: 'edit_request_approved'
    }));
  });

  it('creates an edit request for a player loaded from real championship collections', async () => {
    const app = createApp();
    Player.findById.mockResolvedValue(null);
    teamService.getPlayerDetails.mockResolvedValue({
      _id: '507f1f77bcf86cd799439044',
      name: 'Rafa Benevides',
      numero: '20',
      position: 'Avançado',
      team: 'team:azores_score:santa-clara-b',
      teamName: 'Santa Clara B'
    });
    EditRequest.create.mockResolvedValue({ _id: 'edit-2', status: 'pending' });

    const response = await request(app)
      .post('/edit-requests')
      .set('x-user-role', 'fan')
      .send({
        playerId: '507f1f77bcf86cd799439044',
        field: 'nickname',
        newValue: 'Rafinha',
        justification: 'É a alcunha usada nos jogos e comunicados recentes.'
      });

    expect(response.status).toBe(201);
    expect(teamService.getPlayerDetails).toHaveBeenCalledWith('507f1f77bcf86cd799439044');
    expect(EditRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      playerSnapshot: expect.objectContaining({
        id: '507f1f77bcf86cd799439044',
        name: 'Rafa Benevides',
        teamName: 'Santa Clara B'
      })
    }));
  });

  it('accepts photo edit requests when the frontend sends the uploaded file as proof', async () => {
    const app = createApp();
    Player.findById.mockResolvedValue({
      _id: '507f1f77bcf86cd799439077',
      name: 'Miguel Brum',
      team: '507f1f77bcf86cd799439013',
      numero: '11',
      position: 'Avançado',
      photo: null,
      image: null
    });
    EditRequest.create.mockResolvedValue({ _id: 'edit-photo-1', status: 'pending' });

    const response = await request(app)
      .post('/edit-requests')
      .set('x-user-role', 'fan')
      .send({
        playerId: '507f1f77bcf86cd799439077',
        field: 'photo',
        newValue: '',
        justification: 'A foto oficial do jogador foi atualizada e precisa de ser corrigida.',
        proof: {
          type: 'image',
          value: 'data:image/png;base64,AAAA'
        }
      });

    expect(response.status).toBe(201);
    expect(EditRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      field: 'photo',
      newValue: 'data:image/png;base64,AAAA'
    }));
  });

  it('approves a pending request for a player from real championship collections', async () => {
    const app = createApp();
    const saveEditRequest = jest.fn().mockResolvedValue(undefined);

    EditRequest.findById.mockResolvedValue({
      _id: 'edit-3',
      playerId: '507f1f77bcf86cd799439055',
      playerSnapshot: {
        id: '507f1f77bcf86cd799439055',
        name: 'Cristiano Fructuoso'
      },
      userId: '507f1f77bcf86cd799439099',
      field: 'photo',
      newValue: 'https://cdn.example.com/cristiano.png',
      status: 'pending',
      save: saveEditRequest
    });
    Player.findById.mockResolvedValue(null);
    teamService.updatePlayerField.mockResolvedValue({
      _id: '507f1f77bcf86cd799439055',
      name: 'Cristiano Fructuoso',
      photo: 'https://cdn.example.com/cristiano.png'
    });

    const response = await request(app)
      .put('/edit-requests/edit-3/approve')
      .set('x-user-role', 'admin')
      .send({ reviewNote: 'Foto oficial confirmada.' });

    expect(response.status).toBe(200);
    expect(teamService.updatePlayerField).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439055',
      'photo',
      'https://cdn.example.com/cristiano.png'
    );
    expect(saveEditRequest).toHaveBeenCalled();
  });
});