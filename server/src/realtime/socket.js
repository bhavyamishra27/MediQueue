import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { getAuthUser } from '../services/auth.service.js';
import { rooms, setRealtimeServer } from './emitter.js';

const RECOVERY_WINDOW_MS = 2 * 60 * 1000;

function authError(message, code) {
  const error = new Error(message);
  error.data = { code };
  return error;
}

function extractToken(socket) {
  const token = socket.handshake.auth?.token;
  if (typeof token !== 'string') return null;
  return token.trim() || null;
}

/**
 * Handshake authentication. The JWT is verified exactly like the REST layer,
 * then the identity is reloaded from SQLite so a deleted account or a changed
 * role cannot keep a stale socket connected. The client can never pick rooms.
 */
async function authenticate(socket, next) {
  const token = extractToken(socket);

  if (!token) {
    return next(authError('Authentication required.', 'AUTH_REQUIRED'));
  }

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch (error) {
    if (error?.name === 'TokenExpiredError') {
      return next(
        authError('Your session has expired. Please sign in again.', 'TOKEN_EXPIRED'),
      );
    }
    return next(authError('Invalid authentication token.', 'INVALID_TOKEN'));
  }

  if (!payload || typeof payload !== 'object' || !payload.sub) {
    return next(authError('Invalid authentication token.', 'INVALID_TOKEN'));
  }

  try {
    socket.data.user = await getAuthUser(payload.sub);
  } catch {
    return next(authError('Your session is no longer valid.', 'INVALID_TOKEN'));
  }

  return next();
}

/** Joins only the rooms that belong to the authenticated identity. */
function joinIdentityRooms(socket) {
  const user = socket.data.user;
  const joined = [rooms.user(user.id)];

  switch (user.role) {
    case 'PATIENT':
      joined.push(rooms.patient(user.id));
      break;
    case 'DOCTOR':
      if (user.doctorId) joined.push(rooms.doctor(user.doctorId));
      break;
    case 'HOSPITAL_ADMIN':
      if (user.hospitalId) joined.push(rooms.hospital(user.hospitalId));
      break;
    case 'PLATFORM_ADMIN':
      joined.push(rooms.platformAdmins);
      break;
    default:
      break;
  }

  socket.join(joined);

  return joined;
}

/**
 * Attaches a Socket.IO server to the existing HTTP server. Called once from
 * `src/index.js` so REST and websocket traffic share the same port.
 */
export function initSocketServer(httpServer) {
  const io = new Server(httpServer, {
    path: '/socket.io',
    serveClient: false,
    connectionStateRecovery: {
      maxDisconnectionDuration: RECOVERY_WINDOW_MS,
      skipMiddlewares: false,
    },
  });

  io.use(authenticate);

  io.on('connection', (socket) => {
    const joinedRooms = joinIdentityRooms(socket);

    socket.emit('realtime:ready', {
      role: socket.data.user.role,
      rooms: joinedRooms,
      recovered: Boolean(socket.recovered),
    });
  });

  setRealtimeServer(io);
  return io;
}
