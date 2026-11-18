/**
 * Phase 5 live queue integration tests.
 * Runs against an isolated SQLite file and never touches the development
 * database. Queue state is rebuilt from SQLite in `before` and again in the
 * restart-rebuild test.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const prismaCli = path.join(serverRoot, 'node_modules', 'prisma', 'build', 'index.js');
const testDbBase = path.join(serverRoot, 'prisma', 'test-queue.db');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file:./test-queue.db';
process.env.JWT_SECRET = 'phase-5-integration-test-secret-not-used-in-production';
process.env.JWT_EXPIRES_IN = '1h';
process.env.DEMO_PASSWORD = 'DemoPassword123';

const DEMO_PASSWORD = process.env.DEMO_PASSWORD;

let server;
let baseUrl;
let prisma;
let bcrypt;
let rebuildQueues;
let dates;
let ids;
let tokens;
let appointments;
let queueEntries;

function removeTestDatabase() {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    const file = `${testDbBase}${suffix}`;
    if (existsSync(file)) {
      try {
        rmSync(file, { force: true });
      } catch {
        // Windows may briefly keep a handle; --force-reset handles leftovers.
      }
    }
  }
}

async function listen(app) {
  const httpServer = app.listen(0);
  await new Promise((resolve, reject) => {
    httpServer.once('listening', resolve);
    httpServer.once('error', reject);
  });
  const { port } = httpServer.address();
  return { httpServer, url: `http://127.0.0.1:${port}` };
}

async function request(pathname, { method = 'GET', body, token } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  return { status: response.status, body: json };
}

async function login(email, password = DEMO_PASSWORD) {
  const response = await request('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  assert.equal(response.status, 200, `login failed for ${email}`);
  return response.body.token;
}

before(async () => {
  assert.ok(existsSync(prismaCli), `Prisma CLI not found at ${prismaCli}`);

  removeTestDatabase();

  execFileSync(
    process.execPath,
    [prismaCli, 'db', 'push', '--force-reset', '--skip-generate'],
    { cwd: serverRoot, env: process.env, stdio: 'pipe' },
  );

  const [
    { app },
    { prisma: prismaClient, configureDatabase },
    bcryptModule,
    datesModule,
    queueServiceModule,
  ] = await Promise.all([
    import('../../src/app.js'),
    import('../../src/config/prisma.js'),
    import('bcryptjs'),
    import('../../src/utils/dates.js'),
    import('../../src/services/queue.service.js'),
  ]);

  prisma = prismaClient;
  bcrypt = bcryptModule.default;
  dates = datesModule;
  rebuildQueues = queueServiceModule.rebuildQueues;

  await configureDatabase();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const hospital = await prisma.hospital.create({
    data: {
      name: 'Queue Test Hospital',
      address: '1 Queue Road',
      city: 'Pune',
      phone: '+91 20 4444 4444',
      email: 'queue@test.local',
    },
  });

  async function createDoctor(email, name, avgConsultationMinutes) {
    const user = await prisma.user.create({
      data: { email, passwordHash, name, role: 'DOCTOR' },
    });
    const doctor = await prisma.doctor.create({
      data: {
        userId: user.id,
        hospitalId: hospital.id,
        specialization: 'General Medicine',
        qualification: 'MBBS',
        experienceYears: 8,
        avgConsultationMinutes,
        roomNumber: 'Q-1',
      },
    });
    return { user, doctor };
  }

  const doctorA = await createDoctor('queue.doctor.a@test.local', 'Dr. Queue A', 15);
  const doctorB = await createDoctor('queue.doctor.b@test.local', 'Dr. Queue B', 20);

  async function createPatient(email, name) {
    const user = await prisma.user.create({
      data: { email, passwordHash, name, role: 'PATIENT' },
    });
    const patient = await prisma.patient.create({ data: { userId: user.id } });
    return { user, patient };
  }

  const patients = {};
  for (let index = 1; index <= 8; index += 1) {
    patients[`p${index}`] = await createPatient(
      `queue.patient.${index}@test.local`,
      `Queue Patient ${index}`,
    );
  }

  const today = dates.todayDateString();
  const tomorrow = dates.addDaysToDateString(today, 1);

  function makeSlotKey(doctorId, date, slotTime) {
    return `${doctorId}|${date}|${slotTime}`;
  }

  async function createAppointment(patientId, doctorId, slotTime, { date = today, status = 'BOOKED' } = {}) {
    return prisma.appointment.create({
      data: {
        patientId,
        doctorId,
        date,
        slotTime,
        slotKey: makeSlotKey(doctorId, date, slotTime),
        status,
        reason: 'Queue integration test',
      },
    });
  }

  appointments = {
    p1: await createAppointment(patients.p1.patient.id, doctorA.doctor.id, '09:00'),
    p2: await createAppointment(patients.p2.patient.id, doctorA.doctor.id, '09:15'),
    p3: await createAppointment(patients.p3.patient.id, doctorA.doctor.id, '09:30'),
    p5: await createAppointment(patients.p5.patient.id, doctorA.doctor.id, '09:45'),
    p6: await createAppointment(patients.p6.patient.id, doctorA.doctor.id, '10:00'),
    p7: await createAppointment(patients.p7.patient.id, doctorA.doctor.id, '10:15'),
    p8: await createAppointment(patients.p8.patient.id, doctorB.doctor.id, '09:00'),
    future: await createAppointment(patients.p1.patient.id, doctorA.doctor.id, '11:00', {
      date: tomorrow,
    }),
  };

  appointments.cancelled = await prisma.appointment.create({
    data: {
      patientId: patients.p1.patient.id,
      doctorId: doctorA.doctor.id,
      date: today,
      slotTime: '08:00',
      slotKey: null,
      status: 'CANCELLED',
      reason: 'Cancelled before the test',
      cancelledAt: new Date(),
    },
  });

  ids = {
    hospitalId: hospital.id,
    doctorAId: doctorA.doctor.id,
    doctorBId: doctorB.doctor.id,
    patients: Object.fromEntries(
      Object.entries(patients).map(([key, value]) => [key, value.patient.id]),
    ),
  };

  const main = await listen(app);
  server = main.httpServer;
  baseUrl = main.url;

  tokens = {
    doctorA: await login('queue.doctor.a@test.local'),
    doctorB: await login('queue.doctor.b@test.local'),
  };

  for (let index = 1; index <= 8; index += 1) {
    tokens[`p${index}`] = await login(`queue.patient.${index}@test.local`);
  }

  // Equivalent to the startup rebuild in src/index.js.
  await rebuildQueues();
  queueEntries = {};
});

after(async () => {
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));

  if (prisma) {
    await prisma.$disconnect();
  }

  removeTestDatabase();
});

test('queue endpoints enforce authentication and roles', async () => {
  const anonymous = await request('/api/queues/me');
  assert.equal(anonymous.status, 401);

  const doctorOnPatientRoute = await request('/api/queues/me', { token: tokens.doctorA });
  assert.equal(doctorOnPatientRoute.status, 403);

  const patientOnDoctorRoute = await request('/api/doctor/queue', { token: tokens.p1 });
  assert.equal(patientOnDoctorRoute.status, 403);

  const patientCallingNext = await request('/api/doctor/queue/call-next', {
    method: 'POST',
    token: tokens.p1,
  });
  assert.equal(patientCallingNext.status, 403);

  const doctorCheckingIn = await request(
    `/api/appointments/${appointments.p1.id}/check-in`,
    { method: 'POST', token: tokens.doctorA },
  );
  assert.equal(doctorCheckingIn.status, 403);
});

test('check-in rejects other patients, future dates and non-booked appointments', async () => {
  const otherPatient = await request(`/api/appointments/${appointments.p1.id}/check-in`, {
    method: 'POST',
    token: tokens.p2,
  });
  assert.equal(otherPatient.status, 404);

  const future = await request(`/api/appointments/${appointments.future.id}/check-in`, {
    method: 'POST',
    token: tokens.p1,
  });
  assert.equal(future.status, 400);
  assert.match(future.body.error.message, /day of your appointment/i);

  const cancelled = await request(`/api/appointments/${appointments.cancelled.id}/check-in`, {
    method: 'POST',
    token: tokens.p1,
  });
  assert.equal(cancelled.status, 409);

  const unknown = await request('/api/appointments/does-not-exist/check-in', {
    method: 'POST',
    token: tokens.p1,
  });
  assert.equal(unknown.status, 404);
});

test('check-in issues sequential tokens and creates waiting entries', async () => {
  const first = await request(`/api/appointments/${appointments.p1.id}/check-in`, {
    method: 'POST',
    token: tokens.p1,
  });

  assert.equal(first.status, 201);
  assert.equal(first.body.queueEntry.tokenNumber, 1);
  assert.equal(first.body.queueEntry.priority, 1);
  assert.equal(first.body.queueEntry.priorityLabel, 'Normal');
  assert.equal(first.body.queueEntry.status, 'WAITING');
  assert.equal(first.body.appointment.status, 'CHECKED_IN');
  assert.equal(first.body.appointment.slotTime, '09:00');
  assert.equal('slotKey' in first.body.appointment, false);

  queueEntries.p1 = first.body.queueEntry.id;

  const second = await request(`/api/appointments/${appointments.p2.id}/check-in`, {
    method: 'POST',
    token: tokens.p2,
  });

  assert.equal(second.status, 201);
  assert.equal(second.body.queueEntry.tokenNumber, 2);
  queueEntries.p2 = second.body.queueEntry.id;

  const duplicate = await request(`/api/appointments/${appointments.p1.id}/check-in`, {
    method: 'POST',
    token: tokens.p1,
  });
  assert.equal(duplicate.status, 409);

  const stored = await prisma.queueEntry.findMany({
    where: { doctorId: ids.doctorAId, queueDate: dates.todayDateString() },
    orderBy: { tokenNumber: 'asc' },
    select: { tokenNumber: true, status: true, priority: true },
  });

  assert.deepEqual(stored, [
    { tokenNumber: 1, status: 'WAITING', priority: 1 },
    { tokenNumber: 2, status: 'WAITING', priority: 1 },
  ]);

  const notification = await prisma.notification.findFirst({
    where: { appointmentId: appointments.p1.id, type: 'QUEUE' },
  });
  assert.ok(notification);
  assert.match(notification.message, /token number is #1/i);
});

test('patient queue state shows position, estimate and masked names', async () => {
  const mine = await request('/api/queues/me', { token: tokens.p2 });

  assert.equal(mine.status, 200);
  assert.equal(mine.body.queue.active, true);
  assert.equal(mine.body.queue.entry.tokenNumber, 2);
  assert.equal(mine.body.queue.entry.position, 2);
  assert.equal(mine.body.queue.entry.priorityLabel, 'Normal');
  assert.ok(mine.body.queue.entry.estimatedWaitMinutes >= 0);
  assert.equal(mine.body.queue.current, null);
  assert.equal(mine.body.queue.waiting.length, 2);
  assert.equal(mine.body.queue.doctor.id, ids.doctorAId);
  assert.ok(
    mine.body.queue.waiting.every((row) => row.patientName.includes('***')),
  );
  assert.ok(
    mine.body.queue.waiting.every((row) => !row.patientName.includes('Queue Patient')),
  );
  assert.equal(
    mine.body.queue.waiting.find((row) => row.tokenNumber === 2).isYou,
    true,
  );

  const first = await request('/api/queues/me', { token: tokens.p1 });
  assert.equal(first.body.queue.entry.position, 1);

  const idle = await request('/api/queues/me', { token: tokens.p3 });
  assert.equal(idle.status, 200);
  assert.equal(idle.body.queue.active, false);
  assert.equal(idle.body.queue.entry, null);
});

test('doctor queue snapshot exposes heap, FIFO and complexity data', async () => {
  const response = await request('/api/doctor/queue', { token: tokens.doctorA });

  assert.equal(response.status, 200);
  const queue = response.body.queue;

  assert.equal(queue.doctor.name, 'Dr. Queue A');
  assert.equal(queue.current, null);
  assert.deepEqual(
    queue.waiting.map((entry) => entry.tokenNumber),
    [1, 2],
  );
  assert.deepEqual(
    queue.waiting.map((entry) => entry.position),
    [1, 2],
  );
  assert.equal(queue.dsa.size, 2);
  assert.equal(queue.dsa.isEmpty, false);
  assert.deepEqual(
    queue.dsa.fifoOrder.map((entry) => entry.tokenNumber),
    [1, 2],
  );
  assert.ok(queue.dsa.heapArray.length === 2);
  assert.ok(queue.dsa.complexities.length >= 5);
  assert.ok(queue.dsa.operations.some((operation) => operation.type === 'insert'));

  const doctorB = await request('/api/doctor/queue', { token: tokens.doctorB });
  assert.equal(doctorB.status, 200);
  assert.equal(doctorB.body.queue.waiting.length, 0);
  assert.equal(doctorB.body.queue.dsa.isEmpty, true);
});

test('emergency patients jump ahead of normal waiting patients', async () => {
  const invalid = await request('/api/doctor/queue/emergency', {
    method: 'POST',
    token: tokens.doctorA,
    body: { patientId: 'missing-patient' },
  });
  assert.equal(invalid.status, 400);
  assert.ok(invalid.body.error.details.patientId);

  const emergency = await request('/api/doctor/queue/emergency', {
    method: 'POST',
    token: tokens.doctorA,
    body: { patientId: ids.patients.p4, reason: 'Severe chest pain' },
  });

  assert.equal(emergency.status, 201);
  assert.equal(emergency.body.entry.tokenNumber, 3);
  assert.equal(emergency.body.entry.priority, 0);
  assert.equal(emergency.body.entry.priorityLabel, 'Emergency');
  assert.deepEqual(
    emergency.body.queue.waiting.map((entry) => entry.tokenNumber),
    [3, 1, 2],
  );

  queueEntries.p4 = emergency.body.entry.id;

  const stored = await prisma.appointment.findFirst({
    where: { patientId: ids.patients.p4, doctorId: ids.doctorAId },
    select: { isEmergency: true, slotTime: true, slotKey: true, status: true },
  });
  assert.deepEqual(stored, {
    isEmergency: true,
    slotTime: null,
    slotKey: null,
    status: 'CHECKED_IN',
  });

  const duplicate = await request('/api/doctor/queue/emergency', {
    method: 'POST',
    token: tokens.doctorA,
    body: { patientId: ids.patients.p4, reason: 'Again' },
  });
  assert.equal(duplicate.status, 409);

  const patientView = await request('/api/queues/me', { token: tokens.p4 });
  assert.equal(patientView.body.queue.entry.position, 1);
  assert.equal(patientView.body.queue.entry.priorityLabel, 'Emergency');

  const updateNotification = await prisma.notification.findFirst({
    where: {
      userId: (await prisma.patient.findUnique({
        where: { id: ids.patients.p1 },
        select: { userId: true },
      })).userId,
      title: 'Queue updated',
    },
  });
  assert.ok(updateNotification);
});

test('call-next serves the emergency first and blocks a second call', async () => {
  const response = await request('/api/doctor/queue/call-next', {
    method: 'POST',
    token: tokens.doctorA,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.entry.tokenNumber, 3);
  assert.equal(response.body.entry.status, 'CALLED');
  assert.equal(response.body.queue.current.tokenNumber, 3);
  assert.equal(response.body.queue.current.status, 'CALLED');
  assert.deepEqual(
    response.body.queue.waiting.map((entry) => entry.tokenNumber),
    [1, 2],
  );

  queueEntries.p4 = response.body.entry.id;

  const secondCall = await request('/api/doctor/queue/call-next', {
    method: 'POST',
    token: tokens.doctorA,
  });
  assert.equal(secondCall.status, 409);

  const doctorB = await request('/api/doctor/queue/call-next', {
    method: 'POST',
    token: tokens.doctorB,
  });
  assert.equal(doctorB.status, 409);
  assert.match(doctorB.body.error.message, /no patients are waiting/i);

  const stored = await prisma.appointment.findUnique({
    where: { id: (await prisma.queueEntry.findUnique({
      where: { id: queueEntries.p4 },
      select: { appointmentId: true },
    })).appointmentId },
    select: { status: true },
  });
  assert.equal(stored.status, 'CALLED');
});

test('start and complete transition the current consultation', async () => {
  const started = await request('/api/doctor/queue/start', {
    method: 'POST',
    token: tokens.doctorA,
  });

  assert.equal(started.status, 200);
  assert.equal(started.body.queue.current.status, 'IN_CONSULTATION');
  assert.equal(started.body.queue.current.tokenNumber, 3);

  const startAgain = await request('/api/doctor/queue/start', {
    method: 'POST',
    token: tokens.doctorA,
  });
  assert.equal(startAgain.status, 409);

  const completed = await request('/api/doctor/queue/complete', {
    method: 'POST',
    token: tokens.doctorA,
  });

  assert.equal(completed.status, 200);
  assert.equal(completed.body.entry.status, 'COMPLETED');
  assert.equal(completed.body.queue.current, null);
  assert.deepEqual(
    completed.body.queue.waiting.map((entry) => entry.tokenNumber),
    [1, 2],
  );
  assert.equal(completed.body.queue.completedToday, 1);

  const completeAgain = await request('/api/doctor/queue/complete', {
    method: 'POST',
    token: tokens.doctorA,
  });
  assert.equal(completeAgain.status, 409);
});

test('normal patients are called in token order; waiting cancellation frees the queue', async () => {
  const callFirst = await request('/api/doctor/queue/call-next', {
    method: 'POST',
    token: tokens.doctorA,
  });
  assert.equal(callFirst.status, 200);
  assert.equal(callFirst.body.entry.tokenNumber, 1);

  const start = await request('/api/doctor/queue/start', {
    method: 'POST',
    token: tokens.doctorA,
  });
  assert.equal(start.status, 200);

  const complete = await request('/api/doctor/queue/complete', {
    method: 'POST',
    token: tokens.doctorA,
  });
  assert.equal(complete.status, 200);

  // p2 is checked in and waiting; cancelling is allowed and removes the entry.
  const cancelWaiting = await request(`/api/appointments/${appointments.p2.id}/cancel`, {
    method: 'PATCH',
    token: tokens.p2,
  });
  assert.equal(cancelWaiting.status, 200);
  assert.equal(cancelWaiting.body.appointment.status, 'CANCELLED');

  const cancelledEntry = await prisma.queueEntry.findUnique({
    where: { id: queueEntries.p2 },
    select: { status: true },
  });
  assert.equal(cancelledEntry.status, 'CANCELLED');

  const queueAfterCancel = await request('/api/doctor/queue', { token: tokens.doctorA });
  assert.equal(queueAfterCancel.body.queue.waiting.length, 0);

  // Tokens are never reused: the next check-in gets token 4, not 2.
  const third = await request(`/api/appointments/${appointments.p3.id}/check-in`, {
    method: 'POST',
    token: tokens.p3,
  });
  assert.equal(third.status, 201);
  assert.equal(third.body.queueEntry.tokenNumber, 4);
  queueEntries.p3 = third.body.queueEntry.id;

  const callThird = await request('/api/doctor/queue/call-next', {
    method: 'POST',
    token: tokens.doctorA,
  });
  assert.equal(callThird.status, 200);
  assert.equal(callThird.body.entry.tokenNumber, 4);

  // A called patient can no longer cancel.
  const cancelCalled = await request(`/api/appointments/${appointments.p3.id}/cancel`, {
    method: 'PATCH',
    token: tokens.p3,
  });
  assert.equal(cancelCalled.status, 409);

  // The doctor can mark the current called patient as a no-show.
  const noShowCurrent = await request(`/api/doctor/queue/${queueEntries.p3}/no-show`, {
    method: 'POST',
    token: tokens.doctorA,
  });
  assert.equal(noShowCurrent.status, 200);
  assert.equal(noShowCurrent.body.entry.status, 'NO_SHOW');
  assert.equal(noShowCurrent.body.queue.current, null);

  const stored = await prisma.appointment.findUnique({
    where: { id: appointments.p3.id },
    select: { status: true, noShowAt: true },
  });
  assert.equal(stored.status, 'NO_SHOW');
  assert.ok(stored.noShowAt);
});

test('no-show removes a waiting patient and unknown entries return 404', async () => {
  const checkedIn = await request(`/api/appointments/${appointments.p6.id}/check-in`, {
    method: 'POST',
    token: tokens.p6,
  });
  assert.equal(checkedIn.status, 201);
  assert.equal(checkedIn.body.queueEntry.tokenNumber, 5);
  queueEntries.p6 = checkedIn.body.queueEntry.id;

  const noShow = await request(`/api/doctor/queue/${queueEntries.p6}/no-show`, {
    method: 'POST',
    token: tokens.doctorA,
  });
  assert.equal(noShow.status, 200);
  assert.equal(noShow.body.queue.waiting.length, 0);

  const missing = await request('/api/doctor/queue/does-not-exist/no-show', {
    method: 'POST',
    token: tokens.doctorA,
  });
  assert.equal(missing.status, 404);
});

test('delay reporting changes estimates and clearing resets them', async () => {
  const checkedIn = await request(`/api/appointments/${appointments.p7.id}/check-in`, {
    method: 'POST',
    token: tokens.p7,
  });
  assert.equal(checkedIn.status, 201);
  assert.equal(checkedIn.body.queueEntry.tokenNumber, 6);
  queueEntries.p7 = checkedIn.body.queueEntry.id;

  const invalid = await request('/api/doctor/delay', {
    method: 'POST',
    token: tokens.doctorA,
    body: { delayMinutes: 20 },
  });
  assert.equal(invalid.status, 400);
  assert.ok(invalid.body.error.details.reason);

  const reported = await request('/api/doctor/delay', {
    method: 'POST',
    token: tokens.doctorA,
    body: { delayMinutes: 20, reason: 'Emergency surgery' },
  });

  assert.equal(reported.status, 200);
  assert.equal(reported.body.delay.minutes, 20);
  assert.equal(reported.body.queue.delay.minutes, 20);
  assert.ok(reported.body.queue.waiting[0].estimatedWaitMinutes >= 20);

  const patientView = await request('/api/queues/me', { token: tokens.p7 });
  assert.equal(patientView.body.queue.delay.minutes, 20);
  assert.ok(patientView.body.queue.entry.estimatedWaitMinutes >= 20);

  const cleared = await request('/api/doctor/delay/clear', {
    method: 'POST',
    token: tokens.doctorA,
  });

  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.delay.minutes, 0);
  assert.equal(cleared.body.queue.delay.minutes, 0);
});

test('rebuilding from SQLite preserves waiting and current patients', async () => {
  const rebuilt = await rebuildQueues();
  assert.equal(rebuilt.date, dates.todayDateString());
  assert.ok(rebuilt.activeEntries >= 1);

  const waiting = await request('/api/doctor/queue', { token: tokens.doctorA });
  assert.equal(waiting.status, 200);
  assert.deepEqual(
    waiting.body.queue.waiting.map((entry) => entry.tokenNumber),
    [6],
  );
  assert.equal(waiting.body.queue.dsa.fifoOrder[0].tokenNumber, 6);

  const called = await request('/api/doctor/queue/call-next', {
    method: 'POST',
    token: tokens.doctorA,
  });
  assert.equal(called.status, 200);
  assert.equal(called.body.entry.tokenNumber, 6);

  // Rebuild again while a patient is called: the current patient must survive.
  await rebuildQueues();

  const afterCurrentRebuild = await request('/api/doctor/queue', { token: tokens.doctorA });
  assert.equal(afterCurrentRebuild.body.queue.current.tokenNumber, 6);
  assert.equal(afterCurrentRebuild.body.queue.current.status, 'CALLED');
  assert.equal(afterCurrentRebuild.body.queue.waiting.length, 0);

  const start = await request('/api/doctor/queue/start', {
    method: 'POST',
    token: tokens.doctorA,
  });
  assert.equal(start.status, 200);

  const complete = await request('/api/doctor/queue/complete', {
    method: 'POST',
    token: tokens.doctorA,
  });
  assert.equal(complete.status, 200);
});

test('doctor queues are isolated and cross-doctor actions are rejected', async () => {
  const checkedIn = await request(`/api/appointments/${appointments.p8.id}/check-in`, {
    method: 'POST',
    token: tokens.p8,
  });
  assert.equal(checkedIn.status, 201);
  assert.equal(checkedIn.body.queueEntry.tokenNumber, 1);

  const doctorBQueue = await request('/api/doctor/queue', { token: tokens.doctorB });
  assert.equal(doctorBQueue.status, 200);
  assert.deepEqual(
    doctorBQueue.body.queue.waiting.map((entry) => entry.tokenNumber),
    [1],
  );

  const doctorAQueue = await request('/api/doctor/queue', { token: tokens.doctorA });
  assert.equal(doctorAQueue.body.queue.waiting.length, 0);
  assert.equal(doctorAQueue.body.queue.current, null);

  // Doctor A cannot mark Doctor B's queue entry as a no-show.
  const crossDoctor = await request(
    `/api/doctor/queue/${checkedIn.body.queueEntry.id}/no-show`,
    { method: 'POST', token: tokens.doctorA },
  );
  assert.equal(crossDoctor.status, 404);

  const ownNoShow = await request(
    `/api/doctor/queue/${checkedIn.body.queueEntry.id}/no-show`,
    { method: 'POST', token: tokens.doctorB },
  );
  assert.equal(ownNoShow.status, 200);
});
