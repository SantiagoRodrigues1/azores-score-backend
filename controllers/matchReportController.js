/**
 * matchReportController.js
 * Controlador para relatórios pós-jogo
 */
const MatchReport = require('../models/MatchReport');
const Match = require('../models/Match');
const RefereeProfile = require('../models/RefereeProfile');
const User = require('../models/User');
const Notification = require('../models/Notification');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

function getUploadedFiles(req, fieldName) {
  if (!req.files || !req.files[fieldName]) {
    return [];
  }

  const files = req.files[fieldName];
  return Array.isArray(files) ? files : [files];
}

/**
 * SUBMIT MATCH REPORT - Submeter relatório de jogo
 * POST /api/referee/reports
 */
exports.submitReport = async (req, res) => {
  try {
    const { matchId, comentario, cartõesAmarelos, cartõesVermelhos, penalidades } = req.body;
    const userId = req.user.id;

    if (!matchId) {
      return res.status(400).json({ error: 'matchId é obrigatório' });
    }

    // Verificar se o jogo existe
    const match = await Match.findById(matchId);
    if (!match) {
      return res.status(404).json({ error: 'Jogo não encontrado' });
    }

    // Obter perfil do árbitro
    const refereeProfile = await RefereeProfile.findOne({ userId });
    if (!refereeProfile) {
      return res.status(404).json({ error: 'Perfil de árbitro não encontrado' });
    }

    // Verificar se já existe relatório para este jogo e árbitro
    const existingReport = await MatchReport.findOne({
      matchId,
      refereeId: refereeProfile._id
    });

    if (existingReport) {
      return res.status(400).json({ error: 'Relatório já foi submetido para este jogo' });
    }

    // Guardar ficheiro PDF se enviado
    let pdfURL = null;
    const pdfFiles = getUploadedFiles(req, 'pdf');
    if (pdfFiles.length > 0) {
      const pdfFile = pdfFiles[0];
      const uploadsDir = path.join(__dirname, '../uploads/match-reports');

      await fs.mkdir(uploadsDir, { recursive: true });

      const fileName = `${matchId}_${refereeProfile._id}_${Date.now()}.pdf`;
      const filePath = path.join(uploadsDir, fileName);
      
      await fs.writeFile(filePath, pdfFile.buffer);
      pdfURL = `/uploads/match-reports/${fileName}`;
    }

    // Guardar imagens se enviadas
    let imagenURLs = [];
    const imagenes = getUploadedFiles(req, 'imagenes');
    if (imagenes.length > 0) {

      const uploadsDir = path.join(__dirname, '../uploads/match-reports/images');

      await fs.mkdir(uploadsDir, { recursive: true });

      for (const img of imagenes) {
        const fileName = `${matchId}_${Date.now()}_${img.name}`;
        const filePath = path.join(uploadsDir, fileName);
        
        await fs.writeFile(filePath, img.buffer);
        imagenURLs.push(`/uploads/match-reports/images/${fileName}`);
      }
    }

    // Criar relatório
    const report = new MatchReport({
      matchId,
      refereeId: refereeProfile._id,
      userId,
      comentario: comentario || '',
      pdfURL,
      imagenURL: imagenURLs,
      cartõesAmarelos: parseInt(cartõesAmarelos) || 0,
      cartõesVermelhos: parseInt(cartõesVermelhos) || 0,
      penalidades: parseInt(penalidades) || 0,
      status: 'enviado',
      dataEnvio: new Date()
    });

    await report.save();

    // Atualizar contagem de relatórios do árbitro
    refereeProfile.relatóriosEnviados = (refereeProfile.relatóriosEnviados || 0) + 1;
    await refereeProfile.save();

    // Notificar admins
    const admins = await User.find({ role: 'admin' });
    
    for (const admin of admins) {
      const notification = new Notification({
        userId: admin._id,
        tipo: 'relatório_recebido',
        titulo: 'Novo Relatório Recebido',
        mensagem: `${refereeProfile.nomeCompleto} enviou relatório do jogo`,
        matchReportId: report._id,
        acaoUrl: `/admin/match-reports/${report._id}`,
        botaoTexto: 'Ver Relatório',
        icone: 'file-text',
        cor: 'blue'
      });
      
      await notification.save();
    }

    res.status(201).json({
      message: 'Relatório submetido com sucesso',
      report: {
        _id: report._id,
        matchId: report.matchId,
        status: report.status,
        dataEnvio: report.dataEnvio
      }
    });

  } catch (error) {
    logger.error('Erro ao submeter relatório', error.message);
    res.status(500).json({ error: 'Erro ao submeter relatório: ' + error.message });
  }
};

