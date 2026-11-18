/**
 * Phase 3 hospital/doctor discovery and hospital-administrator integration
 * tests. Runs against an isolated SQLite file and never touches the
 * development database.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const prismaCli = path.join(serverRoot, 'node_modules', 'prisma', 'build', 'index.js');
const testDbBase = path.join(serverRoot, 'prisma', 'test-hospital.db');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file:./test-hospital.db';
process.env.JWT_SECRET = 'phase-3-integration-test-secret-not-used-in-production';
process.env.JWT_EXPIRES_IN = '1h';
process.env.DEMO_PASSWORD = 'DemoPassword123';

const DEMO_PASSWORD = process.env.DEMO_PASSWORD;

let server;
let baseUrl;
let prisma;
let bcrypt;
let ids;
let tokens;
let createdDoctorId;
let createdScheduleId;

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

  const adminA = await prisma.user.create({
    data: {
      email: 'admin.a@test.local',
      passwordHash,
      name: 'Admin A',
      role: 'HOSPITAL_ADMIN',
    },
  });

  const hospitalA = await prisma.hospital.create({
    data: {
      name: 'City Care Test Hospital',
      address: '12 Test Road',
      city: 'Pune',
      phone: '+91 20 1111 1111',
      email: 'contact@citycare.test',
      description: 'Hospital A used for scoping tests.',
      adminId: adminA.id,
    },
  });

  const adminB = await prisma.user.create({
    data: {
      email: 'admin.b@test.local',
      passwordHash,
      name: 'Admin B',
      role: 'HOSPITAL_ADMIN',
    },
  });

  const hospitalB = await prisma.hospital.create({
    data: {
      name: 'Sunrise Test Hospital',
      address: '88 Sea Road',
      city: 'Mumbai',
      phone: '+91 22 2222 2222',
      email: 'contact@sunrise.test',
      description: 'Hospital B used for scoping tests.',
      adminId: adminB.id,
    },
  });

  async function createDoctor({
    email,
    name,
    hospitalId,
    specialization,
    isActive = true,
    avgConsultationMinutes = 15,
    roomNumber = null,
  }) {
    const user = await prisma.user.create({
      data: { email, passwordHash, name, role: 'DOCTOR' },
    });

    return prisma.doctor.create({
      data: {
        userId: user.id,
        hospitalId,
        specialization,
        qualification: 'MBBS',
        experienceYears: 8,
        avgConsultationMinutes,
        roomNumber,
        isActive,
      },
    });
  }

  const alice = await createDoctor({
    email: 'alice@test.local',
    name: 'Dr. Alice Cardiology',
    hospitalId: hospitalA.id,
    specialization: 'Cardiology',
    roomNumber: 'A-101',
  });

  const adam = await createDoctor({
    email: 'adam@test.local',
    name: 'Dr. Adam Medicine',
    hospitalId: hospitalA.id,
    specialization: 'General Medicine',
    avgConsultationMinutes: 20,
    roomNumber: 'A-102',
  });

  const inactive = await createDoctor({
    email: 'inactive@test.local',
    name: 'Dr. Inactive Skin',
    hospitalId: hospitalA.id,
    specialization: 'Dermatology',
    isActive: false,
  });

  const bob = await createDoctor({
    email: 'bob@test.local',
    name: 'Dr. Bob Ortho',
    hospitalId: hospitalB.id,
    specialization: 'Orthopedics',
    roomNumber: 'B-201',
  });

  await prisma.doctorSchedule.create({
    data: {
      doctorId: alice.id,
      dayOfWeek: 1,
      startTime: '09:00',
      endTime: '13:00',
      slotDurationMinutes: 15,
    },
  });

  await prisma.doctorSchedule.create({
    data: {
      doctorId: adam.id,
      dayOfWeek: 2,
      startTime: '10:00',
      endTime: '12:00',
      slotDurationMinutes: 20,
    },
  });

  await prisma.doctorSchedule.create({
    data: {
      doctorId: bob.id,
      dayOfWeek: 3,
      startTime: '09:00',
      endTime: '11:00',
      slotDurationMinutes: 30,
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
    adminAUserId: adminA.id,
    adminBUserId: adminB.id,
    hospitalAId: hospitalA.id,
    hospitalBId: hospitalB.id,
    aliceId: alice.id,
    adamId: adam.id,
    inactiveId: inactive.id,
    bobId: bob.id,
    patientUserId: patientUser.id,
    patientId: patient.id,
  };

  const main = await listen(app);
  server = main.httpServer;
  baseUrl = main.url;

  tokens = {
    adminA: await login('admin.a@test.local'),
    adminB: await login('admin.b@test.local'),
    alice: await login('alice@test.local'),
    patient: await login('patient@test.local'),
  };
});

after(async () => {
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));

  if (prisma) {
    await prisma.$disconnect();
  }

  removeTestDatabase();
});

test('public hospital directory lists active-doctor summaries only', async () => {
  const response = await request('/api/hospitals');

  assert.equal(response.status, 200);
  assert.equal(response.body.hospitals.length, 2);

  const cityCare = response.body.hospitals.find((h) => h.id === ids.hospitalAId);
  assert.equal(cityCare.name, 'City Care Test Hospital');
  assert.equal(cityCare.doctorCount, 2);
  assert.deepEqual(cityCare.specializations, ['Cardiology', 'General Medicine']);
  assert.equal('adminId' in cityCare, false);
  assert.equal('admin' in cityCare, false);

  const sunrise = response.body.hospitals.find((h) => h.id === ids.hospitalBId);
  assert.equal(sunrise.doctorCount, 1);
});

test('public hospital directory searches by name and city', async () => {
  const byName = await request('/api/hospitals?search=sunrise');
  assert.equal(byName.status, 200);
  assert.equal(byName.body.hospitals.length, 1);
  assert.equal(byName.body.hospitals[0].id, ids.hospitalBId);

  const byCity = await request('/api/hospitals?city=pune');
  assert.equal(byCity.status, 200);
  assert.equal(byCity.body.hospitals.length, 1);
  assert.equal(byCity.body.hospitals[0].id, ids.hospitalAId);

  const noMatch = await request('/api/hospitals?search=does-not-exist');
  assert.equal(noMatch.status, 200);
  assert.deepEqual(noMatch.body.hospitals, []);
});

test('public hospital detail exposes active doctors only', async () => {
  const response = await request(`/api/hospitals/${ids.hospitalAId}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.hospital.name, 'City Care Test Hospital');
  assert.equal(response.body.hospital.doctors.length, 2);

  const names = response.body.hospital.doctors.map((doctor) => doctor.name);
  assert.deepEqual(names.sort(), ['Dr. Adam Medicine', 'Dr. Alice Cardiology']);
  assert.equal(
    response.body.hospital.doctors.some((doctor) => doctor.id === ids.inactiveId),
    false,
  );
  assert.equal('email' in response.body.hospital.doctors[0], false);

  const missing = await request('/api/hospitals/does-not-exist');
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error.message, 'Hospital not found.');
});

test('public doctor directory filters by specialization, hospital and search', async () => {
  const all = await request('/api/doctors');
  assert.equal(all.status, 200);
  assert.equal(all.body.doctors.length, 3);
  assert.equal(
    all.body.doctors.some((doctor) => doctor.id === ids.inactiveId),
    false,
  );

  const cardiology = await request('/api/doctors?specialization=Cardiology');
  assert.equal(cardiology.body.doctors.length, 1);
  assert.equal(cardiology.body.doctors[0].id, ids.aliceId);

  const hospitalB = await request(`/api/doctors?hospitalId=${ids.hospitalBId}`);
  assert.equal(hospitalB.body.doctors.length, 1);
  assert.equal(hospitalB.body.doctors[0].id, ids.bobId);

  const byName = await request('/api/doctors?search=bob');
  assert.equal(byName.body.doctors.length, 1);
  assert.equal(byName.body.doctors[0].id, ids.bobId);

  const bySpecialization = await request('/api/doctors?search=cardio');
  assert.equal(bySpecialization.body.doctors.length, 1);
  assert.equal(bySpecialization.body.doctors[0].id, ids.aliceId);

  const byCity = await request('/api/doctors?city=Mumbai');
  assert.equal(byCity.body.doctors.length, 1);
  assert.equal(byCity.body.doctors[0].id, ids.bobId);
});

test('public doctor detail includes active schedules and hospital contact', async () => {
  const response = await request(`/api/doctors/${ids.aliceId}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.doctor.name, 'Dr. Alice Cardiology');
  assert.equal(response.body.doctor.schedules.length, 1);
  assert.equal(response.body.doctor.schedules[0].dayOfWeek, 1);
  assert.equal(response.body.doctor.schedules[0].startTime, '09:00');
  assert.equal(response.body.doctor.hospital.name, 'City Care Test Hospital');
  assert.equal(response.body.doctor.hospital.phone, '+91 20 1111 1111');
  assert.equal('email' in response.body.doctor, false);
  assert.equal('passwordHash' in response.body.doctor, false);

  const inactive = await request(`/api/doctors/${ids.inactiveId}`);
  assert.equal(inactive.status, 404);

  const missing = await request('/api/doctors/does-not-exist');
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error.message, 'Doctor not found.');
});

test('specializations endpoint returns distinct active values in order', async () => {
  const response = await request('/api/doctors/specializations');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.specializations, [
    'Cardiology',
    'General Medicine',
    'Orthopedics',
  ]);
});

test('hospital admin profile is scoped to the signed-in administrator', async () => {
  const adminA = await request('/api/hospital/me', { token: tokens.adminA });
  assert.equal(adminA.status, 200);
  assert.equal(adminA.body.hospital.id, ids.hospitalAId);
  assert.equal(adminA.body.hospital.name, 'City Care Test Hospital');

  const adminB = await request('/api/hospital/me', { token: tokens.adminB });
  assert.equal(adminB.status, 200);
  assert.equal(adminB.body.hospital.id, ids.hospitalBId);
  assert.equal(adminB.body.hospital.name, 'Sunrise Test Hospital');

  const anonymous = await request('/api/hospital/me');
  assert.equal(anonymous.status, 401);

  for (const token of [tokens.alice, tokens.patient]) {
    const forbidden = await request('/api/hospital/me', { token });
    assert.equal(forbidden.status, 403);
  }
});

test('hospital admin can update only their own profile', async () => {
  const update = await request('/api/hospital/me', {
    method: 'PATCH',
    token: tokens.adminA,
    body: { name: 'City Care Updated', city: 'Pune', description: 'Updated profile.' },
  });

  assert.equal(update.status, 200);
  assert.equal(update.body.hospital.name, 'City Care Updated');
  assert.equal(update.body.hospital.description, 'Updated profile.');

  const other = await request('/api/hospital/me', { token: tokens.adminB });
  assert.equal(other.body.hospital.name, 'Sunrise Test Hospital');
  assert.equal(other.body.hospital.description, 'Hospital B used for scoping tests.');

  const invalid = await request('/api/hospital/me', {
    method: 'PATCH',
    token: tokens.adminA,
    body: { email: 'not-an-email', name: '' },
  });
  assert.equal(invalid.status, 400);
  assert.ok(invalid.body.error.details.email);
  assert.ok(invalid.body.error.details.name);

  const empty = await request('/api/hospital/me', {
    method: 'PATCH',
    token: tokens.adminA,
    body: {},
  });
  assert.equal(empty.status, 400);
});

test('hospital admin doctor list is scoped and includes management fields', async () => {
  const adminA = await request('/api/hospital/doctors', { token: tokens.adminA });
  assert.equal(adminA.status, 200);
  assert.equal(adminA.body.doctors.length, 3);
  assert.equal(
    adminA.body.doctors.every((doctor) => doctor.id !== ids.bobId),
    true,
  );
  assert.equal(
    adminA.body.doctors.some((doctor) => doctor.id === ids.inactiveId),
    true,
  );

  const alice = adminA.body.doctors.find((doctor) => doctor.id === ids.aliceId);
  assert.equal(alice.email, 'alice@test.local');
  assert.equal(alice.schedules.length, 1);
  assert.equal('passwordHash' in alice, false);

  const adminB = await request('/api/hospital/doctors', { token: tokens.adminB });
  assert.equal(adminB.status, 200);
  assert.equal(adminB.body.doctors.length, 1);
  assert.equal(adminB.body.doctors[0].id, ids.bobId);
});

test('hospital admin can create a doctor in their own hospital', async () => {
  const response = await request('/api/hospital/doctors', {
    method: 'POST',
    token: tokens.adminA,
    body: {
      name: 'Dr. New Hire',
      email: 'new.hire@test.local',
      password: 'NewDoctorPass123',
      phone: '+91 90000 12345',
      specialization: 'Pediatrics',
      qualification: 'MBBS, MD',
      experienceYears: 6,
      avgConsultationMinutes: 18,
      roomNumber: 'A-301',
      bio: 'New paediatrician.',
    },
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.doctor.name, 'Dr. New Hire');
  assert.equal(response.body.doctor.email, 'new.hire@test.local');
  assert.equal(response.body.doctor.specialization, 'Pediatrics');
  assert.equal(response.body.doctor.isActive, true);
  assert.deepEqual(response.body.doctor.schedules, []);
  assert.equal('passwordHash' in response.body.doctor, false);

  createdDoctorId = response.body.doctor.id;

  const stored = await prisma.doctor.findUnique({
    where: { id: createdDoctorId },
    include: { user: true },
  });
  assert.equal(stored.hospitalId, ids.hospitalAId);
  assert.equal(stored.user.role, 'DOCTOR');
  assert.notEqual(stored.user.passwordHash, 'NewDoctorPass123');

  const loginResponse = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'new.hire@test.local', password: 'NewDoctorPass123' },
  });
  assert.equal(loginResponse.status, 200);
  assert.equal(loginResponse.body.user.role, 'DOCTOR');
  assert.equal(loginResponse.body.user.doctorId, createdDoctorId);
  assert.equal(loginResponse.body.user.hospitalId, ids.hospitalAId);
});

test('duplicate doctor email is rejected with 409', async () => {
  const response = await request('/api/hospital/doctors', {
    method: 'POST',
    token: tokens.adminA,
    body: {
      name: 'Dr. Duplicate',
      email: 'new.hire@test.local',
      password: 'AnotherPass123',
      specialization: 'Pediatrics',
    },
  });

  assert.equal(response.status, 409);
  assert.equal(response.body.error.message, 'An account with that email already exists.');
});

test('doctor creation validates every field', async () => {
  const response = await request('/api/hospital/doctors', {
    method: 'POST',
    token: tokens.adminA,
    body: {
      name: 'A',
      email: 'bad',
      password: 'short',
      specialization: '',
      avgConsultationMinutes: 2,
    },
  });

  assert.equal(response.status, 400);
  assert.ok(response.body.error.details.name);
  assert.ok(response.body.error.details.email);
  assert.ok(response.body.error.details.password);
  assert.ok(response.body.error.details.specialization);
  assert.ok(response.body.error.details.avgConsultationMinutes);
});

test('hospital admin can update a doctor but cannot move hospitals', async () => {
  const response = await request(`/api/hospital/doctors/${createdDoctorId}`, {
    method: 'PATCH',
    token: tokens.adminA,
    body: {
      name: 'Dr. Renamed',
      phone: '+91 90000 99999',
      specialization: 'Pediatric Cardiology',
      experienceYears: 7,
      avgConsultationMinutes: 25,
      roomNumber: 'A-302',
      bio: 'Updated bio.',
      isActive: true,
      // Deliberately ignored: the hospital relation is server-controlled.
      hospitalId: ids.hospitalBId,
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.doctor.name, 'Dr. Renamed');
  assert.equal(response.body.doctor.phone, '+91 90000 99999');
  assert.equal(response.body.doctor.specialization, 'Pediatric Cardiology');
  assert.equal(response.body.doctor.avgConsultationMinutes, 25);

  const stored = await prisma.doctor.findUnique({ where: { id: createdDoctorId } });
  assert.equal(stored.hospitalId, ids.hospitalAId);

  const emailConflict = await request(`/api/hospital/doctors/${createdDoctorId}`, {
    method: 'PATCH',
    token: tokens.adminA,
    body: { email: 'bob@test.local' },
  });
  assert.equal(emailConflict.status, 409);

  const invalidStatus = await request(`/api/hospital/doctors/${createdDoctorId}`, {
    method: 'PATCH',
    token: tokens.adminA,
    body: { isActive: 'yes' },
  });
  assert.equal(invalidStatus.status, 400);
  assert.ok(invalidStatus.body.error.details.isActive);

  const empty = await request(`/api/hospital/doctors/${createdDoctorId}`, {
    method: 'PATCH',
    token: tokens.adminA,
    body: {},
  });
  assert.equal(empty.status, 400);
});

test("hospital admin cannot read or modify another hospital's doctor", async () => {
  const update = await request(`/api/hospital/doctors/${ids.bobId}`, {
    method: 'PATCH',
    token: tokens.adminA,
    body: { name: 'Hijacked' },
  });
  assert.equal(update.status, 404);

  const deactivate = await request(`/api/hospital/doctors/${ids.bobId}/deactivate`, {
    method: 'POST',
    token: tokens.adminA,
  });
  assert.equal(deactivate.status, 404);

  const listSchedules = await request(`/api/hospital/doctors/${ids.bobId}/schedules`, {
    token: tokens.adminA,
  });
  assert.equal(listSchedules.status, 404);

  const createSchedule = await request(`/api/hospital/doctors/${ids.bobId}/schedules`, {
    method: 'POST',
    token: tokens.adminA,
    body: { dayOfWeek: 4, startTime: '09:00', endTime: '10:00' },
  });
  assert.equal(createSchedule.status, 404);

  const stored = await prisma.doctor.findUnique({ where: { id: ids.bobId } });
  assert.equal(stored.isActive, true);
  assert.notEqual(stored.id, null);
});

test('schedule CRUD works and validates the schedule window', async () => {
  const initial = await request(`/api/hospital/doctors/${ids.aliceId}/schedules`, {
    token: tokens.adminA,
  });
  assert.equal(initial.status, 200);
  assert.equal(initial.body.schedules.length, 1);

  const create = await request(`/api/hospital/doctors/${ids.aliceId}/schedules`, {
    method: 'POST',
    token: tokens.adminA,
    body: {
      dayOfWeek: 5,
      startTime: '14:00',
      endTime: '17:00',
      slotDurationMinutes: 30,
    },
  });
  assert.equal(create.status, 201);
  assert.equal(create.body.schedule.dayOfWeek, 5);
  assert.equal(create.body.schedule.slotDurationMinutes, 30);
  createdScheduleId = create.body.schedule.id;

  const update = await request(
    `/api/hospital/doctors/${ids.aliceId}/schedules/${createdScheduleId}`,
    {
      method: 'PATCH',
      token: tokens.adminA,
      body: { startTime: '15:00', endTime: '18:00' },
    },
  );
  assert.equal(update.status, 200);
  assert.equal(update.body.schedule.startTime, '15:00');
  assert.equal(update.body.schedule.endTime, '18:00');

  const overlap = await request(`/api/hospital/doctors/${ids.aliceId}/schedules`, {
    method: 'POST',
    token: tokens.adminA,
    body: { dayOfWeek: 5, startTime: '16:00', endTime: '19:00' },
  });
  assert.equal(overlap.status, 409);
  assert.match(overlap.body.error.message, /overlaps/i);

  const duplicateStart = await request(`/api/hospital/doctors/${ids.aliceId}/schedules`, {
    method: 'POST',
    token: tokens.adminA,
    body: { dayOfWeek: 5, startTime: '15:00', endTime: '19:00' },
  });
  assert.equal(duplicateStart.status, 409);
  assert.match(duplicateStart.body.error.message, /already starts/i);

  const reversed = await request(`/api/hospital/doctors/${ids.aliceId}/schedules`, {
    method: 'POST',
    token: tokens.adminA,
    body: { dayOfWeek: 6, startTime: '17:00', endTime: '10:00' },
  });
  assert.equal(reversed.status, 400);
  assert.ok(reversed.body.error.details.endTime);

  const invalidDay = await request(`/api/hospital/doctors/${ids.aliceId}/schedules`, {
    method: 'POST',
    token: tokens.adminA,
    body: { dayOfWeek: 7, startTime: '09:00', endTime: '10:00' },
  });
  assert.equal(invalidDay.status, 400);
  assert.ok(invalidDay.body.error.details.dayOfWeek);

  const invalidTime = await request(`/api/hospital/doctors/${ids.aliceId}/schedules`, {
    method: 'POST',
    token: tokens.adminA,
    body: { dayOfWeek: 6, startTime: '9:00', endTime: '10:00' },
  });
  assert.equal(invalidTime.status, 400);
  assert.ok(invalidTime.body.error.details.startTime);

  const longSlot = await request(`/api/hospital/doctors/${ids.aliceId}/schedules`, {
    method: 'POST',
    token: tokens.adminA,
    body: {
      dayOfWeek: 6,
      startTime: '09:00',
      endTime: '10:00',
      slotDurationMinutes: 90,
    },
  });
  assert.equal(longSlot.status, 400);
  assert.ok(longSlot.body.error.details.slotDurationMinutes);

  const remove = await request(
    `/api/hospital/doctors/${ids.aliceId}/schedules/${createdScheduleId}`,
    { method: 'DELETE', token: tokens.adminA },
  );
  assert.equal(remove.status, 204);

  const afterDelete = await request(`/api/hospital/doctors/${ids.aliceId}/schedules`, {
    token: tokens.adminA,
  });
  assert.equal(afterDelete.body.schedules.length, 1);

  const removeAgain = await request(
    `/api/hospital/doctors/${ids.aliceId}/schedules/${createdScheduleId}`,
    { method: 'DELETE', token: tokens.adminA },
  );
  assert.equal(removeAgain.status, 404);
});

test('inactive schedules may overlap but stay out of the public profile', async () => {
  const create = await request(`/api/hospital/doctors/${ids.aliceId}/schedules`, {
    method: 'POST',
    token: tokens.adminA,
    body: {
      dayOfWeek: 1,
      startTime: '10:00',
      endTime: '11:00',
      isActive: false,
    },
  });
  assert.equal(create.status, 201);
  assert.equal(create.body.schedule.isActive, false);

  const publicProfile = await request(`/api/doctors/${ids.aliceId}`);
  assert.equal(publicProfile.status, 200);
  assert.equal(publicProfile.body.doctor.schedules.length, 1);

  const remove = await request(
    `/api/hospital/doctors/${ids.aliceId}/schedules/${create.body.schedule.id}`,
    { method: 'DELETE', token: tokens.adminA },
  );
  assert.equal(remove.status, 204);
});

test('deactivating a doctor hides them from public discovery and can be undone', async () => {
  const deactivate = await request(
    `/api/hospital/doctors/${createdDoctorId}/deactivate`,
    { method: 'POST', token: tokens.adminA },
  );
  assert.equal(deactivate.status, 200);
  assert.equal(deactivate.body.doctor.isActive, false);

  const publicList = await request('/api/doctors?search=renamed');
  assert.equal(publicList.status, 200);
  assert.equal(publicList.body.doctors.length, 0);

  const publicDetail = await request(`/api/doctors/${createdDoctorId}`);
  assert.equal(publicDetail.status, 404);

  const reactivate = await request(`/api/hospital/doctors/${createdDoctorId}`, {
    method: 'PATCH',
    token: tokens.adminA,
    body: { isActive: true },
  });
  assert.equal(reactivate.status, 200);
  assert.equal(reactivate.body.doctor.isActive, true);

  const visibleAgain = await request('/api/doctors?search=renamed');
  assert.equal(visibleAgain.status, 200);
  assert.equal(visibleAgain.body.doctors.length, 1);
  assert.equal(visibleAgain.body.doctors[0].id, createdDoctorId);
});
