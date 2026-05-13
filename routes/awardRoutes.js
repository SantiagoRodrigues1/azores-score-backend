// routes/awardRoutes.js
const express = require('express');
const router = express.Router();
const { requireAuth, verifyRole } = require('../middleware/auth');
const {
  listAwards,
  getAwardById,
  createAward,
  updateAward,
  deleteAward,
} = require('../controllers/awardController');

// Public — any user (Premium gate is enforced on the frontend)
router.get('/', listAwards);
router.get('/:id', getAwardById);

// Write access: admin or journalist only
router.use(requireAuth);
router.post('/', verifyRole(['admin', 'journalist']), createAward);
router.put('/:id', verifyRole(['admin', 'journalist']), updateAward);
router.delete('/:id', verifyRole(['admin']), deleteAward);

module.exports = router;
