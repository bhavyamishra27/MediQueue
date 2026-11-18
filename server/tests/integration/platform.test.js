/**
 * Phase 8 platform + hospital dashboard integration tests. Runs against an
 * isolated SQLite file and never touches the development database.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const prismaCli = path.join(serverRoot, 'node_modules', 'prisma', 'build', 'index.js');
const testDbBase = path.join(serverRoot, 'prisma', 'test-platform.db');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file:./test-platform.db';
process.env.JWT_SECRET = 'phase-8-integration-test-secret-not-used-in-production';
process.env.JWT_EXPIRES_IN = '1h';
process.env.DEMO_PASSWORD = 'DemoPassword123';

const DEMO_PASSWORD = process.env.DEMO_PASSWORD;

let server;
let baseUrl;
let prisma;
let bcrypt;
let ids;
let tokens;

function toLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function minutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60000);
}

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

  const [{ app }, { prisma: prismaClient }, { configureDatabase }, bcryptModule] =
    await Promise.all([
      import('../../src/app.js'),
      import('../../src/config/prisma.js'),
      import('../../src/config/prisma.js'),
      import('bcryptjs'),
    ]);

  prisma = prismaClient;
  bcrypt = bcryptModule.default;

  await configureDatabase();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const today = toLocalDateString();

  const platformAdmin = await prisma.user.create({
    data: {
      email: 'platform@test.local',
      passwordHash,
      name: 'Platform Test Admin',
      role: 'PLATFORM_ADMIN',
    },
  });

  const adminAUser = await prisma.user.create({
    data: {
      email: 'admin.a@phase8.test',
      passwordHash,
      name: 'Admin A',
      phone: '+91 90000 10001',
      role: 'HOSPITAL_ADMIN',
    },
  });

  const hospitalA = await prisma.hospital.create({
    data: {
      name: 'Phase Eight City Hospital',
      address: '12 Test Road',
      city: 'Pune',
      phone: '+91 20 1111 1111',
      email: 'contact@phase8city.test',
      description: 'Hospital A for Phase 8 scoping tests.',
      adminId: adminAUser.id,
    },
  });

  const adminBUser = await prisma.user.create({
    data: {
      email: 'admin.b@phase8.test',
      passwordHash,
      name: 'Admin B',
      phone: '+91 90000 10002',
      role: 'HOSPITAL_ADMIN',
    },
  });

  const hospitalB = await prisma.hospital.create({
    data: {
      name: 'Phase Eight Sunrise Hospital',
      address: '88 Sea Road',
      city: 'Mumbai',
      phone: '+91 22 2222 2222',
      email: 'contact@phase8sunrise.test',
      description: 'Hospital B for Phase 8 scoping tests.',
      adminId: adminBUser.id,
    },
  });

  const hospitalC = await prisma.hospital.create({
    data: {
      name: 'Phase Eight Unassigned Hospital',
      address: '5 Lake Road',
      city: 'Bengaluru',
      phone: '+91 80 3333 3333',
      email: 'contact@phase8lake.test',
      description: 'Hospital C intentionally has no administrator.',
    },
  });

  async function createDoctor({ email, name, hospitalId, specialization, roomNumber }) {
    const user = await prisma.user.create({
      data: { email, passwordHash, name, role: 'DOCTOR' },
    });

    return prisma.doctor.create({
      data: {
        userId: user.id,
        hospitalId,
        specialization,
        qualification: 'MBBS',
        experienceYears: 9,
        avgConsultationMinutes: 15,
        roomNumber,
      },
    });
  }

  const alice = await createDoctor({
    email: 'alice@phase8.test',
    name: 'Dr. Alice Cardiology',
    hospitalId: hospitalA.id,
    specialization: 'Cardiology',
    roomNumber: 'A-101',
  });

  const adam = await createDoctor({
    email: 'adam@phase8.test',
    name: 'Dr. Adam Medicine',
    hospitalId: hospitalA.id,
    specialization: 'General Medicine',
    roomNumber: 'A-102',
  });

  const bob = await createDoctor({
    email: 'bob@phase8.test',
    name: 'Dr. Bob Ortho',
    hospitalId: hospitalB.id,
    specialization: 'Orthopedics',
    roomNumber: 'B-201',
  });

  async function createPatient({ email, name, phone }) {
    const user = await prisma.user.create({
      data: { email, passwordHash, name, phone, role: 'PATIENT' },
    });
    return prisma.patient.create({
      data: {
        userId: user.id,
        dateOfBirth: '1992-03-11',
        gender: 'Female',
        bloodGroup: 'B+',
      },
    });
  }

  const patientOne = await createPatient({
    email: 'patient.one@phase8.test',
    name: 'Patient One',
    phone: '+91 90000 20001',
  });

  const patientTwo = await createPatient({
    email: 'patient.two@phase8.test',
    name: 'Patient Two',
    phone: '+91 90000 20002',
  });

  const patientThree = await createPatient({
    email: 'patient.three@phase8.test',
    name: 'Patient Three',
    phone: '+91 90000 20003',
  });

  const patientFour = await createPatient({
    email: 'patient.four@phase8.test',
    name: 'Patient Four',
    phone: '+91 90000 20004',
  });

  async function createAppointment({
    patientId,
    doctorId,
    slotTime,
    status,
    isEmergency = false,
    reason = 'Test visit',
  }) {
    return prisma.appointment.create({
      data: {
        patientId,
        doctorId,
        date: today,
        slotTime,
        slotKey: slotTime ? `${doctorId}|${today}|${slotTime}` : null,
        status,
        isEmergency,
        reason,
        checkedInAt: ['CHECKED_IN', 'CALLED', 'IN_CONSULTATION', 'COMPLETED'].includes(status)
          ? minutesAgo(10)
          : null,
      },
    });
  }

  const appointmentOne = await createAppointment({
    patientId: patientOne.id,
    doctorId: alice.id,
    slotTime: '10:00',
    status: 'CHECKED_IN',
  });

  const appointmentTwo = await createAppointment({
    patientId: patientTwo.id,
    doctorId: alice.id,
    slotTime: null,
    status: 'CHECKED_IN',
    isEmergency: true,
    reason: 'Chest pain',
  });

  const appointmentThree = await createAppointment({
    patientId: patientThree.id,
    doctorId: alice.id,
    slotTime: '09:00',
    status: 'IN_CONSULTATION',
  });

  await createAppointment({
    patientId: patientFour.id,
    doctorId: alice.id,
    slotTime: '08:00',
    status: 'COMPLETED',
  });

  await createAppointment({
    patientId: patientOne.id,
    doctorId: adam.id,
    slotTime: '10:30',
    status: 'BOOKED',
  });

  await createAppointment({
    patientId: patientFour.id,
    doctorId: bob.id,
    slotTime: '11:00',
    status: 'BOOKED',
    reason: 'Knee pain',
  });

  await prisma.queueEntry.create({
    data: {
      doctorId: alice.id,
      patientId: patientOne.id,
      appointmentId: appointmentOne.id,
      queueDate: today,
      tokenNumber: 1,
      priority: 1,
      status: 'WAITING',
      checkedInAt: minutesAgo(6),
    },
  });

  await prisma.queueEntry.create({
    data: {
      doctorId: alice.id,
      patientId: patientTwo.id,
      appointmentId: appointmentTwo.id,
      queueDate: today,
      tokenNumber: 2,
      priority: 0,
      status: 'WAITING',
      checkedInAt: minutesAgo(3),
    },
  });

  await prisma.queueEntry.create({
    data: {
      doctorId: alice.id,
      patientId: patientThree.id,
      appointmentId: appointmentThree.id,
      queueDate: today,
      tokenNumber: 3,
      priority: 1,
      status: 'IN_CONSULTATION',
      checkedInAt: minutesAgo(20),
      calledAt: minutesAgo(8),
      startedAt: minutesAgo(7),
    },
  });

  await prisma.delayReport.create({
    data: {
      doctorId: alice.id,
      date: today,
      delayMinutes: 20,
      reason: 'Emergency procedure',
      isActive: true,
    },
  });

  ids = {
    platformAdminId: platformAdmin.id,
    adminAUserId: adminAUser.id,
    adminBUserId: adminBUser.id,
    hospitalAId: hospitalA.id,
    hospitalBId: hospitalB.id,
    hospitalCId: hospitalC.id,
    aliceId: alice.id,
    adamId: adam.id,
    bobId: bob.id,
    patientOneId: patientOne.id,
  };

  const main = await listen(app);
  server = main.httpServer;
  baseUrl = main.url;

  tokens = {
    platform: await login('platform@test.local'),
    adminA: await login('admin.a@phase8.test'),
    adminB: await login('admin.b@phase8.test'),
    alice: await login('alice@phase8.test'),
    patient: await login('patient.one@phase8.test'),
  };
});

after(async () => {
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));

  if (prisma) {
    await prisma.$disconnect();
  }

  removeTestDatabase();
});

test('platform routes reject non-platform roles and anonymous requests', async () => {
  const anonymous = await request('/api/platform/dashboard');
  assert.equal(anonymous.status, 401);

  for (const token of [tokens.adminA, tokens.alice, tokens.patient]) {
    const forbidden = await request('/api/platform/dashboard', { token });
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.body.error.message, 'Your role cannot access this resource.');
  }
});

test('hospital dashboard routes reject non-hospital-admin roles', async () => {
  const anonymous = await request('/api/hospital/dashboard');
  assert.equal(anonymous.status, 401);

  for (const token of [tokens.platform, tokens.alice, tokens.patient]) {
    const forbidden = await request('/api/hospital/dashboard', { token });
    assert.equal(forbidden.status, 403);
  }

  const doctorAppointments = await request('/api/hospital/appointments', {
    token: tokens.alice,
  });
  assert.equal(doctorAppointments.status, 403);

  const patientQueues = await request('/api/hospital/queues', { token: tokens.patient });
  assert.equal(patientQueues.status, 403);
});

test('platform dashboard reports network counts and recent hospitals', async () => {
  const response = await request('/api/platform/dashboard', { token: tokens.platform });

  assert.equal(response.status, 200);
  assert.equal(response.body.hospitals.total, 3);
  assert.equal(response.body.hospitals.withAdmin, 2);
  assert.equal(response.body.hospitals.withoutAdmin, 1);
  assert.equal(response.body.hospitalAdmins.total, 2);
  assert.equal(response.body.doctors.total, 3);
  assert.equal(response.body.doctors.active, 3);
  assert.equal(response.body.patients.total, 4);
  assert.equal(response.body.appointments.total, 6);
  assert.equal(response.body.appointments.today, 6);
  assert.equal(response.body.recentHospitals.length, 3);

  const names = response.body.recentHospitals.map((hospital) => hospital.name);
  assert.ok(names.includes('Phase Eight Unassigned Hospital'));
  assert.equal(
    response.body.recentHospitals.find((hospital) => hospital.id === ids.hospitalAId)
      .admin.email,
    'admin.a@phase8.test',
  );
  assert.equal(
    'passwordHash' in
      response.body.recentHospitals.find((hospital) => hospital.id === ids.hospitalAId).admin,
    false,
  );
});

test('platform hospital directory lists admins and doctor counts', async () => {
  const all = await request('/api/platform/hospitals', { token: tokens.platform });
  assert.equal(all.status, 200);
  assert.equal(all.body.hospitals.length, 3);

  const city = all.body.hospitals.find((hospital) => hospital.id === ids.hospitalAId);
  assert.equal(city.doctorCount, 2);
  assert.equal(city.admin.name, 'Admin A');
  assert.equal(city.admin.email, 'admin.a@phase8.test');
  assert.equal('passwordHash' in city.admin, false);

  const unassigned = all.body.hospitals.find((hospital) => hospital.id === ids.hospitalCId);
  assert.equal(unassigned.admin, null);

  const search = await request('/api/platform/hospitals?search=sunrise', {
    token: tokens.platform,
  });
  assert.equal(search.status, 200);
  assert.equal(search.body.hospitals.length, 1);
  assert.equal(search.body.hospitals[0].id, ids.hospitalBId);
});

test('platform lists hospital administrators with their hospital', async () => {
  const response = await request('/api/platform/hospital-admins', { token: tokens.platform });

  assert.equal(response.status, 200);
  assert.equal(response.body.admins.length, 2);

  const adminA = response.body.admins.find((admin) => admin.id === ids.adminAUserId);
  assert.equal(adminA.name, 'Admin A');
  assert.equal(adminA.hospital.id, ids.hospitalAId);
  assert.equal(adminA.hospital.name, 'Phase Eight City Hospital');
  assert.equal('passwordHash' in adminA, false);
});

test('platform can register a hospital and its first administrator atomically', async () => {
  const response = await request('/api/platform/hospitals', {
    method: 'POST',
    token: tokens.platform,
    body: {
      name: 'New Phase Eight Hospital',
      address: '77 New Street',
      city: 'Delhi',
      phone: '+91 11 4444 4444',
      email: 'contact@newphase8.test',
      description: 'Created by the platform integration test.',
      adminName: 'New Admin',
      adminEmail: 'new.admin@phase8.test',
      adminPhone: '+91 90000 30001',
      adminPassword: 'NewAdminPass123',
    },
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.hospital.name, 'New Phase Eight Hospital');
  assert.equal(response.body.hospital.city, 'Delhi');
  assert.equal(response.body.hospital.admin.name, 'New Admin');
  assert.equal(response.body.hospital.admin.email, 'new.admin@phase8.test');
  assert.equal('passwordHash' in response.body.hospital.admin, false);

  const storedAdmin = await prisma.user.findUnique({
    where: { email: 'new.admin@phase8.test' },
    include: { administeredHospital: true },
  });
  assert.equal(storedAdmin.role, 'HOSPITAL_ADMIN');
  assert.notEqual(storedAdmin.passwordHash, 'NewAdminPass123');
  assert.equal(storedAdmin.administeredHospital.id, response.body.hospital.id);

  const newAdminToken = await login('new.admin@phase8.test', 'NewAdminPass123');
  const profile = await request('/api/hospital/me', { token: newAdminToken });
  assert.equal(profile.status, 200);
  assert.equal(profile.body.hospital.id, response.body.hospital.id);
  assert.equal(profile.body.hospital.name, 'New Phase Eight Hospital');

  const dashboard = await request('/api/hospital/dashboard', { token: newAdminToken });
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.body.hospital.id, response.body.hospital.id);
  assert.equal(dashboard.body.doctors.total, 0);
  assert.equal(dashboard.body.appointments.total, 0);
  assert.equal(dashboard.body.queue.active, 0);
});

test('hospital registration validates fields and rejects duplicate admin emails', async () => {
  const invalid = await request('/api/platform/hospitals', {
    method: 'POST',
    token: tokens.platform,
    body: {
      name: 'A',
      address: 'x',
      city: '',
      phone: '1',
      email: 'bad',
      adminName: 'B',
      adminEmail: 'also-bad',
      adminPassword: 'short',
    },
  });

  assert.equal(invalid.status, 400);
  for (const field of [
    'name',
    'address',
    'city',
    'phone',
    'email',
    'adminName',
    'adminEmail',
    'adminPassword',
  ]) {
    assert.ok(invalid.body.error.details[field], `expected a ${field} error`);
  }

  const duplicate = await request('/api/platform/hospitals', {
    method: 'POST',
    token: tokens.platform,
    body: {
      name: 'Duplicate Admin Hospital',
      address: '1 Duplicate Road',
      city: 'Delhi',
      phone: '+91 11 5555 5555',
      adminName: 'Duplicate Admin',
      adminEmail: 'admin.a@phase8.test',
      adminPassword: 'DuplicatePass123',
    },
  });

  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error.message, 'An account with that email already exists.');

  const hospitalCount = await prisma.hospital.count({
    where: { name: 'Duplicate Admin Hospital' },
  });
  assert.equal(hospitalCount, 0);
});

test('platform can assign an administrator to a hospital without one', async () => {
  const response = await request('/api/platform/hospital-admins', {
    method: 'POST',
    token: tokens.platform,
    body: {
      hospitalId: ids.hospitalCId,
      name: 'Assigned Admin',
      email: 'assigned.admin@phase8.test',
      phone: '+91 90000 30002',
      password: 'AssignedPass123',
    },
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.admin.name, 'Assigned Admin');
  assert.equal(response.body.admin.hospital.id, ids.hospitalCId);

  const token = await login('assigned.admin@phase8.test', 'AssignedPass123');
  const profile = await request('/api/hospital/me', { token });
  assert.equal(profile.status, 200);
  assert.equal(profile.body.hospital.id, ids.hospitalCId);
  assert.equal(profile.body.hospital.name, 'Phase Eight Unassigned Hospital');

  const second = await request('/api/platform/hospital-admins', {
    method: 'POST',
    token: tokens.platform,
    body: {
      hospitalId: ids.hospitalCId,
      name: 'Second Admin',
      email: 'second.admin@phase8.test',
      password: 'SecondPass123',
    },
  });
  assert.equal(second.status, 409);
  assert.equal(second.body.error.message, 'This hospital already has an administrator.');

  const missing = await request('/api/platform/hospital-admins', {
    method: 'POST',
    token: tokens.platform,
    body: {
      hospitalId: 'does-not-exist',
      name: 'Missing Hospital Admin',
      email: 'missing.admin@phase8.test',
      password: 'MissingPass123',
    },
  });
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error.message, 'Hospital not found.');
});

test('platform can update an administrator and reset the password', async () => {
  const update = await request(`/api/platform/hospital-admins/${ids.adminBUserId}`, {
    method: 'PATCH',
    token: tokens.platform,
    body: {
      name: 'Admin B Updated',
      phone: '+91 90000 99999',
      password: 'UpdatedPassword123',
    },
  });

  assert.equal(update.status, 200);
  assert.equal(update.body.admin.name, 'Admin B Updated');
  assert.equal(update.body.admin.phone, '+91 90000 99999');
  assert.equal(update.body.admin.hospital.id, ids.hospitalBId);

  const newToken = await login('admin.b@phase8.test', 'UpdatedPassword123');
  const profile = await request('/api/hospital/me', { token: newToken });
  assert.equal(profile.status, 200);
  assert.equal(profile.body.hospital.id, ids.hospitalBId);

  const oldPassword = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin.b@phase8.test', password: DEMO_PASSWORD },
  });
  assert.equal(oldPassword.status, 401);

  const empty = await request(`/api/platform/hospital-admins/${ids.adminBUserId}`, {
    method: 'PATCH',
    token: tokens.platform,
    body: {},
  });
  assert.equal(empty.status, 400);

  const shortPassword = await request(`/api/platform/hospital-admins/${ids.adminBUserId}`, {
    method: 'PATCH',
    token: tokens.platform,
    body: { password: 'short' },
  });
  assert.equal(shortPassword.status, 400);
  assert.ok(shortPassword.body.error.details.password);

  const platformAdminTarget = await request(
    `/api/platform/hospital-admins/${ids.platformAdminId}`,
    {
      method: 'PATCH',
      token: tokens.platform,
      body: { name: 'Not Allowed' },
    },
  );
  assert.equal(platformAdminTarget.status, 404);

  const unknown = await request('/api/platform/hospital-admins/does-not-exist', {
    method: 'PATCH',
    token: tokens.platform,
    body: { name: 'Not Allowed' },
  });
  assert.equal(unknown.status, 404);
});

test('hospital dashboard is strictly scoped to the administrator hospital', async () => {
  const adminA = await request('/api/hospital/dashboard', { token: tokens.adminA });
  assert.equal(adminA.status, 200);
  assert.equal(adminA.body.hospital.id, ids.hospitalAId);
  assert.equal(adminA.body.hospital.name, 'Phase Eight City Hospital');
  assert.equal(adminA.body.doctors.total, 2);
  assert.equal(adminA.body.doctors.active, 2);
  assert.equal(adminA.body.appointments.total, 5);
  assert.equal(adminA.body.appointments.booked, 1);
  assert.equal(adminA.body.appointments.inQueue, 3);
  assert.equal(adminA.body.appointments.completed, 1);
  assert.equal(adminA.body.appointments.emergency, 1);
  assert.equal(adminA.body.queue.waiting, 2);
  assert.equal(adminA.body.queue.inConsultation, 1);
  assert.equal(adminA.body.queue.active, 3);
  assert.equal(adminA.body.queue.emergency, 1);
  assert.equal(adminA.body.queue.doctorsWithQueue, 1);
  assert.equal(adminA.body.delays.length, 1);
  assert.equal(adminA.body.delays[0].doctorId, ids.aliceId);
  assert.equal(adminA.body.delays[0].delayMinutes, 20);

  const doctorIds = adminA.body.doctorQueues.map((row) => row.doctor.id);
  assert.deepEqual(doctorIds.sort(), [ids.aliceId, ids.adamId].sort());
  assert.equal(doctorIds.includes(ids.bobId), false);

  const aliceQueue = adminA.body.doctorQueues.find((row) => row.doctor.id === ids.aliceId);
  assert.equal(aliceQueue.waiting, 2);
  assert.equal(aliceQueue.inConsultation, 1);
  assert.equal(aliceQueue.emergency, 1);
  assert.equal(aliceQueue.delay.minutes, 20);

  assert.equal(adminA.body.todayAppointments.length, 5);
  assert.equal(
    adminA.body.todayAppointments.every((appointment) => appointment.doctor.id !== ids.bobId),
    true,
  );
  assert.equal('passwordHash' in adminA.body.todayAppointments[0].patient, false);

  const adminB = await request('/api/hospital/dashboard', { token: tokens.adminB });
  assert.equal(adminB.status, 200);
  assert.equal(adminB.body.hospital.id, ids.hospitalBId);
  assert.equal(adminB.body.doctors.total, 1);
  assert.equal(adminB.body.appointments.total, 1);
  assert.equal(adminB.body.queue.active, 0);
  assert.equal(adminB.body.doctorQueues[0].doctor.id, ids.bobId);
});

test('hospital appointment list filters by date, doctor and status with scoping', async () => {
  const all = await request('/api/hospital/appointments', { token: tokens.adminA });
  assert.equal(all.status, 200);
  assert.equal(all.body.date, toLocalDateString());
  assert.equal(all.body.appointments.length, 5);
  assert.equal(all.body.counts.total, 5);
  assert.equal(all.body.doctors.length, 2);
  assert.equal(all.body.doctors.some((doctor) => doctor.id === ids.bobId), false);
  assert.equal(
    all.body.appointments.every((appointment) => appointment.doctor.id !== ids.bobId),
    true,
  );
  assert.equal('passwordHash' in all.body.appointments[0].patient, false);

  const adamOnly = await request(
    `/api/hospital/appointments?doctorId=${ids.adamId}`,
    { token: tokens.adminA },
  );
  assert.equal(adamOnly.status, 200);
  assert.equal(adamOnly.body.appointments.length, 1);
  assert.equal(adamOnly.body.appointments[0].doctor.id, ids.adamId);

  const completed = await request('/api/hospital/appointments?status=COMPLETED', {
    token: tokens.adminA,
  });
  assert.equal(completed.status, 200);
  assert.equal(completed.body.appointments.length, 1);
  assert.equal(completed.body.appointments[0].status, 'COMPLETED');

  const crossHospitalDoctor = await request(
    `/api/hospital/appointments?doctorId=${ids.bobId}`,
    { token: tokens.adminA },
  );
  assert.equal(crossHospitalDoctor.status, 404);
  assert.equal(crossHospitalDoctor.body.error.message, 'Doctor not found in your hospital.');

  const invalidDate = await request('/api/hospital/appointments?date=2026-13-40', {
    token: tokens.adminA,
  });
  assert.equal(invalidDate.status, 400);
  assert.ok(invalidDate.body.error.details.date);

  const invalidStatus = await request('/api/hospital/appointments?status=NOPE', {
    token: tokens.adminA,
  });
  assert.equal(invalidStatus.status, 400);
  assert.ok(invalidStatus.body.error.details.status);

  const adminB = await request('/api/hospital/appointments', { token: tokens.adminB });
  assert.equal(adminB.status, 200);
  assert.equal(adminB.body.appointments.length, 1);
  assert.equal(adminB.body.appointments[0].doctor.id, ids.bobId);
});

test('hospital queue monitor shows live queues in heap order and stays scoped', async () => {
  const adminA = await request('/api/hospital/queues', { token: tokens.adminA });
  assert.equal(adminA.status, 200);
  assert.equal(adminA.body.queues.length, 2);
  assert.equal(adminA.body.totals.doctors, 2);
  assert.equal(adminA.body.totals.activeDoctors, 1);
  assert.equal(adminA.body.totals.waiting, 2);
  assert.equal(adminA.body.totals.inConsultation, 1);
  assert.equal(adminA.body.totals.delays, 1);
  assert.equal(adminA.body.totals.emergency, 1);

  const aliceQueue = adminA.body.queues.find((queue) => queue.doctor.id === ids.aliceId);
  assert.equal(aliceQueue.counts.waiting, 2);
  assert.equal(aliceQueue.counts.active, 3);
  assert.equal(aliceQueue.counts.emergency, 1);
  assert.equal(aliceQueue.current.status, 'IN_CONSULTATION');
  assert.equal(aliceQueue.current.patientName, 'Patient Three');
  assert.equal(aliceQueue.delay.minutes, 20);
  assert.equal(aliceQueue.delay.reason, 'Emergency procedure');

  // Emergency priority 0 must be served before the lower token 1.
  assert.deepEqual(
    aliceQueue.waiting.map((entry) => entry.tokenNumber),
    [2, 1],
  );
  assert.equal(aliceQueue.waiting[0].priority, 0);
  assert.equal(aliceQueue.waiting[0].patientName, 'Patient Two');
  assert.equal(aliceQueue.waiting[0].position, 1);
  assert.equal(aliceQueue.waiting[1].position, 2);

  const adamQueue = adminA.body.queues.find((queue) => queue.doctor.id === ids.adamId);
  assert.equal(adamQueue.counts.active, 0);
  assert.deepEqual(adamQueue.waiting, []);

  assert.equal(
    adminA.body.queues.some((queue) => queue.doctor.id === ids.bobId),
    false,
  );

  const adminB = await request('/api/hospital/queues', { token: tokens.adminB });
  assert.equal(adminB.status, 200);
  assert.equal(adminB.body.queues.length, 1);
  assert.equal(adminB.body.queues[0].doctor.id, ids.bobId);
  assert.equal(adminB.body.queues[0].counts.active, 0);
});
