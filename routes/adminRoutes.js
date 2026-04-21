// routes/adminRoutes.js
const express = require('express');
const router = express.Router();

// Middlewares
const { verifyToken, verifyAdmin } = require('../middleware/auth');

// Controllers
const adminUserController = require('../controllers/adminUserController');
const adminClubController = require('../controllers/adminClubController');
const adminMatchController = require('../controllers/adminMatchController');
const adminRefereeController = require('../controllers/adminRefereeController');
const adminCompetitionController = require('../controllers/adminCompetitionController');
const adminDashboardController = require('../controllers/adminDashboardController');

// ==================== MIDDLEWARES GLOBAIS ====================
// Todos as rotas admin requerem autenticação e permissão de admin
router.use(verifyToken);
router.use(verifyAdmin);

// ==================== DASHBOARD ====================
router.get('/dashboard', adminDashboardController.getDashboardStats);
router.get('/dashboard/health', adminDashboardController.getSystemHealth);
router.get('/dashboard/activity', adminDashboardController.getActivity);

// ==================== USERS ====================
router.get('/users', adminUserController.getAllUsers);
router.get('/users/stats', adminUserController.getUsersStats);
router.get('/users/:id', adminUserController.getUserById);
router.put('/users/:id', adminUserController.updateUser);
router.patch('/users/:id/role', adminUserController.updateUserRole);
router.patch('/users/:id/status', adminUserController.updateUserStatus);
router.delete('/users/:id', adminUserController.deleteUser);

// ==================== CLUBS ====================
router.get('/clubs', adminClubController.getAllClubs);
router.post('/clubs', adminClubController.createClub);
router.get('/clubs/stats', adminClubController.getClubsStats);
router.get('/clubs/:id', adminClubController.getClubById);
router.put('/clubs/:id', adminClubController.updateClub);
router.delete('/clubs/:id', adminClubController.deleteClub);

// ==================== MATCHES ====================
router.get('/matches', adminMatchController.getAllMatches);
router.post('/matches', adminMatchController.createMatch);
router.get('/matches/stats', adminMatchController.getMatchesStats);
router.get('/matches/:id', adminMatchController.getMatchById);
router.put('/matches/:id', adminMatchController.updateMatch);
router.put('/matches/:id/referees', adminMatchController.assignReferees);
router.patch('/matches/:id/score', adminMatchController.updateMatchScore);
router.post('/matches/:id/events', adminMatchController.addMatchEvent);
router.delete('/matches/:id', adminMatchController.deleteMatch);

// ==================== REFEREES ====================
router.get('/referees/types', adminRefereeController.getRefereeTypes);
router.get('/referees', adminRefereeController.getAllReferees);
router.post('/referees', adminRefereeController.createReferee);
router.get('/referees/stats', adminRefereeController.getRefereesStats);
router.get('/referees/:id', adminRefereeController.getRefereeById);
router.put('/referees/:id', adminRefereeController.updateReferee);
router.delete('/referees/:id', adminRefereeController.deleteReferee);

// ==================== COMPETITIONS ====================
router.get('/competitions', adminCompetitionController.getAllCompetitions);
router.post('/competitions', adminCompetitionController.createCompetition);
router.get('/competitions/stats', adminCompetitionController.getCompetitionsStats);
router.get('/competitions/:id', adminCompetitionController.getCompetitionById);
router.put('/competitions/:id', adminCompetitionController.updateCompetition);
router.patch('/competitions/:id/teams', adminCompetitionController.updateCompetitionTeams);
router.delete('/competitions/:id', adminCompetitionController.deleteCompetition);

module.exports = router;
