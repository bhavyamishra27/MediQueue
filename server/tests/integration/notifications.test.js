/**
 * Phase 6 notification integration tests.
 * Runs against an isolated SQLite file (`test-notifications.db`) and never
 * touches the development database.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const prismaCli = path.join(serverRoot, 'node_modules', 'prisma', 'build', 'index.js');
const testDbBase = path.join(serverRoot, 'prisma', 'test-notifications.db');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file:./test-notifications.db';
process.env.JWT_SECRET = 'phase-6-integration-test-secret-not-used-in-production';
process.env.JWT_EXPIRES_IN = '1h';
process.env.DEMO_PASSWORD = 'DemoPassword123';

const DEMO_PASSWORD = process.env.DEMO_PASSWORD;

let server;
let baseUrl;
let prisma;
let bcrypt;
let dates;
let ids;
let tokens;

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

  const [{ app }, { prisma: prismaClient, configureDatabase }, bcryptModule, datesModule] =
    await Promise.all([
      import('../../src/app.js'),
      import('../../src/config/prisma.js'),
      import('bcryptjs'),
      import('../../src/utils/dates.js'),
    ]);

  prisma = prismaClient;
  bcrypt = bcryptModule.default;
  dates = datesModule;

  await configureDatabase();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const hospital = await prisma.hospital.create({
    data: {
      name: 'Notification Test Hospital',
      address: '1 Inbox Road',
      city: 'Pune',
      phone: '+91 20 5555 5555',
      email: 'inbox@test.local',
    },
  });

  const doctorUser = await prisma.user.create({
    data: { email: 'notification.doctor@test.local', passwordHash, name: 'Dr. Inbox', role: 'DOCTOR' },
  });

  const doctor = await prisma.doctor.create({
    data: {
      userId: doctorUser.id,
      hospitalId: hospital.id,
      specialization: 'General Medicine',
      roomNumber: 'N-1',
      avgConsultationMinutes: 10,
    },
  });

  const patientUser = await prisma.user.create({
    data: { email: 'notification.patient@test.local', passwordHash, name: 'Nina Patient', role: 'PATIENT' },
  });
  const patient = await prisma.patient.create({ data: { userId: patientUser.id } });

  const otherUser = await prisma.user.create({
    data: { email: 'notification.other@test.local', passwordHash, name: 'Omar Other', role: 'PATIENT' },
  });
  const otherPatient = await prisma.patient.create({ data: { userId: otherUser.id } });

  const appointment = await prisma.appointment.create({
    data: {
      patientId: patient.id,
      doctorId: doctor.id,
      date: dates.todayDateString(),
      slotTime: '10:00',
      slotKey: `${doctor.id}|${dates.todayDateString()}|10:00`,
      status: 'BOOKED',
    },
  });

  await prisma.notification.createMany({
    data: [
      {
        userId: patientUser.id,
        title: 'Older notice',
        message: 'This notice is older.',
        type: 'SYSTEM',
        isRead: true,
        createdAt: new Date(Date.now() - 60 * 60 * 1000),
      },
      {
        userId: patientUser.id,
        title: 'Newer notice',
        message: 'This notice is newer.',
        type: 'APPOINTMENT',
        isRead: false,
        createdAt: new Date(Date.now() - 60 * 1000),
      },
      {
        userId: otherUser.id,
        title: 'Someone else',
        message: 'This belongs to another patient.',
        type: 'SYSTEM',
        isRead: false,
      },
    ],
  });

  const main = await listen(app);
  server = main.httpServer;
  baseUrl = main.url;

  ids = {
    patientUserId: patientUser.id,
    otherUserId: otherUser.id,
    appointmentId: appointment.id,
  };

  tokens = {
    patient: await login('notification.patient@test.local'),
    other: await login('notification.other@test.local'),
  };

  // Silence unused warnings while keeping the ids handy for assertions.
  void otherPatient;
});

after(async () => {
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));

  if (prisma) {
    await prisma.$disconnect();
  }

  removeTestDatabase();
});

test('notification endpoints require authentication', async () => {
  const response = await request('/api/notifications');
  assert.equal(response.status, 401);
});

test('a patient only sees their own notifications, newest first', async () => {
  const response = await request('/api/notifications', { token: tokens.patient });
  assert.equal(response.status, 200);
  assert.equal(response.body.unreadCount, 1);

  const titles = response.body.notifications.map((notification) => notification.title);
  assert.deepEqual(titles, ['Newer notice', 'Older notice']);

  const titlesOfOther = (await request('/api/notifications', { token: tokens.other })).body
    .notifications.map((notification) => notification.title);
  assert.deepEqual(titlesOfOther, ['Someone else']);
});

test('notification payloads expose only the safe fields', async () => {
  const response = await request('/api/notifications', { token: tokens.patient });
  const [newest] = response.body.notifications;

  assert.deepEqual(Object.keys(newest).sort(), [
    'appointmentId',
    'createdAt',
    'id',
    'isRead',
    'message',
    'title',
    'type',
  ]);
  assert.equal(newest.userId, undefined);
});

test('marking a notification read is scoped to its owner', async () => {
  const inbox = await request('/api/notifications', { token: tokens.patient });
  const unread = inbox.body.notifications.find((notification) => !notification.isRead);

  const forbidden = await request(`/api/notifications/${unread.id}/read`, {
    method: 'PATCH',
    token: tokens.other,
  });
  assert.equal(forbidden.status, 404);

  const marked = await request(`/api/notifications/${unread.id}/read`, {
    method: 'PATCH',
    token: tokens.patient,
  });
  assert.equal(marked.status, 200);
  assert.equal(marked.body.unreadCount, 0);

  const refreshed = await request('/api/notifications', { token: tokens.patient });
  assert.equal(refreshed.body.unreadCount, 0);
  assert.ok(refreshed.body.notifications.every((notification) => notification.isRead));
});

test('marking an unknown notification returns 404', async () => {
  const response = await request('/api/notifications/does-not-exist/read', {
    method: 'PATCH',
    token: tokens.patient,
  });
  assert.equal(response.status, 404);
});

test('read-all only touches the signed-in user', async () => {
  await prisma.notification.createMany({
    data: [
      { userId: ids.patientUserId, title: 'Bulk one', message: 'One', type: 'QUEUE' },
      { userId: ids.patientUserId, title: 'Bulk two', message: 'Two', type: 'QUEUE' },
    ],
  });

  const before = await request('/api/notifications', { token: tokens.patient });
  assert.equal(before.body.unreadCount, 2);

  const cleared = await request('/api/notifications/read-all', {
    method: 'POST',
    token: tokens.patient,
  });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.updated, 2);
  assert.equal(cleared.body.unreadCount, 0);

  const otherInbox = await request('/api/notifications', { token: tokens.other });
  assert.equal(otherInbox.body.unreadCount, 1, 'the other patient is untouched');
});

test('check-in writes a queue notification for the patient', async () => {
  const checkedIn = await request(`/api/appointments/${ids.appointmentId}/check-in`, {
    method: 'POST',
    token: tokens.patient,
  });
  assert.equal(checkedIn.status, 201);
  assert.equal(checkedIn.body.queueEntry.tokenNumber, 1);

  const inbox = await request('/api/notifications', { token: tokens.patient });
  const checkInNotice = inbox.body.notifications.find(
    (notification) => notification.title === 'Checked in',
  );

  assert.ok(checkInNotice, 'check-in notification exists');
  assert.equal(checkInNotice.type, 'QUEUE');
  assert.equal(checkInNotice.isRead, false);
  assert.match(checkInNotice.message, /#1/);
  assert.equal(checkInNotice.appointmentId, ids.appointmentId);
  assert.ok(inbox.body.unreadCount >= 1);
});
