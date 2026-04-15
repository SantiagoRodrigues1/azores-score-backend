const mockStripeClient = {
  customers: {
    create: jest.fn(),
    retrieve: jest.fn()
  },
  checkout: {
    sessions: {
      create: jest.fn(),
      retrieve: jest.fn()
    }
  },
  subscriptions: {
    retrieve: jest.fn()
  },
  webhooks: {
    constructEvent: jest.fn()
  }
};

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => mockStripeClient);
});

const User = require('../../models/User');
const StripeWebhookEvent = require('../../models/StripeWebhookEvent');
const { createTestContext, clearDatabase, destroyTestContext } = require('./helpers/testContext');
const { createUser } = require('./helpers/factories');
const billingService = require('../../services/billingService');

describe('billingService webhook processing', () => {
  beforeAll(async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_billing';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_billing';
    await createTestContext();
  });

  afterEach(async () => {
    mockStripeClient.customers.create.mockReset();
    mockStripeClient.customers.retrieve.mockReset();
    mockStripeClient.checkout.sessions.create.mockReset();
    mockStripeClient.checkout.sessions.retrieve.mockReset();
    mockStripeClient.subscriptions.retrieve.mockReset();
    mockStripeClient.webhooks.constructEvent.mockReset();
    await clearDatabase();
  });

  afterAll(async () => {
    await destroyTestContext();
  });

  it('processes a Stripe event only once even when the same event is retried', async () => {
    const user = await createUser({ email: 'billing-duplicate@example.com', role: 'fan' });
    await User.findByIdAndUpdate(user._id, { stripeCustomerId: 'cus_duplicate' });

    mockStripeClient.subscriptions.retrieve.mockResolvedValue({
      id: 'sub_duplicate',
      customer: 'cus_duplicate',
      status: 'active',
      current_period_end: 1796947200,
      metadata: {}
    });

    const event = {
      id: 'evt_duplicate',
      type: 'invoice.paid',
      data: {
        object: {
          subscription: 'sub_duplicate'
        }
      }
    };

    await billingService.handleStripeWebhook(event);
    await billingService.handleStripeWebhook(event);

    const updatedUser = await User.findById(user._id).lean();
    const eventRecord = await StripeWebhookEvent.findOne({ eventId: 'evt_duplicate' }).lean();

    expect(mockStripeClient.subscriptions.retrieve).toHaveBeenCalledTimes(1);
    expect(updatedUser.plan).toBe('premium');
    expect(updatedUser.subscriptionStatus).toBe('active');
    expect(eventRecord.status).toBe('processed');
    expect(eventRecord.attemptCount).toBe(1);
  });

  it('syncs failed invoice events to the current Stripe subscription state', async () => {
    const user = await createUser({ email: 'billing-failed@example.com', role: 'fan' });
    await User.findByIdAndUpdate(user._id, {
      stripeCustomerId: 'cus_failed',
      plan: 'premium',
      subscriptionStatus: 'active'
    });

    mockStripeClient.subscriptions.retrieve.mockResolvedValue({
      id: 'sub_failed',
      customer: 'cus_failed',
      status: 'past_due',
      current_period_end: 1796947200,
      metadata: {}
    });

    await billingService.handleStripeWebhook({
      id: 'evt_payment_failed',
      type: 'invoice.payment_failed',
      data: {
        object: {
          subscription: 'sub_failed'
        }
      }
    });

    const updatedUser = await User.findById(user._id).lean();

    expect(updatedUser.subscriptionStatus).toBe('past_due');
    expect(updatedUser.plan).toBe('premium');
  });

  it('creates a premium checkout session without requiring the webhook secret upfront', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;

    const user = await createUser({ email: 'billing-checkout@example.com', role: 'fan' });
    mockStripeClient.customers.create.mockResolvedValue({ id: 'cus_checkout' });
    mockStripeClient.checkout.sessions.create.mockResolvedValue({
      id: 'cs_test_checkout',
      url: 'https://checkout.stripe.com/test'
    });

    const session = await billingService.createPremiumCheckoutSession({
      user,
      origin: 'http://localhost:8000'
    });

    expect(session.id).toBe('cs_test_checkout');
    expect(mockStripeClient.checkout.sessions.create).toHaveBeenCalledTimes(1);
  });

  it('recreates a stale Stripe customer before creating the checkout session', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;

    const user = await createUser({ email: 'billing-recover@example.com', role: 'fan' });
    await User.findByIdAndUpdate(user._id, {
      stripeCustomerId: 'cus_stale',
      stripeSubscriptionId: 'sub_stale',
      subscriptionStatus: 'past_due',
      plan: 'premium'
    });

    const staleUser = await User.findById(user._id);
    mockStripeClient.customers.retrieve.mockRejectedValue(Object.assign(new Error("No such customer: 'cus_stale'"), {
      code: 'resource_missing',
      statusCode: 404
    }));
    mockStripeClient.customers.create.mockResolvedValue({ id: 'cus_recovered' });
    mockStripeClient.checkout.sessions.create.mockResolvedValue({
      id: 'cs_test_recovered',
      url: 'https://checkout.stripe.com/recovered'
    });

    const session = await billingService.createPremiumCheckoutSession({
      user: staleUser,
      origin: 'http://localhost:8000'
    });

    const updatedUser = await User.findById(user._id).lean();
    expect(session.id).toBe('cs_test_recovered');
    expect(mockStripeClient.customers.retrieve).toHaveBeenCalledWith('cus_stale');
    expect(mockStripeClient.customers.create).toHaveBeenCalledWith(expect.objectContaining({
      email: 'billing-recover@example.com'
    }));
    expect(updatedUser.stripeCustomerId).toBe('cus_recovered');
    expect(updatedUser.stripeSubscriptionId).toBeNull();
    expect(updatedUser.subscriptionStatus).toBe('inactive');
    expect(updatedUser.plan).toBe('free');
  });

  it('confirms a completed checkout session and updates the user plan immediately', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_billing';

    const user = await createUser({ email: 'billing-confirm@example.com', role: 'fan' });
    await User.findByIdAndUpdate(user._id, { stripeCustomerId: 'cus_confirm' });

    mockStripeClient.checkout.sessions.retrieve.mockResolvedValue({
      id: 'cs_test_confirm',
      status: 'complete',
      payment_status: 'paid',
      customer: 'cus_confirm',
      metadata: { userId: String(user._id) },
      client_reference_id: String(user._id),
      subscription: {
        id: 'sub_confirm',
        customer: 'cus_confirm',
        status: 'active',
        current_period_end: 1796947200,
        metadata: { userId: String(user._id) }
      }
    });

    const confirmation = await billingService.confirmPremiumCheckoutSession({
      sessionId: 'cs_test_confirm',
      user
    });

    const updatedUser = await User.findById(user._id).lean();
    expect(confirmation.sessionId).toBe('cs_test_confirm');
    expect(updatedUser.plan).toBe('premium');
    expect(updatedUser.subscriptionStatus).toBe('active');
  });
});