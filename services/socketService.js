/**
 * socketService.js
 *
 * Singleton that holds the Socket.io server instance.
 * Call socketService.init(httpServer) once at startup.
 * Anywhere in the backend call socketService.emit(userId, event, data)
 * to push real-time events to a specific authenticated user.
 */

const { Server } = require('socket.io');

let io = null;

// userId → Set<socketId>
const userSockets = new Map();

function init(httpServer) {
  const corsOrigin = process.env.CORS_ORIGIN || '*';

  io = new Server(httpServer, {
    cors: {
      origin: corsOrigin === '*' ? true : corsOrigin.split(',').map((o) => o.trim()),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60_000,
    pingInterval: 25_000,
  });

  // ── Auth middleware ──────────────────────────────────────────────────────
  io.use((socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        // Allow unauthenticated connections but mark them
        socket.userId = null;
        return next();
      }

      const jwt = require('jsonwebtoken');
      const secret = process.env.JWT_SECRET;
      if (!secret) {
        socket.userId = null;
        return next();
      }

      const decoded = jwt.verify(token, secret);
      socket.userId = decoded.id || decoded._id || decoded.userId || null;
      next();
    } catch (_) {
      socket.userId = null;
      next(); // Allow but unauthenticated
    }
  });

  // ── Connection handler ───────────────────────────────────────────────────
  io.on('connection', (socket) => {
    const uid = socket.userId;

    if (uid) {
      if (!userSockets.has(uid)) userSockets.set(uid, new Set());
      userSockets.get(uid).add(socket.id);

      // Join personal room so we can also do io.to(uid).emit(...)
      socket.join(`user:${uid}`);
    }

    socket.on('disconnect', () => {
      if (uid) {
        const set = userSockets.get(uid);
        if (set) {
          set.delete(socket.id);
          if (set.size === 0) userSockets.delete(uid);
        }
      }
    });
  });

  return io;
}

/**
 * Emit an event to a specific user (all their connected sockets).
 * @param {string} userId
 * @param {string} event
 * @param {*} data
 */
function emitToUser(userId, event, data) {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, data);
}

/**
 * Broadcast to all connected clients.
 */
function broadcast(event, data) {
  if (!io) return;
  io.emit(event, data);
}

function getIO() {
  return io;
}

module.exports = { init, emitToUser, broadcast, getIO };
