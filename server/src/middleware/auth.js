import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getAuthUser } from '../services/auth.service.js';

function extractBearerToken(header) {
  if (typeof header !== 'string') return null;
  const [scheme, token] = header.split(' ');
  if (!token || scheme.toLowerCase() !== 'bearer') return null;
  return token.trim() || null;
}

/**
 * Verifies the Bearer token and attaches a freshly loaded, privacy-safe user
 * to req.user. Identity fields (patientId, doctorId, hospitalId) always come
 * from the database, never from the token or request body.
 */
export const requireAuth = asyncHandler(async (req, res, next) => {
  const token = extractBearerToken(req.headers.authorization);

  if (!token) {
    throw ApiError.unauthorized('Authentication required.');
  }

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch (error) {
    if (error?.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('Your session has expired. Please sign in again.');
    }
    throw ApiError.unauthorized('Invalid authentication token.');
  }

  if (!payload || typeof payload !== 'object' || !payload.sub) {
    throw ApiError.unauthorized('Invalid authentication token.');
  }

  req.user = await getAuthUser(payload.sub);
  req.tokenPayload = payload;

  next();
});

/**
 * Role guard. Use after requireAuth:
 *   router.get('/doctor-only', requireAuth, requireRole('DOCTOR'), handler)
 */
export function requireRole(...roles) {
  const allowed = new Set(roles.flat());

  return function roleGuard(req, res, next) {
    if (!req.user) {
      return next(ApiError.unauthorized());
    }

    if (!allowed.has(req.user.role)) {
      return next(ApiError.forbidden('Your role cannot access this resource.'));
    }

    return next();
  };
}
