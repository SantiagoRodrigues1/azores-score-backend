const express = require('express');
const router = express.Router();
const discoveryController = require('../controllers/discoveryController');
const validate = require('../middleware/validate');
const { requireAuth, requirePremium } = require('../middleware/auth');
const { trackViewSchema } = require('../validators/featureSchemas');

router.get('/trending', discoveryController.getTrending);
router.get('/search', discoveryController.smartSearch);
router.get('/players', requireAuth, requirePremium, discoveryController.listComparisonPlayers);
router.get('/compare/players', requireAuth, requirePremium, discoveryController.comparePlayers);
router.get('/activity', discoveryController.getRecentActivity);
router.get('/achievements/me', requireAuth, discoveryController.getMyAchievements);
router.post('/views', requireAuth, validate(trackViewSchema), discoveryController.trackView);

module.exports = router;
