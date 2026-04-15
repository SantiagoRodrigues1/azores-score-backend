const express = require('express');
const request = require('supertest');

jest.mock('../../middleware/auth', () => ({
  verifyToken: (req, _res, next) => {
    req.user = { id: 'user-1', role: 'admin' };
    next();
  },
  verifyAdmin: (_req, _res, next) => next()
}));

jest.mock('../../models/Submission', () => ({
  create: jest.fn(),
  find: jest.fn(),
  findById: jest.fn()
}));

jest.mock('../../services/features/submissionService', () => ({
  normalizeSubmissionPayload: jest.fn(),
  materializeSubmission: jest.fn()
}));

jest.mock('../../services/features/notificationService', () => ({
  createUserNotification: jest.fn()
}));

const Submission = require('../../models/Submission');
const { normalizeSubmissionPayload } = require('../../services/features/submissionService');
const router = require('../submissionRoutes');

function createApp() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/submissions', router);
  app.use((err, _req, res, _next) => {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  });
  return app;
}

describe('submissionRoutes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects invalid player submissions at the route layer', async () => {
    const app = createApp();

    const response = await request(app)
      .post('/submissions')
      .send({ type: 'player', data: { name: 'A' } });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it('accepts valid player submissions', async () => {
    const app = createApp();
    normalizeSubmissionPayload.mockResolvedValue({
      name: 'João Silva',
      numero: '10',
      position: 'Médio',
      teamId: '507f1f77bcf86cd799439011'
    });
    Submission.create.mockResolvedValue({ _id: 'submission-1' });

    const response = await request(app)
      .post('/submissions')
      .send({
        type: 'player',
        data: {
          name: 'João Silva',
          numero: 10,
          position: 'Médio',
          teamId: '507f1f77bcf86cd799439011'
        }
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(Submission.create).toHaveBeenCalled();
  });
});