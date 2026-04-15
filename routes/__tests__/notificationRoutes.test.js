const express = require('express');
const request = require('supertest');

jest.mock('../../middleware/auth', () => ({
  verifyToken: (req, _res, next) => {
    req.user = { id: 'user-1', role: 'user' };
    next();
  }
}));

const mockLean = jest.fn();
const mockLimit = jest.fn(() => ({ lean: mockLean }));
const mockSort = jest.fn(() => ({ limit: mockLimit }));
const mockFind = jest.fn(() => ({ sort: mockSort }));

jest.mock('../../models/Notification', () => ({
  find: mockFind,
  countDocuments: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateMany: jest.fn()
}));

const Notification = require('../../models/Notification');
const router = require('../notificationRoutes');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/notifications', router);
  app.use((err, _req, res, _next) => {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  });
  return app;
}

describe('notificationRoutes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists unread notifications with metadata', async () => {
    const app = createApp();
    mockLean.mockResolvedValue([
      { _id: 'notif-1', titulo: 'Jogo começou', lida: false, criadoEm: '2026-04-10T09:00:00.000Z' }
    ]);
    Notification.countDocuments.mockResolvedValue(1);

    const response = await request(app).get('/notifications').query({ status: 'unread', limit: 10 });

    expect(response.status).toBe(200);
    expect(Notification.find).toHaveBeenCalledWith({ userId: 'user-1', lida: false });
    expect(response.body.meta).toEqual({ unreadCount: 1, status: 'unread' });
    expect(response.body.data).toHaveLength(1);
  });

  it('marks all notifications as read', async () => {
    const app = createApp();
    Notification.updateMany.mockResolvedValue({ modifiedCount: 2 });

    const response = await request(app).post('/notifications/read-all').send();

    expect(response.status).toBe(200);
    expect(Notification.updateMany).toHaveBeenCalled();
    expect(response.body.success).toBe(true);
  });
});