/**
 * refereeApprovalController.js
 * Controlador para aprovação de árbitros (admin workflow)
 */
const User = require('../models/User');
const RefereeProfile = require('../models/RefereeProfile');
const Notification = require('../models/Notification');
const logger = require('../utils/logger');

/**
 * GET PENDING REFEREES - Listar pedidos pendentes
 * GET /api/admin/referees/approval/pending
 */
exports.getPendingReferees = async (req, res) => {
  try {
    const { limit = 20, page = 1 } = req.query;
    const skip = (page - 1) * limit;

    const refereeProfiles = await RefereeProfile.find()
      .populate({
        path: 'userId',
        match: { refereeStatus: 'pending' },
        select: 'name email refereeStatus dataSubmissaoArbitro'
      })
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ criadoEm: -1 })
      .lean();

    // Filtrar apenas os que têm userId com status pending
    const pendingReferees = refereeProfiles.filter(profile => profile.userId !== null);

    const total = await RefereeProfile.countDocuments({
      userId: {
        $in: await User.find({ 
          role: 'referee', 
          refereeStatus: 'pending' 
        }).select('_id').then(users => users.map(u => u._id))
      }
    });

    res.json({
      count: pendingReferees.length,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      referees: pendingReferees
    });

  } catch (error) {
    logger.error('Erro ao listar árbitros pendentes', error);
    res.status(500).json({ error: 'Erro ao listar árbitros pendentes' });
  }
};

/**
 * GET REFEREE DETAILS - Detalhes de um árbitro específico
 * GET /api/admin/referees/approval/:refereeProfileId
 */
exports.getRefereeDetails = async (req, res) => {
  try {
    const { refereeProfileId } = req.params;

    const refereeProfile = await RefereeProfile.findById(refereeProfileId)
      .populate({
        path: 'userId',
        select: 'name email refereeStatus dataSubmissaoArbitro'
      });

    if (!refereeProfile) {
      return res.status(404).json({ error: 'Árbitro não encontrado' });
    }

    res.json(refereeProfile);

  } catch (error) {
    logger.error('Erro ao obter detalhes do árbitro', error);
    res.status(500).json({ error: 'Erro ao obter detalhes do árbitro' });
  }
};

/**
 * APPROVE REFEREE - Aprovar pedido de árbitro
 * POST /api/admin/referees/approval/:refereeProfileId/approve
 */
exports.approveReferee = async (req, res) => {
  try {
    const { refereeProfileId } = req.params;

    const refereeProfile = await RefereeProfile.findById(refereeProfileId);
    
    if (!refereeProfile) {
      return res.status(404).json({ error: 'Árbitro não encontrado' });
    }

    // Atualizar status do utilizador
    const user = await User.findByIdAndUpdate(
      refereeProfile.userId,
      {
        refereeStatus: 'approved',
        dataAprovacaoArbitro: new Date()
      },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'Utilizador não encontrado' });
    }

    // Criar notificação para o árbitro
    const notification = new Notification({
      userId: user._id,
      tipo: 'pedido_aprovado',
      titulo: 'Pedido Aprovado! 🎉',
      mensagem: 'Parabéns! Seu pedido de registo como árbitro foi aprovado.',
      descricao: `Seu cartão nº ${refereeProfile.numeroCartaoArbitro} foi validado.`,
      icone: 'check-circle',
      cor: 'green',
      acaoUrl: '/referee/dashboard',
      botaoTexto: 'Ir ao Dashboard'
    });

    await notification.save();

    res.json({
      message: 'Árbitro aprovado com sucesso',
      user,
      notification
    });

  } catch (error) {
    logger.error('Erro ao aprovar árbitro', error);
    res.status(500).json({ error: 'Erro ao aprovar árbitro' });
  }
};

/**
 * REJECT REFEREE - Rejeitar pedido de árbitro
 * POST /api/admin/referees/approval/:refereeProfileId/reject
 */
exports.rejectReferee = async (req, res) => {
  try {
    const { refereeProfileId } = req.params;
    const { motivo } = req.body;

    if (!motivo) {
      return res.status(400).json({ error: 'Motivo da rejeição é obrigatório' });
    }

    const refereeProfile = await RefereeProfile.findById(refereeProfileId);
    
    if (!refereeProfile) {
      return res.status(404).json({ error: 'Árbitro não encontrado' });
    }

    // Atualizar status do utilizador
    const user = await User.findByIdAndUpdate(
      refereeProfile.userId,
      {
        refereeStatus: 'rejected',
        refereeRejectionReason: motivo,
        dataRejeitadoArbitro: new Date()
      },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'Utilizador não encontrado' });
    }

    // Criar notificação para o árbitro
    const notification = new Notification({
      userId: user._id,
      tipo: 'pedido_rejeitado',
      titulo: 'Pedido Rejeitado',
      mensagem: 'Desculpe, seu pedido de registo foi rejeitado.',
      descricao: `Motivo: ${motivo}`,
      icone: 'x-circle',
      cor: 'red',
      acaoUrl: '/referee/contact-support',
      botaoTexto: 'Contactar Suporte'
    });

    await notification.save();

    res.json({
      message: 'Árbitro rejeitado',
      user,
      notification
    });

  } catch (error) {
    logger.error('Erro ao rejeitar árbitro', error);
    res.status(500).json({ error: 'Erro ao rejeitar árbitro' });
  }
};

/**
 * GET APPROVAL STATS - Estatísticas de aprovações
 * GET /api/admin/referees/approval/stats
 */
exports.getApprovalStats = async (req, res) => {
  try {
    const totalReferees = await User.countDocuments({ role: 'referee' });
    const approvedReferees = await User.countDocuments({ 
      role: 'referee', 
      refereeStatus: 'approved' 
    });
    const pendingReferees = await User.countDocuments({ 
      role: 'referee', 
      refereeStatus: 'pending' 
    });
    const rejectedReferees = await User.countDocuments({ 
      role: 'referee', 
      refereeStatus: 'rejected' 
    });

    // Árbitros por categoria
    const byCategoria = await RefereeProfile.aggregate([
      {
        $group: {
          _id: '$categoria',
          count: { $sum: 1 }
        }
      }
    ]);

    // Árbitros por região
    const byRegiao = await RefereeProfile.aggregate([
      {
        $group: {
          _id: '$regiao',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      totalReferees,
      approvedReferees,
      pendingReferees,
      rejectedReferees,
      byCategoria,
      byRegiao
    });

  } catch (error) {
    logger.error('Erro ao obter estatísticas de aprovação', error);
    res.status(500).json({ error: 'Erro ao obter estatísticas' });
  }
};
