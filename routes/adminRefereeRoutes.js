/**
 * adminRefereeRoutes.js
 * Rotas administrativas para gestão de árbitros
 */
const express = require('express');
const router = express.Router();

// Controllers
const refereeApprovalController = require('../controllers/refereeApprovalController');
const matchReportController = require('../controllers/matchReportController');

// Middleware
const { verifyToken, isAdmin } = require('../middleware/refereeAuth');

// ===== ÁRBITROS PENDENTES =====

/**
 * GET /api/admin/referees/approval/pending
 * Listar árbitros com pedidos pendentes
 */
router.get(
  '/referees/approval/pending',
  verifyToken,
  isAdmin,
  refereeApprovalController.getPendingReferees
);

/**
 * GET /api/admin/referees/approval/:refereeProfileId
 * Detalhes de um árbitro específico (para aprovação)
 */
router.get(
  '/referees/approval/:refereeProfileId',
  verifyToken,
  isAdmin,
  refereeApprovalController.getRefereeDetails
);

/**
 * POST /api/admin/referees/approval/:refereeProfileId/approve
 * Aprovar pedido de árbitro
 */
router.post(
  '/referees/approval/:refereeProfileId/approve',
  verifyToken,
  isAdmin,
  refereeApprovalController.approveReferee
);

/**
 * POST /api/admin/referees/approval/:refereeProfileId/reject
 * Rejeitar pedido de árbitro
 */
router.post(
  '/referees/approval/:refereeProfileId/reject',
  verifyToken,
  isAdmin,
  refereeApprovalController.rejectReferee
);

// ===== ESTATÍSTICAS =====

/**
 * GET /api/admin/referees/approval/stats
 * Estatísticas de aprovação e árbitros
 */
router.get(
  '/referees/approval/stats',
  verifyToken,
  isAdmin,
  refereeApprovalController.getApprovalStats
);

// ===== RELATÓRIOS =====

/**
 * GET /api/admin/reports
 * Listar todos os relatórios
 */
router.get(
  '/reports',
  verifyToken,
  isAdmin,
  matchReportController.getAllReports
);

/**
 * POST /api/admin/reports/:reportId/review
 * Revisar e avaliar relatório
 */
router.post(
  '/reports/:reportId/review',
  verifyToken,
  isAdmin,
  matchReportController.reviewReport
);

/**
 * GET /api/admin/reports/statistics
 * Estatísticas de relatórios
 */
router.get(
  '/reports/statistics',
  verifyToken,
  isAdmin,
  matchReportController.getReportStatistics
);

module.exports = router;
