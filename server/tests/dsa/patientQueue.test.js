import test from 'node:test';
import assert from 'node:assert/strict';
import { PatientQueue } from '../../src/dsa/PatientQueue.js';

function entry(tokenNumber, priority = 1, extra = {}) {
  return {
    id: `entry-${tokenNumber}`,
    appointmentId: `appt-${tokenNumber}`,
    doctorId: 'doctor-1',
    patientId: `patient-${tokenNumber}`,
    patientName: `Patient ${tokenNumber}`,
    tokenNumber,
    priority,
    status: 'WAITING',
    ...extra,
  };
}

test('PatientQueue serves emergency patients before normal patients', () => {
  const queue = new PatientQueue({ doctorId: 'doctor-1' });

  queue.insert(entry(1));
  queue.insert(entry(2));
  queue.insert(entry(3, 0));

  assert.equal(queue.peekNext().tokenNumber, 3);
  assert.deepEqual(
    queue.getOrderedEntries().map((item) => item.tokenNumber),
    [3, 1, 2],
  );
  assert.equal(queue.extractNext().tokenNumber, 3);
  assert.equal(queue.extractNext().tokenNumber, 1);
});

test('PatientQueue uses token number to break ties (FCFS)', () => {
  const queue = new PatientQueue({ doctorId: 'doctor-1' });

  // Even if entries are inserted out of order, the heap still serves the
  // smaller token first. The FIFO view always reflects arrival order.
  queue.insert(entry(3));
  queue.insert(entry(1));
  queue.insert(entry(2));

  assert.deepEqual(
    queue.getOrderedEntries().map((item) => item.tokenNumber),
    [1, 2, 3],
  );
  assert.deepEqual(
    queue.getFifoOrder().map((item) => item.tokenNumber),
    [3, 1, 2],
  );
});

test('PatientQueue FIFO view excludes emergencies but keeps normal order', () => {
  const queue = new PatientQueue({ doctorId: 'doctor-1' });

  queue.insert(entry(1));
  queue.insert(entry(2, 0));
  queue.insert(entry(3));

  assert.deepEqual(
    queue.getFifoOrder().map((item) => item.tokenNumber),
    [1, 3],
  );
  assert.deepEqual(
    queue.getHeapArray().map((item) => item.tokenNumber).sort((a, b) => a - b),
    [1, 2, 3],
  );
});

test('PatientQueue reports 1-based positions', () => {
  const queue = new PatientQueue({ doctorId: 'doctor-1' });

  queue.insert(entry(1));
  queue.insert(entry(2));
  queue.insert(entry(3, 0));

  assert.equal(queue.getPosition('appt-3'), 1);
  assert.equal(queue.getPosition('appt-1'), 2);
  assert.equal(queue.getPosition('appt-2'), 3);
  assert.equal(queue.getPosition('appt-missing'), null);
});

test('PatientQueue remove supports cancellation and no-shows', () => {
  const queue = new PatientQueue({ doctorId: 'doctor-1' });
  queue.insert(entry(1));
  queue.insert(entry(2));
  queue.insert(entry(3));

  const removed = queue.remove('appt-2');
  assert.equal(removed.tokenNumber, 2);
  assert.equal(queue.get('appt-2'), null);
  assert.equal(queue.size(), 2);
  assert.equal(queue.remove('appt-2'), null);
  assert.deepEqual(
    queue.getOrderedEntries().map((item) => item.tokenNumber),
    [1, 3],
  );
  assert.deepEqual(
    queue.getFifoOrder().map((item) => item.tokenNumber),
    [1, 3],
  );
});

test('PatientQueue rebuilding replaces previous state', () => {
  const queue = new PatientQueue({ doctorId: 'doctor-1' });
  queue.insert(entry(1));
  queue.insert(entry(2));

  queue.rebuild([entry(4), entry(5, 0)]);

  assert.equal(queue.size(), 2);
  assert.equal(queue.get('appt-1'), null);
  assert.deepEqual(
    queue.getOrderedEntries().map((item) => item.tokenNumber),
    [5, 4],
  );
});

test('PatientQueue re-inserting the same appointment does not duplicate it', () => {
  const queue = new PatientQueue({ doctorId: 'doctor-1' });

  queue.insert(entry(1));
  queue.insert(entry(1, 0));

  assert.equal(queue.size(), 1);
  assert.equal(queue.peekNext().priority, 0);
  assert.equal(queue.getFifoOrder().length, 0);
});

test('PatientQueue clear and empty checks', () => {
  const queue = new PatientQueue({ doctorId: 'doctor-1' });
  assert.equal(queue.isEmpty(), true);

  queue.insert(entry(1));
  assert.equal(queue.isEmpty(), false);

  queue.clear();
  assert.equal(queue.isEmpty(), true);
  assert.equal(queue.peekNext(), null);
  assert.equal(queue.extractNext(), null);
});
