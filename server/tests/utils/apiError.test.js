import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../../src/utils/ApiError.js';

test('ApiError keeps its status code, message and details', () => {
  const error = new ApiError(409, 'Slot already booked', { slot: '10:00' });

  assert.equal(error.statusCode, 409);
  assert.equal(error.message, 'Slot already booked');
  assert.deepEqual(error.details, { slot: '10:00' });
  assert.equal(error.name, 'ApiError');
});

test('ApiError helpers create the expected status codes', () => {
  assert.equal(ApiError.badRequest('bad').statusCode, 400);
  assert.equal(ApiError.unauthorized().statusCode, 401);
  assert.equal(ApiError.forbidden().statusCode, 403);
  assert.equal(ApiError.notFound().statusCode, 404);
  assert.equal(ApiError.conflict('conflict').statusCode, 409);
});

test('ApiError helpers provide sensible default messages', () => {
  assert.equal(ApiError.unauthorized().message, 'Authentication required');
  assert.equal(
    ApiError.forbidden().message,
    'You do not have permission to do that',
  );
  assert.equal(ApiError.notFound().message, 'Resource not found');
});
