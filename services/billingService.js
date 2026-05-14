const Stripe = require('stripe');
const crypto = require('crypto');
const User = require('../models/User');
const StripeWebhookEvent = require('../models/StripeWebhookEvent');
const { getDefaultPlanForRole } = require('../utils/accessControl');

let stripeClient = null;

function normalizeStripeCustomerEmail(email) {
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) ? normalizedEmail : null;
}

function isMissingStripeCustomerError(error) {
  return error?.code === 'resource_missing'
    || error?.statusCode === 404
    || /No such customer/i.test(String(error?.message || ''));
}

function assertStripeConfiguration({ requireWebhookSecret = false } = {}) {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is required');
  }

  if (requireWebhookSecret && !process.env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('STRIPE_WEBHOOK_SECRET is required');
  }
}

function getStripeClient() {
  assertStripeConfiguration();

  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  }

  return stripeClient;
}

function resolveFrontendBaseUrl(origin) {
  const configuredBaseUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:8000';
  const deprecatedHosts = new Set(['azoresfootballfrontend.onrender.com']);

  const normalizeBaseUrl = (value) => {
    if (!value) {
      return null;
    }

    try {
      const parsed = new URL(String(value));
      const host = String(parsed.hostname || '').toLowerCase();

      if (deprecatedHosts.has(host)) {
        return null;
      }

      return `${parsed.protocol}//${parsed.host}`;
    } catch (_error) {
      return null;
    }
  };

  // Keep origin-based redirects for local/staging flows, but never use a
  // deprecated frontend host that would break the return from Stripe.
  return normalizeBaseUrl(origin) || normalizeBaseUrl(configuredBaseUrl) || 'http://localhost:8000';
}

async function getOrCreateCustomer(user) {
  const stripe = getStripeClient();
  const userId = user._id || user.id;

  if (user.stripeCustomerId) {
    try {
      const customer = await stripe.customers.retrieve(user.stripeCustomerId);

      if (customer && !customer.deleted) {
        return customer.id || user.stripeCustomerId;
      }
    } catch (error) {
      if (!isMissingStripeCustomerError(error)) {
        throw error;
      }
    }

    await User.findByIdAndUpdate(userId, {
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionStatus: 'inactive',
      subscriptionCurrentPeriodEnd: null,
      plan: getDefaultPlanForRole(user.role)
    });

    user.stripeCustomerId = null;
    user.stripeSubscriptionId = null;
    user.subscriptionStatus = 'inactive';
    user.subscriptionCurrentPeriodEnd = null;
    user.plan = getDefaultPlanForRole(user.role);
  }

  const normalizedEmail = normalizeStripeCustomerEmail(user.email);

  const customer = await stripe.customers.create({
    name: user.name,
    ...(normalizedEmail ? { email: normalizedEmail } : {}),
    metadata: {
      userId: String(userId)
    }
  });

  await User.findByIdAndUpdate(userId, { stripeCustomerId: customer.id });

  return customer.id;
}

async function createPremiumCheckoutSession({ user, origin }) {
  assertStripeConfiguration();

  const stripe = getStripeClient();
  const frontendBaseUrl = resolveFrontendBaseUrl(origin);
  const customerId = await getOrCreateCustomer(user);
  const unitAmount = Number(process.env.STRIPE_PREMIUM_PRICE_AMOUNT || 499);
  const currency = String(process.env.STRIPE_PREMIUM_PRICE_CURRENCY || 'eur').toLowerCase();
  const interval = String(process.env.STRIPE_PREMIUM_PRICE_INTERVAL || 'month');

  if (!Number.isInteger(unitAmount) || unitAmount <= 0) {
    throw new Error('STRIPE_PREMIUM_PRICE_AMOUNT must be a positive integer in cents');
  }

  return stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    client_reference_id: String(user._id || user.id),
    // Redirect back to the profile page and instruct the frontend to open
    // the payments tab by adding `tab=payments`.
    success_url: `${frontendBaseUrl}/profile?billing=success&session_id={CHECKOUT_SESSION_ID}&tab=payments`,
    cancel_url: `${frontendBaseUrl}/profile?billing=canceled&tab=payments`,
    allow_promotion_codes: true,
    metadata: {
      userId: String(user._id || user.id),
      plan: 'premium'
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency,
          unit_amount: unitAmount,
          recurring: { interval },
          product_data: {
            name: 'AzoresScore Premium',
            description: 'Comparações avançadas, insights premium e notificações expandidas.'
          }
        }
      }
    ]
  });
}

async function confirmPremiumCheckoutSession({ sessionId, user }) {
  assertStripeConfiguration();

  if (!sessionId) {
    throw new Error('sessionId is required');
  }

  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['subscription']
  });
  const userId = String(user._id || user.id);
  const sessionUserId = String(session.metadata?.userId || session.client_reference_id || '');
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;

  if (sessionUserId && sessionUserId !== userId) {
    const error = new Error('Esta sessão de pagamento não pertence ao utilizador autenticado.');
    error.statusCode = 403;
    throw error;
  }

  if (!['complete', 'paid'].includes(String(session.status || session.payment_status || ''))) {
    const error = new Error('O checkout ainda não foi concluído.');
    error.statusCode = 409;
    throw error;
  }

  let syncedUser = null;

  if (session.subscription && typeof session.subscription === 'object' && session.subscription.id) {
    syncedUser = await syncSubscription(session.subscription, sessionUserId || userId);
  } else if (session.subscription) {
    syncedUser = await syncCheckoutSession(session);
  } else if (customerId && user.stripeCustomerId !== customerId) {
    await User.findByIdAndUpdate(userId, { stripeCustomerId: customerId });
  }

  return {
    sessionId: session.id,
    customerId,
    user: syncedUser
  };
}

