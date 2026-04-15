const express = require('express');
const cors = require('cors');
const path = require('path');
const { loadEnv } = require('./config/env');
const logger = require('./utils/logger');
const { closeClient } = require('./config/db');
const billingController = require('./controllers/billingController');
const authController = require('./controllers/authController');
const { requireAuth } = require('./middleware/auth');

// Load environment variables (throws in production if required vars missing)
try {
  loadEnv();
} catch (err) {
  if (err && err.code === 'ENV_VALIDATION_ERROR' && process.env.NODE_ENV !== 'production') {
    // In development warn instead of crashing
    logger.warn('Environment validation warning: ' + err.message);
  } else {
    throw err;
  }
}

const { connectDB } = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const adminAuthRoutes = require('./routes/adminAuth');
const adminRoutes = require('./routes/adminRoutes');
const adminDashboardRoutes = require('./routes/adminDashboard');
const teamManagerRoutes = require('./routes/teamManagerRoutes');
const lineupRoutes = require('./routes/lineupRoutes');
const favoritesRoutes = require('./routes/favoritesRoutes');
const lineupViewRoutes = require('./routes/lineupViewRoutes');
// Seus outros routers
const teamsRouter = require('./routes/teams');
const standingsRoutes = require('./routes/standingsRoutes');
const adminPlayersRoutes = require('./routes/adminPlayers');
const adminStandingsRoutes = require('./routes/adminStandings');
const adminScorersRoutes = require('./routes/adminScorers');
const playerRoutes = require('./routes/playerRoutes');
const matchesRoutes = require('./routes/matchesRoutes');
const liveMatchRoutes = require('./routes/liveMatchRoutes');
const newsRoutes = require('./routes/newsRoutes');
const competitionRoutes = require('./routes/competitionRoutes');
const submissionRoutes = require('./routes/submissionRoutes');
const imageRoutes = require('./routes/imageRoutes');
const communityRoutes = require('./routes/communityRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const editRequestRoutes = require('./routes/editRequestRoutes');
const discoveryRoutes = require('./routes/discoveryRoutes');
const reportRoutes = require('./routes/reportRoutes');
const refereeRoutes = require('./routes/refereeRoutes');
const adminRefereeRoutes = require('./routes/adminRefereeRoutes');
const billingRoutes = require('./routes/billingRoutes');

function createApp() {
  const app = express();

  // Configure CORS: allow origins from CORS_ORIGIN (comma separated) or allow all in dev
  const corsOrigin = process.env.CORS_ORIGIN || '*';
  const corsCredentials = process.env.CORS_CREDENTIALS === 'true';

  if (!corsOrigin || corsOrigin === '*') {
    app.use(cors({ origin: true, credentials: corsCredentials }));
  } else {
    const allowed = corsOrigin.split(',').map(s => s.trim()).filter(Boolean);
    app.use(cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (allowed.includes(origin)) return cb(null, true);
        return cb(new Error('CORS origin not allowed'), false);
      },
      credentials: corsCredentials
    }));
  }

  // Trust proxy (Render and other hosts)
  app.set('trust proxy', true);
  app.post('/api/billing/webhooks', express.raw({ type: 'application/json' }), billingController.handleWebhook);
  app.use(express.json({ limit: '6mb' }));
  app.use(express.urlencoded({ extended: true, limit: '6mb' }));
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

  app.get('/api/auth/me', (req, res, next) => {
    Promise.resolve(
      requireAuth(req, res, () => authController.getCurrentUser(req, res, next))
    ).catch(next);
  });
  app.use('/api/auth', authRoutes);
  app.use('/api/admin/auth', adminAuthRoutes);
  app.use('/api/team-manager', teamManagerRoutes);
  app.use('/api/team-manager/lineups', lineupRoutes);
  app.use('/api/live-match', liveMatchRoutes);
  app.use('/api/lineups', lineupViewRoutes);
  app.use('/api/user/favorites', favoritesRoutes);
  app.use('/api/news', newsRoutes);
  app.use('/api/competitions', competitionRoutes);
  app.use('/api/submissions', submissionRoutes);
  app.use('/api/images', imageRoutes);
  app.use('/api/community', communityRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/edit-requests', editRequestRoutes);
  app.use('/api/discovery', discoveryRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/referee', refereeRoutes);
  app.use('/api/billing', billingRoutes);
  app.use('/api/admin', adminRefereeRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/admin', adminDashboardRoutes);
  app.use('/api/admin/players', adminPlayersRoutes);
  app.use('/api/admin/standings', adminStandingsRoutes);
  app.use('/api/admin/scorers', adminScorersRoutes);
  app.use('/api/standings', standingsRoutes);
  app.use('/api/matches-by-competition', matchesRoutes);
  app.use('/api/players', playerRoutes);
  app.use('/api', teamsRouter);

  app.get('/', (req, res) => {
    res.status(200).send('✅ Backend AzoresScore a funcionar');
  });

  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: 'Route not found'
    });
  });

  app.use((err, req, res, next) => {
    logger.error('Unhandled request error', err.message);
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Erro interno do servidor',
      errors: err.details
    });
  });

  return app;
}

async function startServer() {
  await connectDB();

  const app = createApp();
  const PORT = process.env.PORT || 3000;

  const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info(`Server listening on port ${PORT}`);
  });

  // Graceful shutdown
  const shutdown = async (signal) => {
    try {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      server.close(() => {
        logger.info('HTTP server closed');
      });
      await closeClient();
      process.exit(0);
    } catch (err) {
      logger.error('Error during shutdown', err);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', err);
    process.exit(1);
  });

  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  createApp,
  startServer
};
