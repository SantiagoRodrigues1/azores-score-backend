const express = require('express');
const billingController = require('../controllers/billingController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);
router.get('/status', billingController.getBillingStatus);
router.post('/checkout-session', billingController.createCheckoutSession);
router.post('/checkout-session/confirm', billingController.confirmCheckoutSession);

module.exports = router;