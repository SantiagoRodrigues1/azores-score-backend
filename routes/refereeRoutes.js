/**
 * refereeRoutes.js
 * Rotas para o sistema de árbitro
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');

// Controllers
const refereeSignupController = require('../controllers/refereeSignupController');
const refereeDashboardController = require('../controllers/refereeDashboardController');
const matchReportController = require('../controllers/matchReportController');

// Middleware
const { verifyToken, isReferee, checkRefereeStatus, requireApprovedReferee } = require('../middleware/refereeAuth');
const { 
  validateRefereeSignup, 
  validateLogin,
  validateReportSubmission,
  validatePresenceConfirmation,
  validateDocumentUpload
} = require('../middleware/refereeValidation');

// Multer para upload de ficheiros
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de ficheiro não permitido'));
    }
  }
});

// ===== AUTENTICAÇÃO =====

/**
 * POST /api/referee/signup
 * Registar novo árbitro
 */
router.post(
  '/signup',
  validateRefereeSignup,
  upload.single('documento'),
  validateDocumentUpload,
  refereeSignupController.signupReferee
);

/**
 * POST /api/referee/login
 * Autenticar árbitro
 */
router.post(
  '/login',
  validateLogin,
  refereeSignupController.loginReferee
);

// ===== PERFIL DO ÁRBITRO (REQUER AUTENTICAÇÃO) =====

/**
 * GET /api/referee/profile
 * Obter perfil do árbitro autenticado
 */
router.get(
  '/profile',
  verifyToken,
  isReferee,
  checkRefereeStatus,
  refereeSignupController.getRefereeProfile
);

/**
 * PUT /api/referee/profile
 * Atualizar perfil do árbitro
 */
router.put(
  '/profile',
  verifyToken,
  isReferee,
  requireApprovedReferee,
  refereeSignupController.updateRefereeProfile
);

// ===== DASHBOARD (REQUER APROVAÇÃO) =====

/**
 * GET /api/referee/dashboard
 * Dashboard do árbitro
 */
router.get(
  '/dashboard',
  verifyToken,
  isReferee,
  requireApprovedReferee,
  refereeDashboardController.getDashboard
);

// ===== JOGOS =====

/**
 * GET /api/referee/matches/upcoming
 * Próximos jogos
 */
router.get(
  '/matches/upcoming',
  verifyToken,
  isReferee,
  requireApprovedReferee,
  refereeDashboardController.getUpcomingMatches
);

/**
 * GET /api/referee/matches/:matchId
 * Detalhes de um jogo
 */
router.get(
  '/matches/:matchId',
  verifyToken,
  isReferee,
  requireApprovedReferee,
  refereeDashboardController.getMatchDetails
);

/**
 * POST /api/referee/matches/:matchId/confirm
 * Confirmar presença no jogo
 */
router.post(
  '/matches/:matchId/confirm',
  verifyToken,
  isReferee,
  requireApprovedReferee,
  validatePresenceConfirmation,
  refereeDashboardController.confirmPresence
);

// ===== ESTATÍSTICAS =====

/**
 * GET /api/referee/statistics
 * Estatísticas do árbitro
 */
router.get(
  '/statistics',
  verifyToken,
  isReferee,
  requireApprovedReferee,
  refereeDashboardController.getStatistics
);

// ===== DISPONIBILIDADE =====

/**
 * GET /api/referee/availability
 * Obter disponibilidade semanal
 */
router.get(
  '/availability',
  verifyToken,
  isReferee,
  requireApprovedReferee,
  refereeDashboardController.getAvailability
);

/**
 * PUT /api/referee/availability
 * Atualizar disponibilidade semanal
 */
router.put(
  '/availability',
  verifyToken,
  isReferee,
  requireApprovedReferee,
  refereeDashboardController.updateAvailability
);

// ===== RELATÓRIOS =====

/**
 * POST /api/referee/reports
 * Submeter relatório pós-jogo
 */
router.post(
  '/reports',
  verifyToken,
  isReferee,
  requireApprovedReferee,
  validateReportSubmission,
  upload.fields([
    { name: 'pdf', maxCount: 1 },
    { name: 'imagenes', maxCount: 5 }
  ]),
  matchReportController.submitReport
);

/**
 * GET /api/referee/reports
 * Listar meus relatórios
 */
router.get(
  '/reports',
  verifyToken,
  isReferee,
  requireApprovedReferee,
  matchReportController.getMyReports
);

/**
 * GET /api/referee/reports/:reportId
 * Detalhes de um relatório
 */
router.get(
  '/reports/:reportId',
  verifyToken,
  isReferee,
  requireApprovedReferee,
  matchReportController.getReportDetails
);

module.exports = router;