/**
 * GET MY REPORTS - Listar meus relatórios
 * GET /api/referee/reports
 */
exports.getMyReports = async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 20, page = 1 } = req.query;
    const skip = (page - 1) * limit;

    const reports = await MatchReport.find({ userId })
      .populate('matchId', 'data local equipas competicao')
      .sort({ dataEnvio: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await MatchReport.countDocuments({ userId });

    res.json({
      reports,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    logger.error('Erro ao obter relatórios', error);
    res.status(500).json({ error: 'Erro ao obter relatórios' });
  }
};

/**
 * GET REPORT DETAILS - Detalhes de um relatório
 * GET /api/referee/reports/:reportId
 */
exports.getReportDetails = async (req, res) => {
  try {
    const { reportId } = req.params;
    const userId = req.user.id;

    const report = await MatchReport.findById(reportId)
      .populate('matchId', 'data local equipas competicao arbitros')
      .populate('refereeId', 'nomeCompleto numeroCartaoArbitro categoria');

    if (!report) {
      return res.status(404).json({ error: 'Relatório não encontrado' });
    }

    // Verificar permissões (só o árbitro ou admin pode ver)
    if (report.userId.toString() !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Sem permissão para aceder a este relatório' });
    }

    res.json(report);

  } catch (error) {
    logger.error('Erro ao obter relatório', error);
    res.status(500).json({ error: 'Erro ao obter relatório' });
  }
};

/**
 * ADMIN: GET ALL REPORTS - Listar todos os relatórios (admin)
 * GET /api/admin/reports
 */
exports.getAllReports = async (req, res) => {
  try {
    const { limit = 20, page = 1, status } = req.query;
    const skip = (page - 1) * limit;

    let filter = {};
    if (status) filter.status = status;

    const reports = await MatchReport.find(filter)
      .populate('matchId', 'data local equipas competicao')
      .populate('refereeId', 'nomeCompleto numeroCartaoArbitro')
      .populate('userId', 'name email')
      .sort({ dataEnvio: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await MatchReport.countDocuments(filter);

    res.json({
      reports,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    logger.error('Erro ao obter relatórios', error);
    res.status(500).json({ error: 'Erro ao obter relatórios' });
  }
};

/**
 * ADMIN: REVIEW REPORT - Revisar e avaliar relatório
 * POST /api/admin/reports/:reportId/review
 */
exports.reviewReport = async (req, res) => {
  try {
    const { reportId } = req.params;
    const { avaliacao, comentarioAdmin, status } = req.body;

    const report = await MatchReport.findByIdAndUpdate(
      reportId,
      {
        status: status || 'revisado',
        avaliacao: parseInt(avaliacao) || null,
        comentarioAdmin,
        dataRevisao: new Date()
      },
      { new: true }
    );

    if (!report) {
      return res.status(404).json({ error: 'Relatório não encontrado' });
    }

    // Notificar árbitro
    const notification = new Notification({
      userId: report.userId,
      tipo: 'avaliacao_recebida',
      titulo: 'Seu Relatório foi Revisado',
      mensagem: `Seu relatório recebeu uma avaliação de ${avaliacao} estrelas`,
      descricao: comentarioAdmin || '',
      matchReportId: report._id,
      icone: 'star',
      cor: 'yellow'
    });

    await notification.save();

    res.json({
      message: 'Relatório revisado',
      report,
      notification
    });

  } catch (error) {
    logger.error('Erro ao revisar relatório', error);
    res.status(500).json({ error: 'Erro ao revisar relatório' });
  }
};

/**
 * GET REPORT STATISTICS - Estatísticas de relatórios
 * GET /api/admin/reports/statistics
 */
exports.getReportStatistics = async (req, res) => {
  try {
    const totalReports = await MatchReport.countDocuments();
    const reportsPending = await MatchReport.countDocuments({ status: 'enviado' });
    const reportsReviewed = await MatchReport.countDocuments({ status: 'revisado' });
    const reportsApproved = await MatchReport.countDocuments({ status: 'aprovado' });

    // Média de avaliações
    const avgRating = await MatchReport.aggregate([
      {
        $match: { avaliacao: { $ne: null } }
      },
      {
        $group: {
          _id: null,
          mediaAvaliacao: { $avg: '$avaliacao' }
        }
      }
    ]);

    res.json({
      totalReports,
      reportsPending,
      reportsReviewed,
      reportsApproved,
      mediaAvaliacao: avgRating[0]?.mediaAvaliacao || 0
    });

  } catch (error) {
    logger.error('Erro ao obter estatísticas', error);
    res.status(500).json({ error: 'Erro ao obter estatísticas' });
  }
};
