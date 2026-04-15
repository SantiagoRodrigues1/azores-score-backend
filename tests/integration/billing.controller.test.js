jest.mock('../../services/billingService', () => ({
  createPremiumCheckoutSession: jest.fn(),
  constructWebhookEvent: jest.fn(),
  handleStripeWebhook: jest.fn()
}));

const billingController = require('../../controllers/billingController');
const billingService = require('../../services/billingService');

function createResponseMock() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    }
  };
}

describe('billingController.handleWebhook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 400 when the Stripe signature is missing', async () => {
    const req = {
      headers: {},
      body: Buffer.from('{}')
    };
    const res = createResponseMock();

    await billingController.handleWebhook(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toBe('Missing Stripe signature');
  });

  it('returns 400 when webhook signature validation fails', async () => {
    billingService.constructWebhookEvent.mockImplementation(() => {
      throw new Error('Invalid signature');
    });

    const req = {
      headers: { 'stripe-signature': 'sig_test' },
      body: Buffer.from('{}')
    };
    const res = createResponseMock();

    await billingController.handleWebhook(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toBe('Webhook Error: Invalid signature');
  });

  it('returns 500 when webhook processing fails so Stripe can retry', async () => {
    billingService.constructWebhookEvent.mockReturnValue({ id: 'evt_test' });
    billingService.handleStripeWebhook.mockRejectedValue(new Error('Temporary downstream failure'));

    const req = {
      headers: { 'stripe-signature': 'sig_test' },
      body: Buffer.from('{}')
    };
    const res = createResponseMock();

    await billingController.handleWebhook(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toBe('Webhook Processing Error: Temporary downstream failure');
  });

  it('returns duplicate metadata when a webhook event was already handled', async () => {
    billingService.constructWebhookEvent.mockReturnValue({ id: 'evt_test' });
    billingService.handleStripeWebhook.mockResolvedValue({ duplicate: true });

    const req = {
      headers: { 'stripe-signature': 'sig_test' },
      body: Buffer.from('{}')
    };
    const res = createResponseMock();

    await billingController.handleWebhook(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ received: true, duplicate: true });
  });
});