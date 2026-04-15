const asyncHandler = require('../utils/asyncHandler');
const {
  confirmPremiumCheckoutSession,
  createPremiumCheckoutSession,
  constructWebhookEvent,
  handleStripeWebhook
} = require('../services/billingService');
const { serializeUser } = require('../utils/accessControl');

exports.getBillingStatus = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: {
      user: serializeUser(req.user)
    }
  });
});

exports.createCheckoutSession = asyncHandler(async (req, res) => {
  const session = await createPremiumCheckoutSession({
    user: req.user,
    origin: req.headers.origin
  });

  res.status(201).json({
    success: true,
    data: {
      sessionId: session.id,
      url: session.url
    }
  });
});

exports.confirmCheckoutSession = asyncHandler(async (req, res) => {
  const confirmation = await confirmPremiumCheckoutSession({
    sessionId: req.body.sessionId,
    user: req.user
  });

  res.json({
    success: true,
    data: {
      sessionId: confirmation.sessionId,
      user: serializeUser(confirmation.user || req.user)
    }
  });
});

exports.handleWebhook = async (req, res) => {
  const signature = req.headers['stripe-signature'];

  if (!signature) {
    return res.status(400).send('Missing Stripe signature');
  }

  let event;

  try {
    event = constructWebhookEvent(req.body, signature);
  } catch (error) {
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  try {
    const result = await handleStripeWebhook(event);
    return res.json({ received: true, duplicate: Boolean(result?.duplicate) });
  } catch (error) {
    return res.status(500).send(`Webhook Processing Error: ${error.message}`);
  }
};