import test from 'node:test';
import assert from 'node:assert/strict';
import { QueueManager } from '../../src/dsa/QueueManager.js';

function entry(doctorId, tokenNumber, priority = 1) {
  return {
    id: `entry-${doctorId}-${tokenNumber}`,
    appointmentId: `appt-${doctorId}-${tokenNumber}`,
    doctorId,
    patientId: `patient-${doctorId}-${tokenNumber}`,
    patientName: `Patient ${doctorId}-${tokenNumber}`,
    tokenNumber,
    priority,
    status: 'WAITING',
  };
}

function createManager() {
  const manager = new QueueManager();
  manager.registerDoctor({
    id: 'doctor-a',
    name: 'Dr. A',
    hospitalId: 'hospital-1',
    hospitalName: 'Test Hospital',
    roomNumber: 'A-1',
    avgConsultationMinutes: 15,
  });
  manager.registerDoctor({
    id: 'doctor-b',
    name: 'Dr. B',
    hospitalId: 'hospital-1',
    hospitalName: 'Test Hospital',
    avgConsultationMinutes: 20,
  });
  return manager;
}

test('QueueManager keeps independent queues per doctor', () => {
  const manager = createManager();

  manager.insertWaiting(entry('doctor-a', 1));
  manager.insertWaiting(entry('doctor-a', 2));
  manager.insertWaiting(entry('doctor-b', 1));

  assert.equal(manager.getSnapshot('doctor-a').counts.waiting, 2);
  assert.equal(manager.getSnapshot('doctor-b').counts.waiting, 1);
  assert.equal(manager.getQueue('doctor-a').size(), 2);
  assert.equal(manager.getQueue('doctor-b').size(), 1);
});

test('QueueManager provides O(1) appointment lookups', () => {
  const manager = createManager();
  manager.insertWaiting(entry('doctor-a', 1));

  assert.equal(manager.getEntryByAppointment('appt-doctor-a-1').tokenNumber, 1);
  assert.equal(manager.getEntryById('entry-doctor-a-1').tokenNumber, 1);
  assert.equal(manager.getEntryByAppointment('missing'), null);
  assert.equal(manager.getEntryById('missing'), null);
});

test('QueueManager call-next extracts the heap root and sets the current patient', () => {
  const manager = createManager();
  manager.insertWaiting(entry('doctor-a', 1));
  manager.insertWaiting(entry('doctor-a', 2));

  const called = manager.callNext('doctor-a');

  assert.equal(called.tokenNumber, 1);
  assert.equal(manager.getCurrent('doctor-a').tokenNumber, 1);
  assert.equal(manager.getSnapshot('doctor-a').counts.waiting, 1);

  // Only one patient may be current at a time.
  assert.equal(manager.callNext('doctor-a'), null);

  manager.clearCurrent('doctor-a');
  assert.equal(manager.getCurrent('doctor-a'), null);
  assert.equal(manager.callNext('doctor-a').tokenNumber, 2);
  assert.equal(manager.callNext('doctor-a'), null);
});

test('QueueManager removeWaiting works for cancellations and no-shows', () => {
  const manager = createManager();
  manager.insertWaiting(entry('doctor-a', 1));
  manager.insertWaiting(entry('doctor-a', 2));

  const removed = manager.removeWaiting('appt-doctor-a-1');
  assert.equal(removed.tokenNumber, 1);
  assert.equal(manager.getEntryByAppointment('appt-doctor-a-1'), null);
  assert.equal(manager.getSnapshot('doctor-a').waiting[0].tokenNumber, 2);
  assert.equal(manager.removeWaiting('missing'), null);
});

test('QueueManager rebuildDoctorQueue replaces only that doctor', () => {
  const manager = createManager();
  manager.insertWaiting(entry('doctor-a', 1));
  manager.insertWaiting(entry('doctor-b', 1));

  manager.rebuildDoctorQueue('doctor-a', [entry('doctor-a', 5), entry('doctor-a', 6, 0)]);

  assert.equal(manager.getEntryByAppointment('appt-doctor-a-1'), null);
  assert.deepEqual(
    manager.getSnapshot('doctor-a').waiting.map((item) => item.tokenNumber),
    [6, 5],
  );
  assert.equal(manager.getSnapshot('doctor-b').counts.waiting, 1);
});

test('QueueManager snapshot exposes positions and current patient', () => {
  const manager = createManager();
  manager.insertWaiting(entry('doctor-a', 1));
  manager.insertWaiting(entry('doctor-a', 2));
  manager.setCurrent('doctor-a', entry('doctor-a', 3));

  const snapshot = manager.getSnapshot('doctor-a');

  assert.equal(snapshot.doctor.name, 'Dr. A');
  assert.equal(snapshot.current.tokenNumber, 3);
  assert.deepEqual(
    snapshot.waiting.map((item) => ({ token: item.tokenNumber, position: item.position })),
    [
      { token: 1, position: 1 },
      { token: 2, position: 2 },
    ],
  );
  assert.deepEqual(snapshot.counts, { waiting: 2, current: 1, active: 3 });
});

test('QueueManager DSA snapshot contains heap, FIFO, complexities and log', () => {
  const manager = createManager();
  manager.insertWaiting(entry('doctor-a', 1));
  manager.insertWaiting(entry('doctor-a', 2, 0));

  const dsa = manager.getDsaSnapshot('doctor-a');

  assert.equal(dsa.size, 2);
  assert.equal(dsa.isEmpty, false);
  assert.equal(dsa.heapArray.length, 2);
  assert.deepEqual(
    dsa.fifoOrder.map((item) => item.tokenNumber),
    [1],
  );
  assert.deepEqual(
    dsa.orderedWaiting.map((item) => item.tokenNumber),
    [2, 1],
  );
  assert.ok(dsa.complexities.length >= 5);
  assert.ok(dsa.operations.some((operation) => operation.type === 'insert'));
  assert.ok(dsa.operations.every((operation) => operation.doctorId === 'doctor-a'));
});

test('QueueManager operation log is bounded', () => {
  const manager = new QueueManager({ maxOperations: 3 });

  for (let token = 1; token <= 10; token += 1) {
    manager.logOperation({
      type: 'test',
      doctorId: 'doctor-a',
      complexity: 'O(1)',
      message: `Operation ${token}`,
    });
  }

  const operations = manager.getOperations();
  assert.equal(operations.length, 3);
  assert.deepEqual(
    operations.map((operation) => operation.message),
    ['Operation 8', 'Operation 9', 'Operation 10'],
  );
});

test('QueueManager clearDoctor and clearAll reset only the intended state', () => {
  const manager = createManager();
  manager.insertWaiting(entry('doctor-a', 1));
  manager.insertWaiting(entry('doctor-b', 1));
  manager.setCurrent('doctor-a', entry('doctor-a', 2));

  manager.clearDoctor('doctor-a');
  assert.equal(manager.getQueue('doctor-a'), null);
  assert.equal(manager.getCurrent('doctor-a'), null);
  assert.equal(manager.getEntryByAppointment('appt-doctor-a-2'), null);
  assert.equal(manager.getSnapshot('doctor-b').counts.waiting, 1);

  manager.clearAll();
  assert.equal(manager.getQueue('doctor-b'), null);
  assert.equal(manager.getDoctor('doctor-a'), null);
  assert.deepEqual(manager.getOperations(), []);
});
