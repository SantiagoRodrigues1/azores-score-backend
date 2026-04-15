const express = require('express');
const router = express.Router();
const { verifyToken, verifyAdmin } = require('../middleware/auth');
const Standing = require('../models/Standing');
const logger = require('../utils/logger');

// Listar todas as classificações (podes filtrar por liga/época)
router.get('/', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { league, season } = req.query;
    const filter = {};
    if (league) filter.league = league;
    if (season) filter.season = season;

    const standings = await Standing.find(filter)
      .sort({ league: 1, season: -1, position: 1 }); // ordena por liga → época recente → posição

    res.json(standings);
  } catch (err) {
    logger.error('Erro ao listar tabelas', err);
    res.status(500).json({ error: 'Erro ao listar tabelas' });
  }
});

// Criar nova entrada na classificação
router.post('/', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const standing = new Standing(req.body);
    await standing.save();
    res.status(201).json(standing);
  } catch (err) {
    logger.error('Erro ao adicionar entrada na tabela', err);
    res.status(400).json({ 
      error: 'Erro ao adicionar entrada na tabela',
      details: err.message 
    });
  }
});

// Atualizar entrada (ex: após jogo)
router.put('/:id', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const standing = await Standing.findByIdAndUpdate(
      req.params.id, 
      req.body, 
      { new: true, runValidators: true }
    );
    
    if (!standing) {
      return res.status(404).json({ error: 'Entrada não encontrada' });
    }
    
    res.json(standing);
  } catch (err) {
    logger.error('Erro ao atualizar tabela', err);
    res.status(400).json({ 
      error: 'Erro ao atualizar tabela',
      details: err.message 
    });
  }
});

// Apagar entrada
router.delete('/:id', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const standing = await Standing.findByIdAndDelete(req.params.id);
    if (!standing) {
      return res.status(404).json({ error: 'Entrada não encontrada' });
    }
    res.json({ success: true, message: 'Entrada removida' });
  } catch (err) {
    logger.error('Erro ao remover entrada', err);
    res.status(500).json({ error: 'Erro ao remover entrada' });
  }
});

module.exports = router;