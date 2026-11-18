/**
 * Wraps async route handlers so rejected promises reach Express's error
 * middleware. Express 5 handles this automatically, but keeping the wrapper
 * makes the intent explicit and keeps controllers consistent.
 */
export function asyncHandler(handler) {
  return function wrappedHandler(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
