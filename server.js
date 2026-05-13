const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const http = require('http');
const socketService = require('./services/socketService');

const { loadEnv } = require('./config/env');
const logger = require('./utils/logger');
const { connectDB, closeClient } = require('./config/db');
const { runAtlasSeed } = require('./services/atlasSeeder');

const billingController = require('./controllers/billingController');
const authController = require('./controllers/authController');
const { requireAuth } = require('./middleware/auth');

// Routes
const authRoutes = require('./routes/authRoutes');
const adminAuthRoutes = require('./routes/adminAuth');
const adminRoutes = require('./routes/adminRoutes');
const adminDashboardRoutes = require('./routes/adminDashboard');
const teamManagerRoutes = require('./routes/teamManagerRoutes');
const lineupRoutes = require('./routes/lineupRoutes');
const favoritesRoutes = require('./routes/favoritesRoutes');
const lineupViewRoutes = require('./routes/lineupViewRoutes');
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
const journalistRoutes = require('./routes/journalistRoutes');
const userProfileRoutes = require('./routes/userProfileRoutes');
const awardRoutes = require('./routes/awardRoutes');


// =======================
// ENV LOAD SAFE
// =======================
try {
  loadEnv();
} catch (err) {
  if (err?.code === 'ENV_VALIDATION_ERROR' && process.env.NODE_ENV !== 'production') {
    logger.warn('Environment warning: ' + err.message);
  } else {
    throw err;
  }
}


// =======================
// APP CREATION
// =======================
function createApp() {
  const app = express();

  // Trust proxy (Render)
  app.set('trust proxy', 1);

  // =======================
  // SECURITY HEADERS
  // =======================
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow image serving from /uploads
    contentSecurityPolicy: false, // CSP managed by front-end host
  }));

  // =======================
  // RATE LIMITING
  // =======================
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,                   // max 20 auth attempts per window per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas tentativas. Tente novamente mais tarde.' },
  });
  const generalLimiter = rateLimit({
    windowMs: 60 * 1000,       // 1 minute
    max: 300,                  // generous limit for regular API use
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);
  app.use('/api', generalLimiter);

  // =======================
  // CORS CONFIG
  // =======================
  const corsOrigin = process.env.CORS_ORIGIN || '*';
  const corsCredentials = process.env.CORS_CREDENTIALS === 'true';

  if (corsOrigin === '*') {
    app.use(cors({ origin: true, credentials: corsCredentials }));
  } else {
    const allowed = corsOrigin.split(',').map(o => o.trim());

    app.use(cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (allowed.includes(origin)) return cb(null, true);
        return cb(new Error('Not allowed by CORS'), false);
      },
      credentials: corsCredentials
    }));
  }

  // =======================
  // BODY PARSERS
  // =======================
  app.use(express.json({ limit: '6mb' }));
  app.use(express.urlencoded({ extended: true, limit: '6mb' }));

  // Stripe webhook raw body
  app.post(
    '/api/billing/webhooks',
    express.raw({ type: 'application/json' }),
    billingController.handleWebhook
  );

  // Static files
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

  // =======================
  // AUTH ROUTE (special)
  // =======================
  app.get('/api/auth/me', (req, res, next) => {
    Promise.resolve(
      requireAuth(req, res, () => authController.getCurrentUser(req, res, next))
    ).catch(next);
  });

  // =======================
  // ROUTES
  // =======================
  app.use('/api/auth', authRoutes);
  app.use('/api/admin/auth', adminAuthRoutes);

  app.use('/api/team-manager', teamManagerRoutes);
  app.use('/api/team-manager/lineups', lineupRoutes);

  app.use('/api/live-match', liveMatchRoutes);
  app.use('/api/lineups', lineupViewRoutes);

  app.use('/api/user/favorites', favoritesRoutes);
  app.use('/api/user', userProfileRoutes);
  app.use('/api/awards', awardRoutes);

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
  app.use('/api/journalist', journalistRoutes);

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

  // =======================
  // HEALTH CHECK
  // =======================
  app.get('/', (req, res) => {
    res.status(200).send('✅ Backend AzoresScore a funcionar');
  });

  // =======================
  // 404
  // =======================
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: 'Route not found'
    });
  });

  // =======================
  // ERROR HANDLER
  // =======================
  app.use((err, req, res, next) => {
    logger.error('Unhandled error:', err);

    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Erro interno do servidor'
    });
  });

  return app;
}


// =======================
// START SERVER
// =======================
async function startServer() {
  try {
    // Connect DB (safe fail)
    try {
      await connectDB();
      logger.info('MongoDB connected');
    } catch (err) {
      logger.error('MongoDB connection failed:', err.message);
    }

    // ── Seed automático local → Atlas (apenas na primeira execução em produção) ──
    // Só corre se MONGO_LOCAL_URI e MONGO_ATLAS_URI estiverem definidas.
    // É idempotente: se já foi feito antes, não faz nada.
    await runAtlasSeed();

    const app = createApp();
    const PORT = process.env.PORT || 3000;

    const server = http.createServer(app);

    // Attach Socket.io
    socketService.init(server);
    logger.info('Socket.io initialized');

    server.listen(PORT, '0.0.0.0', () => {
      logger.info(`Server running on port ${PORT}`);
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`Received ${signal}, shutting down...`);

      server.close(async () => {
        await closeClient();
        logger.info('Server closed');
        process.exit(0);
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    process.on('uncaughtException', (err) => {
      logger.error('Uncaught exception:', err);
      process.exit(1);
    });

    process.on('unhandledRejection', (err) => {
      logger.error('Unhandled rejection:', err);
    });

    return server;

  } catch (err) {
    logger.error('Fatal startup error:', err);
    process.exit(1);
  }
}


// =======================
// RUN
// =======================
if (require.main === module) {
  startServer();
}

module.exports = {
  createApp,
  startServer
};