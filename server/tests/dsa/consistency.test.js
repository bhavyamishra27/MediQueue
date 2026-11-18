import test from 'node:test';
import assert from 'node:assert/strict';
import { PatientQueue } from '../../src/dsa/PatientQueue.js';

function entry(tokenNumber, priority = 1) {
  return {
    id: `entry-${tokenNumber}`,
    appointmentId: `appt-${tokenNumber}`,
    doctorId: 'doctor-1',
    patientId: `patient-${tokenNumber}`,
    patientName: `Patient ${tokenNumber}`,
    tokenNumber,
    priority,
    status: 'WAITING',
  };
}

test('normal-only heap extraction matches FIFO arrival order exactly', () => {
  const queue = new PatientQueue({ doctorId: 'doctor-1' });

  // Tokens are issued in check-in order, so arrival order and token order are
  // the same. With no emergencies the heap must reproduce that order.
  for (let token = 1; token <= 10; token += 1) queue.insert(entry(token));

  const fifoOrder = queue.getFifoOrder().map((item) => item.tokenNumber);

  const extracted = [];
  while (!queue.isEmpty()) extracted.push(queue.extractNext().tokenNumber);

  assert.deepEqual(extracted, fifoOrder);
  assert.deepEqual(extracted, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test('an emergency changes the next extraction but not normal relative order', () => {
  const queue = new PatientQueue({ doctorId: 'doctor-1' });
  for (const token of [1, 2, 3, 4]) queue.insert(entry(token));

  const normalOrderBefore = queue.getFifoOrder().map((item) => item.tokenNumber);

  // Token 5 arrives later but is an emergency (priority 0).
  queue.insert(entry(5, 0));

  assert.equal(queue.peekNext().tokenNumber, 5);
  assert.equal(queue.extractNext().tokenNumber, 5);

  const remainingNormalOrder = [];
  while (!queue.isEmpty()) remainingNormalOrder.push(queue.extractNext().tokenNumber);

  assert.deepEqual(remainingNormalOrder, normalOrderBefore);
  assert.deepEqual(remainingNormalOrder, [1, 2, 3, 4]);
});