async function updateUserSubscriptionState({ user, customerId, subscriptionId, subscriptionStatus, currentPeriodEnd }) {
  const normalizedStatus = subscriptionStatus || 'inactive';
  const hasActivePremium = ['active', 'trialing', 'past_due'].includes(normalizedStatus);

  user.stripeCustomerId = customerId || user.stripeCustomerId || null;
  user.stripeSubscriptionId = subscriptionId || null;
  user.subscriptionStatus = normalizedStatus;
  user.subscriptionCurrentPeriodEnd = currentPeriodEnd || null;
  user.plan = hasActivePremium ? 'premium' : getDefaultPlanForRole(user.role);

  if (!hasActivePremium) {
    user.stripeSubscriptionId = subscriptionId || null;
  }

  await user.save();
  return user;
}

async function findUserForStripeObject({ customerId, userId }) {
  if (customerId) {
    const byCustomer = await User.findOne({ stripeCustomerId: customerId });
    if (byCustomer) {
      return byCustomer;
    }
  }

  if (userId) {
    return User.findById(userId);
  }

  return null;
}

async function syncSubscription(subscription, fallbackUserId = null) {
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
  const metadataUserId = subscription.metadata?.userId || fallbackUserId;
  const user = await findUserForStripeObject({ customerId, userId: metadataUserId });

  if (!user) {
    return null;
  }

  return updateUserSubscriptionState({
    user,
    customerId,
    subscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null
  });
}

async function syncCheckoutSession(session) {
  const stripe = getStripeClient();
  const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;

  if (!subscriptionId) {
    return null;
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  return syncSubscription(subscription, session.metadata?.userId || session.client_reference_id || null);
}

async function handleStripeWebhook(event) {
  const stripe = getStripeClient();

  const reservation = await beginWebhookEventProcessing(event);
  if (!reservation) {
    return { duplicate: true };
  }

  try {
    let result = null;

    switch (event.type) {
      case 'checkout.session.completed':
        result = await syncCheckoutSession(event.data.object);
        break;
      case 'invoice.paid':
      case 'invoice.payment_failed': {
        const subscriptionId = event.data.object.subscription;
        if (!subscriptionId) {
          break;
        }

        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        result = await syncSubscription(subscription);
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        result = await syncSubscription(event.data.object);
        break;
      default:
        result = null;
        break;
    }

    await completeWebhookEventProcessing(event.id, reservation);
    return result;
  } catch (error) {
    await failWebhookEventProcessing(event.id, reservation, error);
    throw error;
  }
}

function constructWebhookEvent(rawBody, signature) {
  assertStripeConfiguration({ requireWebhookSecret: true });

  return getStripeClient().webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
}

async function beginWebhookEventProcessing(event) {
  const reservationToken = crypto.randomUUID();

  const existing = await StripeWebhookEvent.findOne({ eventId: event.id }).lean();
  if (existing) {
    if (existing.status !== 'failed') {
      return null;
    }

    const resumed = await StripeWebhookEvent.findOneAndUpdate(
      {
        eventId: event.id,
        status: 'failed'
      },
      {
        $set: {
          type: event.type,
          status: 'processing',
          reservationToken,
          lastError: null,
          processedAt: null
        },
        $inc: { attemptCount: 1 }
      },
      {
        new: true
      }
    ).lean();

    return resumed?.reservationToken === reservationToken ? reservationToken : null;
  }

  try {
    await StripeWebhookEvent.create({
      eventId: event.id,
      type: event.type,
      status: 'processing',
      reservationToken,
      attemptCount: 1,
      lastError: null,
      processedAt: null
    });

    return reservationToken;
  } catch (error) {
    if (error?.code !== 11000) {
      throw error;
    }

    const duplicate = await StripeWebhookEvent.findOne({ eventId: event.id }).lean();
    if (!duplicate) {
      return beginWebhookEventProcessing(event);
    }

    if (duplicate.status !== 'failed') {
      return null;
    }

    const resumed = await StripeWebhookEvent.findOneAndUpdate(
      {
        eventId: event.id,
        status: 'failed'
      },
      {
        $set: {
          type: event.type,
          status: 'processing',
          reservationToken,
          lastError: null,
          processedAt: null
        },
        $inc: { attemptCount: 1 }
      },
      {
        new: true
      }
    ).lean();

    return resumed?.reservationToken === reservationToken ? reservationToken : null;
  }
}

async function completeWebhookEventProcessing(eventId, reservationToken) {
  await StripeWebhookEvent.updateOne(
    { eventId, reservationToken },
    {
      $set: {
        status: 'processed',
        processedAt: new Date(),
        lastError: null
      }
    }
  );
}

async function failWebhookEventProcessing(eventId, reservationToken, error) {
  await StripeWebhookEvent.updateOne(
    { eventId, reservationToken },
    {
      $set: {
        status: 'failed',
        lastError: error?.message || 'Unknown Stripe webhook error',
        processedAt: null
      }
    }
  );
}

module.exports = {
  confirmPremiumCheckoutSession,
  constructWebhookEvent,
  createPremiumCheckoutSession,
  getStripeClient,
  handleStripeWebhook,
  syncCheckoutSession,
  syncSubscription
};