/**
 * Phase 9 Socket.IO integration tests.
 *
 * Runs against an isolated SQLite file, starts a real HTTP + Socket.IO server on
 * an ephemeral port, and drives the public REST API to trigger events. Verifies
 * handshake authentication, fixed room membership, room isolation, payload
 * shape and reconnect rejoin behaviour.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import { io as ioClient } from 'socket.io-client';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const prismaCli = path.join(serverRoot, 'node_modules', 'prisma', 'build', 'index.js');
const testDbBase = path.join(serverRoot, 'prisma', 'test-socket.db');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file:./test-socket.db';
process.env.JWT_SECRET = 'phase-9-socket-integration-test-secret';
process.env.JWT_EXPIRES_IN = '1h';
process.env.DEMO_PASSWORD = 'DemoPassword123';

const DEMO_PASSWORD = process.env.DEMO_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET;

let httpServer;
let ioServer;
let baseUrl;
let prisma;
let bcrypt;
let dates;
let rebuildQueues;

let ids;
let tokens;
let appointments;

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
  const server = http.createServer(app);
  ioServer = initSocketModule.initSocketServer(server);

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const { port } = server.address();
  return { server, url: `http://127.0.0.1:${port}` };
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

async function login(email) {
  const response = await request('/api/auth/login', {
    method: 'POST',
    body: { email, password: DEMO_PASSWORD },
  });
  assert.equal(response.status, 200, `login failed for ${email}`);
  return response.body.token;
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = ioClient(baseUrl, {
      path: '/socket.io',
      auth: token === undefined ? {} : { token },
      transports: ['websocket'],
      reconnection: false,
      autoConnect: false,
      timeout: 3000,
    });

    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('socket connect timed out'));
    }, 4000);

    socket.once('realtime:ready', (payload) => {
      clearTimeout(timer);
      resolve({ socket, payload });
    });

    socket.once('connect_error', (error) => {
      clearTimeout(timer);
      socket.close();
      reject(error);
    });

    socket.connect();
  });
}

function connectExpectingRejection(token) {
  return new Promise((resolve) => {
    const socket = ioClient(baseUrl, {
      path: '/socket.io',
      auth: token === undefined ? {} : { token },
      transports: ['websocket'],
      reconnection: false,
      autoConnect: false,
      timeout: 3000,
    });

    const timer = setTimeout(() => {
      socket.close();
      resolve(null);
    }, 4000);

    socket.once('connect_error', (error) => {
      clearTimeout(timer);
      socket.close();
      resolve(error);
    });

    socket.once('connect', () => {
      clearTimeout(timer);
      socket.close();
      resolve(null);
    });

    socket.connect();
  });
}

function waitForEvent(socket, event, predicate = () => true, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);

    function handler(payload) {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    }

    socket.on(event, handler);
  });
}

function expectNoEvent(socket, event, timeoutMs = 500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      resolve();
    }, timeoutMs);

    function handler() {
      clearTimeout(timer);
      socket.off(event, handler);
      reject(new Error(`Unexpected ${event} event`));
    }

    socket.on(event, handler);
  });
}

function closeSocket(socket) {
  if (socket && socket.connected) socket.disconnect();
}

let initSocketModule;

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
    socketModule,
  ] = await Promise.all([
    import('../../src/app.js'),
    import('../../src/config/prisma.js'),
    import('bcryptjs'),
    import('../../src/utils/dates.js'),
    import('../../src/services/queue.service.js'),
    import('../../src/realtime/socket.js'),
  ]);

  prisma = prismaClient;
  bcrypt = bcryptModule.default;
  dates = datesModule;
  rebuildQueues = queueServiceModule.rebuildQueues;
  initSocketModule = socketModule;

  await configureDatabase();
  ({ server: httpServer, url: baseUrl } = await listen(app));

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const today = dates.todayDateString();

  const hospital1 = await prisma.hospital.create({
    data: {
      name: 'Socket Test Hospital',
      address: '1 Realtime Road',
      city: 'Socket City',
      phone: '555-0101',
    },
  });

  const hospital2 = await prisma.hospital.create({
    data: {
      name: 'Other Socket Hospital',
      address: '2 Isolated Road',
      city: 'Socket City',
      phone: '555-0102',
    },
  });

  const admin1 = await prisma.user.create({
    data: {
      email: 'socket.admin1@example.com',
      passwordHash,
      name: 'Socket Admin One',
      role: 'HOSPITAL_ADMIN',
      administeredHospital: { connect: { id: hospital1.id } },
    },
  });

  const admin2 = await prisma.user.create({
    data: {
      email: 'socket.admin2@example.com',
      passwordHash,
      name: 'Socket Admin Two',
      role: 'HOSPITAL_ADMIN',
      administeredHospital: { connect: { id: hospital2.id } },
    },
  });

  await prisma.user.create({
    data: {
      email: 'socket.platform@example.com',
      passwordHash,
      name: 'Socket Platform',
      role: 'PLATFORM_ADMIN',
    },
  });

  const doctorUser = await prisma.user.create({
    data: {
      email: 'socket.doctor@example.com',
      passwordHash,
      name: 'Dr. Socket',
      role: 'DOCTOR',
      doctor: {
        create: {
          hospitalId: hospital1.id,
          specialization: 'Emergency Medicine',
          avgConsultationMinutes: 15,
          roomNumber: '101',
        },
      },
    },
    include: { doctor: true },
  });

  const patientUsers = [];
  for (const [index, name] of ['Socket Patient One', 'Socket Patient Two', 'Socket Patient Three'].entries()) {
    const user = await prisma.user.create({
      data: {
        email: `socket.patient${index + 1}@example.com`,
        passwordHash,
        name,
        role: 'PATIENT',
        patient: {
          create: {
            dateOfBirth: '1990-01-01',
            gender: 'Other',
          },
        },
      },
      include: { patient: true },
    });
    patientUsers.push(user);
  }

  const [p1, p2, p3] = patientUsers;

  const [a1, a2, a3] = await Promise.all([
    prisma.appointment.create({
      data: {
        patientId: p1.patient.id,
        doctorId: doctorUser.doctor.id,
        date: today,
        slotTime: '09:00',
        slotKey: `${doctorUser.doctor.id}|${today}|09:00`,
        status: 'BOOKED',
      },
    }),
    prisma.appointment.create({
      data: {
        patientId: p2.patient.id,
        doctorId: doctorUser.doctor.id,
        date: today,
        slotTime: '09:15',
        slotKey: `${doctorUser.doctor.id}|${today}|09:15`,
        status: 'BOOKED',
      },
    }),
    prisma.appointment.create({
      data: {
        patientId: p3.patient.id,
        doctorId: doctorUser.doctor.id,
        date: today,
        slotTime: '09:30',
        slotKey: `${doctorUser.doctor.id}|${today}|09:30`,
        status: 'BOOKED',
      },
    }),
  ]);

  await rebuildQueues();

  ids = {
    hospital1Id: hospital1.id,
    hospital2Id: hospital2.id,
    admin1UserId: admin1.id,
    admin2UserId: admin2.id,
    doctorId: doctorUser.doctor.id,
    doctorUserId: doctorUser.id,
    p1: { userId: p1.id, patientId: p1.patient.id },
    p2: { userId: p2.id, patientId: p2.patient.id },
    p3: { userId: p3.id, patientId: p3.patient.id },
  };

  appointments = { a1: a1.id, a2: a2.id, a3: a3.id };

  tokens = {
    admin1: await login('socket.admin1@example.com'),
    admin2: await login('socket.admin2@example.com'),
    doctor: await login('socket.doctor@example.com'),
    platform: await login('socket.platform@example.com'),
    p1: await login('socket.patient1@example.com'),
    p2: await login('socket.patient2@example.com'),
    p3: await login('socket.patient3@example.com'),
  };
});

after(async () => {
  if (ioServer) {
    await new Promise((resolve) => ioServer.close(resolve));
  }
  if (httpServer?.listening) {
    await new Promise((resolve) => httpServer.close(resolve));
  }
  if (prisma) await prisma.$disconnect();
  removeTestDatabase();
});

test('handshake rejects missing, invalid and expired tokens', async () => {
  const missing = await connectExpectingRejection(undefined);
  assert.ok(missing, 'missing token should be rejected');
  assert.equal(missing.message, 'Authentication required.');

  const invalid = await connectExpectingRejection('not-a-real-token');
  assert.ok(invalid, 'invalid token should be rejected');
  assert.equal(invalid.message, 'Invalid authentication token.');

  const expiredToken = jwt.sign(
    { sub: ids.p1.userId, role: 'PATIENT' },
    JWT_SECRET,
    { expiresIn: -10 },
  );
  const expired = await connectExpectingRejection(expiredToken);
  assert.ok(expired, 'expired token should be rejected');
  assert.equal(expired.message, 'Your session has expired. Please sign in again.');
});

test('authenticated users join only their own fixed rooms', async () => {
  const patient = await connect(tokens.p1);
  const doctor = await connect(tokens.doctor);
  const admin = await connect(tokens.admin1);
  const platform = await connect(tokens.platform);

  assert.deepEqual(patient.payload.rooms, [
    `user:${ids.p1.userId}`,
    `patient:${ids.p1.userId}`,
  ]);
  assert.equal(patient.payload.role, 'PATIENT');

  assert.deepEqual(doctor.payload.rooms, [
    `user:${ids.doctorUserId}`,
    `doctor:${ids.doctorId}`,
  ]);

  assert.deepEqual(admin.payload.rooms, [
    `user:${ids.admin1UserId}`,
    `hospital:${ids.hospital1Id}`,
  ]);

  assert.deepEqual(platform.payload.rooms, [
    'user:' + platform.payload.rooms[0].split(':')[1],
    'platform:admins',
  ]);
  assert.equal(platform.payload.role, 'PLATFORM_ADMIN');

  // A patient must never be placed in a staff or hospital room.
  assert.ok(!patient.payload.rooms.some((room) => room.startsWith('doctor:')));
  assert.ok(!patient.payload.rooms.some((room) => room.startsWith('hospital:')));

  closeSocket(patient.socket);
  closeSocket(doctor.socket);
  closeSocket(admin.socket);
  closeSocket(platform.socket);
});

test('check-in emits queue position and notification to the patient and queue updates to staff', async () => {
  const patient = await connect(tokens.p1);
  const doctor = await connect(tokens.doctor);
  const admin = await connect(tokens.admin1);
  const otherAdmin = await connect(tokens.admin2);

  const positionPromise = waitForEvent(
    patient.socket,
    'queue:position',
    (payload) => payload.tokenNumber === 1,
  );
  const notificationPromise = waitForEvent(
    patient.socket,
    'notification:new',
    (payload) => payload.title === 'Checked in',
  );
  const appointmentSignalPromise = waitForEvent(patient.socket, 'appointments:updated');
  const doctorQueuePromise = waitForEvent(
    doctor.socket,
    'queue:updated',
    (payload) => payload.waiting?.some((entry) => entry.tokenNumber === 1),
  );
  const adminQueuePromise = waitForEvent(
    admin.socket,
    'queue:updated',
    (payload) => payload.waiting?.some((entry) => entry.tokenNumber === 1),
  );
  const isolatedAdmin = expectNoEvent(otherAdmin.socket, 'queue:updated');

  const response = await request(`/api/appointments/${appointments.a1}/check-in`, {
    method: 'POST',
    token: tokens.p1,
  });
  assert.equal(response.status, 201);
  assert.equal(response.body.queueEntry.tokenNumber, 1);

  const position = await positionPromise;
  assert.equal(position.tokenNumber, 1);
  assert.equal(position.position, 1);
  assert.equal(position.currentTokenNumber, null);
  assert.equal(position.doctor.name, 'Dr. Socket');
  assert.equal(position.doctor.roomNumber, '101');

  const notification = await notificationPromise;
  assert.deepEqual(Object.keys(notification).sort(), [
    'appointmentId',
    'createdAt',
    'id',
    'isRead',
    'message',
    'title',
    'type',
  ]);
  assert.equal(notification.type, 'QUEUE');

  const appointmentSignal = await appointmentSignalPromise;
  assert.equal(appointmentSignal.doctorId, ids.doctorId);

  const doctorQueue = await doctorQueuePromise;
  assert.equal(doctorQueue.waiting[0].tokenNumber, 1);
  assert.equal(doctorQueue.waiting[0].patientName, 'Socket Patient One');
  assert.ok(Array.isArray(doctorQueue.dsa.heapArray));
  assert.ok(Array.isArray(doctorQueue.dsa.fifoOrder));
  assert.equal(doctorQueue.dsa.size, 1);

  const adminQueue = await adminQueuePromise;
  assert.equal(adminQueue.waiting[0].tokenNumber, 1);

  await isolatedAdmin;

  closeSocket(patient.socket);
  closeSocket(doctor.socket);
  closeSocket(admin.socket);
  closeSocket(otherAdmin.socket);
});

test('call-next notifies the called patient and staff without leaking to other patients', async () => {
  const p1 = await connect(tokens.p1);
  const p2 = await connect(tokens.p2);
  const doctor = await connect(tokens.doctor);
  const admin = await connect(tokens.admin1);

  const checkIn = await request(`/api/appointments/${appointments.a2}/check-in`, {
    method: 'POST',
    token: tokens.p2,
  });
  assert.equal(checkIn.status, 201);
  assert.equal(checkIn.body.queueEntry.tokenNumber, 2);

  const calledPromise = waitForEvent(p1.socket, 'patient:called');
  const notificationPromise = waitForEvent(
    p1.socket,
    'notification:new',
    (payload) => payload.title === "It's your turn",
  );
  const doctorQueuePromise = waitForEvent(
    doctor.socket,
    'queue:updated',
    (payload) => payload.current?.tokenNumber === 1,
  );
  const adminQueuePromise = waitForEvent(
    admin.socket,
    'queue:updated',
    (payload) => payload.current?.tokenNumber === 1,
  );
  const otherPatient = expectNoEvent(p2.socket, 'patient:called');

  const response = await request('/api/doctor/queue/call-next', {
    method: 'POST',
    token: tokens.doctor,
  });
  assert.equal(response.status, 200);

  const called = await calledPromise;
  assert.equal(called.tokenNumber, 1);
  assert.equal(called.roomNumber, '101');
  assert.equal(called.doctorName, 'Dr. Socket');

  const notification = await notificationPromise;
  assert.equal(notification.type, 'QUEUE');

  const doctorQueue = await doctorQueuePromise;
  assert.equal(doctorQueue.current.tokenNumber, 1);
  assert.equal(doctorQueue.waiting[0].tokenNumber, 2);

  const adminQueue = await adminQueuePromise;
  assert.equal(adminQueue.current.tokenNumber, 1);

  await otherPatient;

  closeSocket(p1.socket);
  closeSocket(p2.socket);
  closeSocket(doctor.socket);
  closeSocket(admin.socket);
});

test('adding an emergency broadcasts the jump to the doctor, hospital and waiting patients', async () => {
  const p2 = await connect(tokens.p2);
  const p3 = await connect(tokens.p3);
  const doctor = await connect(tokens.doctor);
  const admin = await connect(tokens.admin1);
  const otherAdmin = await connect(tokens.admin2);

  const doctorEmergencyPromise = waitForEvent(
    doctor.socket,
    'queue:emergency',
    (payload) => payload.entry?.priority === 0,
  );
  const adminEmergencyPromise = waitForEvent(
    admin.socket,
    'queue:emergency',
    (payload) => payload.entry?.priority === 0,
  );
  const p2PositionPromise = waitForEvent(
    p2.socket,
    'queue:position',
    (payload) => payload.position === 2,
  );
  const p3PositionPromise = waitForEvent(
    p3.socket,
    'queue:position',
    (payload) => payload.position === 1,
  );
  const p3NotificationPromise = waitForEvent(
    p3.socket,
    'notification:new',
    (payload) => payload.type === 'EMERGENCY',
  );
  const isolatedAdmin = expectNoEvent(otherAdmin.socket, 'queue:emergency');
  const patientNoEmergency = expectNoEvent(p2.socket, 'queue:emergency');

  const response = await request('/api/doctor/queue/emergency', {
    method: 'POST',
    token: tokens.doctor,
    body: { patientId: ids.p3.patientId, reason: 'Chest pain' },
  });
  assert.equal(response.status, 201);
  assert.equal(response.body.entry.priority, 0);
  assert.equal(response.body.entry.tokenNumber, 3);

  const doctorEmergency = await doctorEmergencyPromise;
  assert.equal(doctorEmergency.entry.tokenNumber, 3);
  assert.equal(doctorEmergency.queue.waiting[0].tokenNumber, 3);
  assert.equal(doctorEmergency.queue.waiting[0].priority, 0);
  assert.equal(doctorEmergency.queue.waiting[1].tokenNumber, 2);

  const adminEmergency = await adminEmergencyPromise;
  assert.equal(adminEmergency.entry.tokenNumber, 3);

  const p2Position = await p2PositionPromise;
  assert.equal(p2Position.tokenNumber, 2);
  assert.equal(p2Position.position, 2);

  const p3Position = await p3PositionPromise;
  assert.equal(p3Position.tokenNumber, 3);
  assert.equal(p3Position.position, 1);

  const p3Notification = await p3NotificationPromise;
  assert.equal(p3Notification.title, 'Emergency added to queue');

  await Promise.all([isolatedAdmin, patientNoEmergency]);

  closeSocket(p2.socket);
  closeSocket(p3.socket);
  closeSocket(doctor.socket);
  closeSocket(admin.socket);
  closeSocket(otherAdmin.socket);
});

test('delay report and clear reach every waiting patient with updated estimates', async () => {
  const p2 = await connect(tokens.p2);
  const p3 = await connect(tokens.p3);
  const doctor = await connect(tokens.doctor);
  const admin = await connect(tokens.admin1);

  const p2DelayPromise = waitForEvent(
    p2.socket,
    'doctor:delay',
    (payload) => payload.delay?.minutes === 20,
  );
  const p3DelayPromise = waitForEvent(
    p3.socket,
    'doctor:delay',
    (payload) => payload.delay?.minutes === 20,
  );
  const doctorQueuePromise = waitForEvent(
    doctor.socket,
    'queue:updated',
    (payload) => payload.delay?.minutes === 20,
  );
  const adminQueuePromise = waitForEvent(
    admin.socket,
    'queue:updated',
    (payload) => payload.delay?.minutes === 20,
  );

  const reported = await request('/api/doctor/delay', {
    method: 'POST',
    token: tokens.doctor,
    body: { delayMinutes: 20, reason: 'Emergency surgery' },
  });
  assert.equal(reported.status, 200);

  const p2Delay = await p2DelayPromise;
  assert.equal(p2Delay.delay.minutes, 20);
  assert.equal(p2Delay.delay.reason, 'Emergency surgery');
  assert.ok(p2Delay.estimatedWaitMinutes >= 20);

  const p3Delay = await p3DelayPromise;
  assert.equal(p3Delay.delay.minutes, 20);

  const doctorQueue = await doctorQueuePromise;
  assert.equal(doctorQueue.delay.minutes, 20);

  const adminQueue = await adminQueuePromise;
  assert.equal(adminQueue.delay.minutes, 20);

  const clearedP2 = waitForEvent(
    p2.socket,
    'doctor:delay',
    (payload) => payload.delay?.minutes === 0,
  );
  const clearedP3 = waitForEvent(
    p3.socket,
    'doctor:delay',
    (payload) => payload.delay?.minutes === 0,
  );

  const cleared = await request('/api/doctor/delay/clear', {
    method: 'POST',
    token: tokens.doctor,
  });
  assert.equal(cleared.status, 200);

  assert.equal((await clearedP2).delay.minutes, 0);
  assert.equal((await clearedP3).delay.minutes, 0);

  closeSocket(p2.socket);
  closeSocket(p3.socket);
  closeSocket(doctor.socket);
  closeSocket(admin.socket);
});

test('a reconnecting client rejoins its fixed rooms and keeps receiving events', async () => {
  const doctor = await connect(tokens.doctor);

  doctor.socket.disconnect();
  assert.equal(doctor.socket.connected, false);

  const readyPromise = waitForEvent(doctor.socket, 'realtime:ready');
  doctor.socket.connect();

  const ready = await readyPromise;
  assert.deepEqual(ready.rooms, [
    `user:${ids.doctorUserId}`,
    `doctor:${ids.doctorId}`,
  ]);

  const queuePromise = waitForEvent(
    doctor.socket,
    'queue:updated',
    (payload) => payload.delay?.minutes === 5,
  );

  const response = await request('/api/doctor/delay', {
    method: 'POST',
    token: tokens.doctor,
    body: { delayMinutes: 5, reason: 'Reconnect check' },
  });
  assert.equal(response.status, 200);

  const queue = await queuePromise;
  assert.equal(queue.delay.minutes, 5);

  await request('/api/doctor/delay/clear', { method: 'POST', token: tokens.doctor });
  closeSocket(doctor.socket);
});
