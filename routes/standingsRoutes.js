// routes/standingsRoutes.js
const express = require('express');
const router = express.Router();
const { getStandings } = require('../controllers/standingsController');

// TODOS os campeonatos
// GET /api/standings
router.get('/', getStandings);

// UM campeonato específico
// GET /api/standings?campeonato=campeonato_sao_jorge
router.get('/filter', getStandings);

module.exports = router;
