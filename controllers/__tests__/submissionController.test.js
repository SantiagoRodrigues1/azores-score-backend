jest.mock('../../models/Submission', () => ({
  create: jest.fn(),
  find: jest.fn(),
  findById: jest.fn()
}));

jest.mock('../../services/features/notificationService', () => ({
  createUserNotification: jest.fn()
}));

jest.mock('../../services/features/submissionService', () => ({
  normalizeSubmissionPayload: jest.fn(),
  materializeSubmission: jest.fn()
}));

const Submission = require('../../models/Submission');
const { createUserNotification } = require('../../services/features/notificationService');
const { materializeSubmission, normalizeSubmissionPayload } = require('../../services/features/submissionService');
const submissionController = require('../submissionController');

function flushPromises() {
  return new Promise((resolve) => setImmediate(resolve));
}

function createResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
}

describe('submissionController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a submission with normalized data', async () => {
    const req = {
      body: { type: 'player', data: { name: 'João Silva' } },
      user: { id: 'user-1' }
    };
    const res = createResponse();

    normalizeSubmissionPayload.mockResolvedValue({ name: 'João Silva', numero: '10' });
    Submission.create.mockResolvedValue({ _id: 'submission-1' });

    submissionController.createSubmission(req, res, jest.fn());
    await flushPromises();

    expect(normalizeSubmissionPayload).toHaveBeenCalledWith({
      type: 'player',
      data: { name: 'João Silva' },
      userId: 'user-1'
    });
    expect(Submission.create).toHaveBeenCalledWith({
      type: 'player',
      data: { name: 'João Silva', numero: '10' },
      userId: 'user-1'
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('approves and materializes a pending submission', async () => {
    const submission = {
      type: 'player',
      status: 'pending',
      userId: 'user-2',
      data: { name: 'João Silva' },
      save: jest.fn()
    };
    const req = {
      params: { id: 'submission-2' },
      body: { status: 'approved', reviewNote: 'Tudo certo' },
      user: { id: 'admin-1' }
    };
    const res = createResponse();

    Submission.findById.mockResolvedValue(submission);
    normalizeSubmissionPayload.mockResolvedValue({ name: 'João Silva', numero: '10' });
    materializeSubmission.mockResolvedValue({ entityType: 'player', entityId: 'player-1' });

    submissionController.reviewSubmission(req, res, jest.fn());
    await flushPromises();

    expect(materializeSubmission).toHaveBeenCalledWith({
      type: 'player',
      data: { name: 'João Silva', numero: '10' }
    });
    expect(submission.status).toBe('approved');
    expect(submission.materializedEntityType).toBe('player');
    expect(submission.materializedEntityId).toBe('player-1');
    expect(submission.reviewNote).toBe('Tudo certo');
    expect(submission.reviewedBy).toBe('admin-1');
    expect(submission.save).toHaveBeenCalled();
    expect(createUserNotification).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true, data: submission });
  });
});