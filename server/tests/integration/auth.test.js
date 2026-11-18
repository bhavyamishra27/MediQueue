/**
 * Phase 2 authentication + authorization integration tests.
 *
 * These run against an isolated SQLite file (server/prisma/test-auth.db) that
 * is created and destroyed by this file. The development database is never
 * touched.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const prismaCli = path.join(serverRoot, 'node_modules', 'prisma', 'build', 'index.js');
const testDbBase = path.join(serverRoot, 'prisma', 'test-auth.db');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file:./test-auth.db';
process.env.JWT_SECRET = 'phase-2-integration-test-secret-not-used-in-production';
process.env.JWT_EXPIRES_IN = '1h';
process.env.DEMO_PASSWORD = 'DemoPassword123';

const DEMO_PASSWORD = process.env.DEMO_PASSWORD;

let server;
let roleServer;
let baseUrl;
let roleBaseUrl;
let prisma;
let bcrypt;
let jwt;
let ids;

function removeTestDatabase() {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    const file = `${testDbBase}${suffix}`;
    if (existsSync(file)) {
      try {
        rmSync(file, { force: true });
      } catch {
        // Windows may briefly keep a handle after disconnect; the next run
        // uses --force-reset anyway.
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

async function request(url, pathname, { method = 'GET', body, token } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${url}${pathname}`, {
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

before(async () => {
  assert.ok(existsSync(prismaCli), `Prisma CLI not found at ${prismaCli}`);

  removeTestDatabase();

  // Create the schema in the isolated test database. `--force-reset` makes the
  // suite idempotent even if a previous run left the file behind.
  execFileSync(
    process.execPath,
    [prismaCli, 'db', 'push', '--force-reset', '--skip-generate'],
    {
      cwd: serverRoot,
      env: process.env,
      stdio: 'pipe',
    },
  );

  const [
    { app },
    { prisma: prismaClient },
    { configureDatabase },
    bcryptModule,
    jwtModule,
    expressModule,
    { requireAuth, requireRole },
    { errorHandler },
  ] = await Promise.all([
    import('../../src/app.js'),
    import('../../src/config/prisma.js'),
    import('../../src/config/prisma.js'),
    import('bcryptjs'),
    import('jsonwebtoken'),
    import('express'),
    import('../../src/middleware/auth.js'),
    import('../../src/middleware/errorHandler.js'),
  ]);

  prisma = prismaClient;
  bcrypt = bcryptModule.default;
  jwt = jwtModule.default;

  await configureDatabase();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const platform = await prisma.user.create({
    data: {
      email: 'platform@test.local',
      passwordHash,
      name: 'Platform Test Admin',
      role: 'PLATFORM_ADMIN',
    },
  });

  const hospitalAdmin = await prisma.user.create({
    data: {
      email: 'admin@test.local',
      passwordHash,
      name: 'Hospital Test Admin',
      role: 'HOSPITAL_ADMIN',
    },
  });

  const hospital = await prisma.hospital.create({
    data: {
      name: 'Test City Hospital',
      address: '1 Test Road',
      city: 'Pune',
      phone: '+91 20 0000 0000',
      adminId: hospitalAdmin.id,
    },
  });

  const doctorUser = await prisma.user.create({
    data: {
      email: 'doctor@test.local',
      passwordHash,
      name: 'Dr. Test Doctor',
      role: 'DOCTOR',
    },
  });

  const doctor = await prisma.doctor.create({
    data: {
      userId: doctorUser.id,
      hospitalId: hospital.id,
      specialization: 'General Medicine',
      avgConsultationMinutes: 15,
    },
  });

  const patientUser = await prisma.user.create({
    data: {
      email: 'patient@test.local',
      passwordHash,
      name: 'Test Patient',
      role: 'PATIENT',
    },
  });

  const patient = await prisma.patient.create({
    data: { userId: patientUser.id, bloodGroup: 'O+' },
  });

  ids = {
    platformUserId: platform.id,
    hospitalAdminUserId: hospitalAdmin.id,
    hospitalId: hospital.id,
    doctorUserId: doctorUser.id,
    doctorId: doctor.id,
    patientUserId: patientUser.id,
    patientId: patient.id,
  };

  const main = await listen(app);
  server = main.httpServer;
  baseUrl = main.url;

  // A tiny app that exercises the real auth/role middleware on a DOCTOR-only
  // endpoint. This keeps the test independent of features built in later phases.
  const express = expressModule.default;
  const roleApp = express();
  roleApp.use(express.json());
  roleApp.get(
    '/doctor-only',
    requireAuth,
    requireRole('DOCTOR'),
    (req, res) => res.json({ ok: true, role: req.user.role }),
  );
  roleApp.use(errorHandler);

  const role = await listen(roleApp);
  roleServer = role.httpServer;
  roleBaseUrl = role.url;
});

after(async () => {
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
  await new Promise((resolve) => (roleServer ? roleServer.close(resolve) : resolve()));

  if (prisma) {
    await prisma.$disconnect();
  }

  removeTestDatabase();
});

test('health endpoint still reports a connected database', async () => {
  const response = await request(baseUrl, '/api/health');
  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'ok');
  assert.equal(response.body.database, 'connected');
});

test('every seeded role can log in and receives a safe user shape', async () => {
  const accounts = [
    { email: 'platform@test.local', role: 'PLATFORM_ADMIN' },
    { email: 'admin@test.local', role: 'HOSPITAL_ADMIN' },
    { email: 'doctor@test.local', role: 'DOCTOR' },
    { email: 'patient@test.local', role: 'PATIENT' },
  ];

  for (const account of accounts) {
    const response = await request(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: account.email, password: DEMO_PASSWORD },
    });

    assert.equal(response.status, 200, `login failed for ${account.email}`);
    assert.equal(typeof response.body.token, 'string');
    assert.ok(response.body.token.split('.').length === 3, 'token should be a JWT');
    assert.equal(response.body.user.email, account.email);
    assert.equal(response.body.user.role, account.role);
    assert.equal('passwordHash' in response.body.user, false);
    assert.equal('password' in response.body.user, false);
  }
});

test('login is case-insensitive for email addresses', async () => {
  const response = await request(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { email: '  PATIENT@TEST.LOCAL ', password: DEMO_PASSWORD },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.user.email, 'patient@test.local');
});

test('wrong password and unknown email both return the same 401 message', async () => {
  const wrongPassword = await request(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { email: 'patient@test.local', password: 'not-the-password' },
  });

  const unknownEmail = await request(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { email: 'nobody@test.local', password: DEMO_PASSWORD },
  });

  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownEmail.status, 401);
  assert.equal(wrongPassword.body.error.message, 'Invalid email or password.');
  assert.equal(unknownEmail.body.error.message, 'Invalid email or password.');
});

test('login rejects malformed input with field details', async () => {
  const response = await request(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { email: 'not-an-email', password: '' },
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.message, 'Please provide a valid email and password.');
  assert.ok(response.body.error.details.email);
  assert.ok(response.body.error.details.password);
});

test('identity scoping returns patientId, doctorId and hospitalId only where relevant', async () => {
  const logins = {};
  for (const email of [
    'platform@test.local',
    'admin@test.local',
    'doctor@test.local',
    'patient@test.local',
  ]) {
    const response = await request(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email, password: DEMO_PASSWORD },
    });
    logins[email] = response.body.user;
  }

  const platform = logins['platform@test.local'];
  assert.equal(platform.patientId, null);
  assert.equal(platform.doctorId, null);
  assert.equal(platform.hospitalId, null);
  assert.equal(platform.hospitalName, null);

  const admin = logins['admin@test.local'];
  assert.equal(admin.patientId, null);
  assert.equal(admin.doctorId, null);
  assert.equal(admin.hospitalId, ids.hospitalId);
  assert.equal(admin.hospitalName, 'Test City Hospital');

  const doctor = logins['doctor@test.local'];
  assert.equal(doctor.patientId, null);
  assert.equal(doctor.doctorId, ids.doctorId);
  assert.equal(doctor.hospitalId, ids.hospitalId);
  assert.equal(doctor.hospitalName, 'Test City Hospital');

  const patient = logins['patient@test.local'];
  assert.equal(patient.patientId, ids.patientId);
  assert.equal(patient.doctorId, null);
  assert.equal(patient.hospitalId, null);
});

test('GET /auth/me requires a token', async () => {
  const response = await request(baseUrl, '/api/auth/me');
  assert.equal(response.status, 401);
  assert.equal(response.body.error.message, 'Authentication required.');
});

test('GET /auth/me rejects malformed and expired tokens', async () => {
  const malformed = await request(baseUrl, '/api/auth/me', {
    token: 'this-is-not-a-jwt',
  });
  assert.equal(malformed.status, 401);
  assert.equal(malformed.body.error.message, 'Invalid authentication token.');

  const expiredToken = jwt.sign(
    { sub: ids.patientUserId, role: 'PATIENT', exp: Math.floor(Date.now() / 1000) - 60 },
    process.env.JWT_SECRET,
  );
  const expired = await request(baseUrl, '/api/auth/me', { token: expiredToken });
  assert.equal(expired.status, 401);
  assert.equal(
    expired.body.error.message,
    'Your session has expired. Please sign in again.',
  );
});

test('GET /auth/me returns the fresh database identity for a valid token', async () => {
  const login = await request(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { email: 'doctor@test.local', password: DEMO_PASSWORD },
  });

  const response = await request(baseUrl, '/api/auth/me', {
    token: login.body.token,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.user.id, ids.doctorUserId);
  assert.equal(response.body.user.doctorId, ids.doctorId);
  assert.equal(response.body.user.hospitalName, 'Test City Hospital');
  assert.equal('passwordHash' in response.body.user, false);
});

test('a token for a deleted account is rejected', async () => {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const temporary = await prisma.user.create({
    data: {
      email: 'deleted@test.local',
      passwordHash,
      name: 'Deleted User',
      role: 'PATIENT',
    },
  });

  const login = await request(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { email: 'deleted@test.local', password: DEMO_PASSWORD },
  });
  assert.equal(login.status, 200);

  await prisma.user.delete({ where: { id: temporary.id } });

  const response = await request(baseUrl, '/api/auth/me', {
    token: login.body.token,
  });

  assert.equal(response.status, 401);
  assert.equal(response.body.error.message, 'Your session is no longer valid.');
});

test('patient registration creates a user, patient profile and session', async () => {
  const response = await request(baseUrl, '/api/auth/register', {
    method: 'POST',
    body: {
      name: 'New Patient',
      email: '  NEW.PATIENT@TEST.LOCAL ',
      password: 'PatientPass123',
      phone: '+91 90000 00000',
      dateOfBirth: '1998-04-12',
      gender: 'Female',
      bloodGroup: 'a+',
    },
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.user.email, 'new.patient@test.local');
  assert.equal(response.body.user.role, 'PATIENT');
  assert.equal(response.body.user.name, 'New Patient');
  assert.equal(typeof response.body.user.patientId, 'string');
  assert.equal('passwordHash' in response.body.user, false);

  const stored = await prisma.patient.findUnique({
    where: { id: response.body.user.patientId },
    include: { user: true },
  });
  assert.equal(stored.user.email, 'new.patient@test.local');
  assert.equal(stored.bloodGroup, 'A+');
  assert.equal(stored.dateOfBirth, '1998-04-12');

  const me = await request(baseUrl, '/api/auth/me', { token: response.body.token });
  assert.equal(me.status, 200);
  assert.equal(me.body.user.patientId, response.body.user.patientId);
});

test('duplicate registration is rejected with 409', async () => {
  const response = await request(baseUrl, '/api/auth/register', {
    method: 'POST',
    body: {
      name: 'Another New Patient',
      email: 'new.patient@test.local',
      password: 'PatientPass123',
    },
  });

  assert.equal(response.status, 409);
  assert.equal(response.body.error.message, 'An account with that email already exists.');
});

test('registration validates every field', async () => {
  const response = await request(baseUrl, '/api/auth/register', {
    method: 'POST',
    body: { name: 'A', email: 'bad', password: 'short' },
  });

  assert.equal(response.status, 400);
  assert.ok(response.body.error.details.name);
  assert.ok(response.body.error.details.email);
  assert.ok(response.body.error.details.password);
});

test('role guard allows the correct role and rejects everyone else', async () => {
  const doctorLogin = await request(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { email: 'doctor@test.local', password: DEMO_PASSWORD },
  });
  const patientLogin = await request(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { email: 'patient@test.local', password: DEMO_PASSWORD },
  });
  const adminLogin = await request(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@test.local', password: DEMO_PASSWORD },
  });

  const anonymous = await request(roleBaseUrl, '/doctor-only');
  assert.equal(anonymous.status, 401);

  const allowed = await request(roleBaseUrl, '/doctor-only', {
    token: doctorLogin.body.token,
  });
  assert.equal(allowed.status, 200);
  assert.deepEqual(allowed.body, { ok: true, role: 'DOCTOR' });

  for (const token of [patientLogin.body.token, adminLogin.body.token]) {
    const forbidden = await request(roleBaseUrl, '/doctor-only', { token });
    assert.equal(forbidden.status, 403);
    assert.equal(
      forbidden.body.error.message,
      'Your role cannot access this resource.',
    );
  }
});

test('authorization header must use the Bearer scheme', async () => {
  const login = await request(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { email: 'patient@test.local', password: DEMO_PASSWORD },
  });

  const response = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Token ${login.body.token}` },
  });

  assert.equal(response.status, 401);
});

test('a registered patient cannot escalate their role through registration input', async () => {
  const response = await request(baseUrl, '/api/auth/register', {
    method: 'POST',
    body: {
      name: 'Sneaky User',
      email: 'sneaky@test.local',
      password: 'SneakyPass123',
      role: 'PLATFORM_ADMIN',
    },
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.user.role, 'PATIENT');
});
