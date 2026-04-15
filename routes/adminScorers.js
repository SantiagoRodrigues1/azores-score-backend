const express = require('express');
const router = express.Router();
const { verifyToken, verifyAdmin } = require('../middleware/auth');
const Scorer = require('../models/Scorer');
const logger = require('../utils/logger');

// Listar todos os marcadores
router.get('/', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const scorers = await Scorer.find();
    res.json(scorers);
  } catch (err) {
    logger.error('Erro ao listar marcadores', err);
    res.status(500).json({ error: 'Erro ao listar marcadores.' });
  }
});

// Adicionar marcador
router.post('/', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const scorer = new Scorer(req.body);
    await scorer.save();
    res.status(201).json(scorer);
  } catch (err) {
    logger.error('Erro ao adicionar marcador', err);
    res.status(400).json({ error: 'Erro ao adicionar marcador.' });
  }
});

// Editar marcador
router.put('/:id', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const scorer = await Scorer.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(scorer);
  } catch (err) {
    logger.error('Erro ao editar marcador', err);
    res.status(400).json({ error: 'Erro ao editar marcador.' });
  }
});

// Remover marcador
router.delete('/:id', verifyToken, verifyAdmin, async (req, res) => {
  try {
    await Scorer.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    logger.error('Erro ao remover marcador', err);
    res.status(400).json({ error: 'Erro ao remover marcador.' });
  }
});

module.exports = router;
