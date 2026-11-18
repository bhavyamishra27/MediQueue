import { ApiError } from '../utils/ApiError.js';

export function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      message: `Route not found: ${req.method} ${req.originalUrl}`,
    },
  });
}

// Express identifies an error handler by its four parameters.
export function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  if (error instanceof ApiError) {
    return res.status(error.statusCode).json({
      error: {
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    });
  }

  // Prisma unique constraint violation.
  if (error?.code === 'P2002') {
    return res.status(409).json({
      error: {
        message: 'That record already exists.',
        details: error.meta?.target,
      },
    });
  }

  // Prisma "record required for operation not found".
  if (error?.code === 'P2025') {
    return res.status(404).json({
      error: { message: 'The requested record was not found.' },
    });
  }

  console.error('Unhandled API error:', error);
  return res.status(500).json({
    error: { message: 'Internal server error.' },
  });
}
