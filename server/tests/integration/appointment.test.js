/**
 * Phase 4 appointment booking and slot-availability integration tests.
 * Runs against an isolated SQLite file and never touches the development
 * database.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const prismaCli = path.join(serverRoot, 'node_modules', 'prisma', 'build', 'index.js');
const testDbBase = path.join(serverRoot, 'prisma', 'test-appointment.db');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file:./test-appointment.db';
process.env.JWT_SECRET = 'phase-4-integration-test-secret-not-used-in-production';
process.env.JWT_EXPIRES_IN = '1h';
process.env.DEMO_PASSWORD = 'DemoPassword123';

const DEMO_PASSWORD = process.env.DEMO_PASSWORD;

let server;
let baseUrl;
let prisma;
let bcrypt;
let ids;
let tokens;
let dates;
let appointmentAId;

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

  const [{ app }, { prisma: prismaClient }, { configureDatabase }, bcryptModule, datesModule] =
    await Promise.all([
      import('../../src/app.js'),
      import('../../src/config/prisma.js'),
      import('../../src/config/prisma.js'),
      import('bcryptjs'),
      import('../../src/utils/dates.js'),
    ]);

  prisma = prismaClient;
  bcrypt = bcryptModule.default;

  await configureDatabase();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@test.local',
      passwordHash,
      name: 'Test Hospital Admin',
      role: 'HOSPITAL_ADMIN',
    },
  });

  const hospital = await prisma.hospital.create({
    data: {
      name: 'Booking Test Hospital',
      address: '1 Booking Road',
      city: 'Pune',
      phone: '+91 20 5555 5555',
      email: 'booking@test.local',
      adminId: adminUser.id,
    },
  });

  const doctorUser = await prisma.user.create({
    data: {
      email: 'alice@test.local',
      passwordHash,
      name: 'Dr. Alice Booking',
      role: 'DOCTOR',
    },
  });

  const doctor = await prisma.doctor.create({
    data: {
      userId: doctorUser.id,
      hospitalId: hospital.id,
      specialization: 'Cardiology',
      qualification: 'MBBS',
      experienceYears: 9,
      avgConsultationMinutes: 30,
      roomNumber: 'B-101',
    },
  });

  const inactiveUser = await prisma.user.create({
    data: {
      email: 'inactive@test.local',
      passwordHash,
      name: 'Dr. Inactive Booking',
      role: 'DOCTOR',
    },
  });

  const inactiveDoctor = await prisma.doctor.create({
    data: {
      userId: inactiveUser.id,
      hospitalId: hospital.id,
      specialization: 'Dermatology',
      isActive: false,
    },
  });

  // Pick a date two days ahead so no slot is in the past regardless of the
  // time of day the suite runs. The schedule is created for that weekday.
  const today = datesModule.todayDateString();
  const bookingDate = datesModule.addDaysToDateString(today, 2);
  const otherDate = datesModule.addDaysToDateString(bookingDate, 1);
  const dayOfWeek = datesModule.getDayOfWeek(bookingDate);

  await prisma.doctorSchedule.create({
    data: {
      doctorId: doctor.id,
      dayOfWeek,
      startTime: '09:00',
      endTime: '11:00',
      slotDurationMinutes: 30,
    },
  });

  // Inactive sessions must never generate bookable slots.
  await prisma.doctorSchedule.create({
    data: {
      doctorId: doctor.id,
      dayOfWeek,
      startTime: '12:00',
      endTime: '13:00',
      slotDurationMinutes: 30,
      isActive: false,
    },
  });

  async function createPatient(email, name) {
    const user = await prisma.user.create({
      data: { email, passwordHash, name, role: 'PATIENT' },
    });
    const patient = await prisma.patient.create({ data: { userId: user.id } });
    return { user, patient };
  }

  const patientA = await createPatient('patient.a@test.local', 'Patient A');
  const patientB = await createPatient('patient.b@test.local', 'Patient B');

  ids = {
    hospitalId: hospital.id,
    doctorId: doctor.id,
    inactiveDoctorId: inactiveDoctor.id,
    patientAId: patientA.patient.id,
    patientBId: patientB.patient.id,
  };

  dates = { today, bookingDate, otherDate, dayOfWeek };

  const main = await listen(app);
  server = main.httpServer;
  baseUrl = main.url;

  tokens = {
    admin: await login('admin@test.local'),
    doctor: await login('alice@test.local'),
    patientA: await login('patient.a@test.local'),
    patientB: await login('patient.b@test.local'),
  };
});

after(async () => {
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));

  if (prisma) {
    await prisma.$disconnect();
  }

  removeTestDatabase();
});

test('slots endpoint expands the active schedule into available slots', async () => {
  const response = await request(
    `/api/doctors/${ids.doctorId}/slots?date=${dates.bookingDate}`,
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.date, dates.bookingDate);
  assert.equal(response.body.dayOfWeek, dates.dayOfWeek);
  assert.equal(response.body.isPast, false);
  assert.equal(response.body.doctor.name, 'Dr. Alice Booking');
  assert.equal(response.body.doctor.hospital.name, 'Booking Test Hospital');

  assert.deepEqual(
    response.body.sessions.map((session) => session.startTime),
    ['09:00'],
  );
  assert.deepEqual(
    response.body.slots.map((slot) => slot.time),
    ['09:00', '09:30', '10:00', '10:30'],
  );
  assert.ok(response.body.slots.every((slot) => slot.available));
  assert.ok(response.body.slots.every((slot) => slot.durationMinutes === 30));
});

test('slots endpoint returns an empty grid on a day with no sessions', async () => {
  const response = await request(
    `/api/doctors/${ids.doctorId}/slots?date=${dates.otherDate}`,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.sessions, []);
  assert.deepEqual(response.body.slots, []);
});

test('slots endpoint rejects a malformed date and hides inactive doctors', async () => {
  const invalid = await request(
    `/api/doctors/${ids.doctorId}/slots?date=not-a-date`,
  );
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error.details.date, 'Date must use the YYYY-MM-DD format.');

  const missing = await request(`/api/doctors/${ids.doctorId}/slots`);
  assert.equal(missing.status, 400);

  const inactive = await request(
    `/api/doctors/${ids.inactiveDoctorId}/slots?date=${dates.bookingDate}`,
  );
  assert.equal(inactive.status, 404);
});

test('slots endpoint marks a past date as unavailable', async () => {
  const yesterday = (await import('../../src/utils/dates.js')).addDaysToDateString(
    dates.today,
    -1,
  );

  const response = await request(
    `/api/doctors/${ids.doctorId}/slots?date=${yesterday}`,
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.isPast, true);
  assert.ok(response.body.slots.every((slot) => slot.available === false));
});

test('booking requires a patient account', async () => {
  const anonymous = await request('/api/appointments', {
    method: 'POST',
    body: {
      doctorId: ids.doctorId,
      date: dates.bookingDate,
      slotTime: '09:00',
    },
  });
  assert.equal(anonymous.status, 401);

  const doctor = await request('/api/appointments', {
    method: 'POST',
    token: tokens.doctor,
    body: {
      doctorId: ids.doctorId,
      date: dates.bookingDate,
      slotTime: '09:00',
    },
  });
  assert.equal(doctor.status, 403);

  const admin = await request('/api/appointments', {
    method: 'POST',
    token: tokens.admin,
    body: {
      doctorId: ids.doctorId,
      date: dates.bookingDate,
      slotTime: '09:00',
    },
  });
  assert.equal(admin.status, 403);
});

test('a patient books a generated slot and the slot becomes unavailable', async () => {
  const response = await request('/api/appointments', {
    method: 'POST',
    token: tokens.patientA,
    body: {
      doctorId: ids.doctorId,
      date: dates.bookingDate,
      slotTime: '09:00',
      reason: 'Chest pain follow-up',
    },
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.appointment.status, 'BOOKED');
  assert.equal(response.body.appointment.date, dates.bookingDate);
  assert.equal(response.body.appointment.slotTime, '09:00');
  assert.equal(response.body.appointment.reason, 'Chest pain follow-up');
  assert.equal(response.body.appointment.doctor.name, 'Dr. Alice Booking');
  assert.equal(response.body.appointment.hospital.name, 'Booking Test Hospital');
  assert.equal('slotKey' in response.body.appointment, false);
  assert.equal('patientId' in response.body.appointment, false);

  appointmentAId = response.body.appointment.id;

  const stored = await prisma.appointment.findUnique({
    where: { id: appointmentAId },
    select: { slotKey: true, status: true, patientId: true },
  });
  assert.equal(stored.status, 'BOOKED');
  assert.equal(stored.patientId, ids.patientAId);
  assert.equal(
    stored.slotKey,
    `${ids.doctorId}|${dates.bookingDate}|09:00`,
  );

  const slots = await request(
    `/api/doctors/${ids.doctorId}/slots?date=${dates.bookingDate}`,
  );
  const nine = slots.body.slots.find((slot) => slot.time === '09:00');
  const nineThirty = slots.body.slots.find((slot) => slot.time === '09:30');
  assert.equal(nine.available, false);
  assert.equal(nineThirty.available, true);
});

test('the same patient cannot book the same slot twice', async () => {
  const response = await request('/api/appointments', {
    method: 'POST',
    token: tokens.patientA,
    body: {
      doctorId: ids.doctorId,
      date: dates.bookingDate,
      slotTime: '09:00',
    },
  });

  assert.equal(response.status, 409);
  assert.match(response.body.error.message, /no longer available/i);
});

test('a second patient cannot book an occupied slot', async () => {
  const response = await request('/api/appointments', {
    method: 'POST',
    token: tokens.patientB,
    body: {
      doctorId: ids.doctorId,
      date: dates.bookingDate,
      slotTime: '09:00',
    },
  });

  assert.equal(response.status, 409);
});

test('booking rejects times that are not on the generated grid', async () => {
  const response = await request('/api/appointments', {
    method: 'POST',
    token: tokens.patientA,
    body: {
      doctorId: ids.doctorId,
      date: dates.bookingDate,
      slotTime: '09:10',
    },
  });

  assert.equal(response.status, 400);
  assert.ok(response.body.error.details.slotTime);
});

test('booking rejects past dates and dates beyond the booking window', async () => {
  const past = await request('/api/appointments', {
    method: 'POST',
    token: tokens.patientA,
    body: {
      doctorId: ids.doctorId,
      date: '2020-01-01',
      slotTime: '09:00',
    },
  });
  assert.equal(past.status, 400);
  assert.match(past.body.error.details.date, /past date/i);

  const { addDaysToDateString } = await import('../../src/utils/dates.js');
  const tooFar = addDaysToDateString(dates.today, 31);
  const far = await request('/api/appointments', {
    method: 'POST',
    token: tokens.patientA,
    body: {
      doctorId: ids.doctorId,
      date: tooFar,
      slotTime: '09:00',
    },
  });
  assert.equal(far.status, 400);
  assert.match(far.body.error.details.date, /30 days ahead/i);
});

test('booking rejects inactive doctors and days without sessions', async () => {
  const inactive = await request('/api/appointments', {
    method: 'POST',
    token: tokens.patientA,
    body: {
      doctorId: ids.inactiveDoctorId,
      date: dates.bookingDate,
      slotTime: '09:00',
    },
  });
  assert.equal(inactive.status, 404);

  const closed = await request('/api/appointments', {
    method: 'POST',
    token: tokens.patientA,
    body: {
      doctorId: ids.doctorId,
      date: dates.otherDate,
      slotTime: '09:00',
    },
  });
  assert.equal(closed.status, 400);
});

test('my-appointments only returns the signed-in patient’s bookings', async () => {
  const secondBooking = await request('/api/appointments', {
    method: 'POST',
    token: tokens.patientB,
    body: {
      doctorId: ids.doctorId,
      date: dates.bookingDate,
      slotTime: '09:30',
    },
  });
  assert.equal(secondBooking.status, 201);

  const mineA = await request('/api/appointments/mine', { token: tokens.patientA });
  assert.equal(mineA.status, 200);
  assert.equal(mineA.body.appointments.length, 1);
  assert.equal(mineA.body.appointments[0].id, appointmentAId);

  const mineB = await request('/api/appointments/mine', { token: tokens.patientB });
  assert.equal(mineB.status, 200);
  assert.equal(mineB.body.appointments.length, 1);
  assert.equal(mineB.body.appointments[0].slotTime, '09:30');

  const anonymous = await request('/api/appointments/mine');
  assert.equal(anonymous.status, 401);
});

test('a patient cannot cancel another patient’s appointment', async () => {
  const response = await request(`/api/appointments/${appointmentAId}/cancel`, {
    method: 'PATCH',
    token: tokens.patientB,
  });

  assert.equal(response.status, 404);
});

test('cancelling an appointment frees its slot for rebooking', async () => {
  const response = await request(`/api/appointments/${appointmentAId}/cancel`, {
    method: 'PATCH',
    token: tokens.patientA,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.appointment.status, 'CANCELLED');
  assert.ok(response.body.appointment.cancelledAt);

  const stored = await prisma.appointment.findUnique({
    where: { id: appointmentAId },
    select: { slotKey: true, status: true },
  });
  assert.equal(stored.status, 'CANCELLED');
  assert.equal(stored.slotKey, null);

  const slots = await request(
    `/api/doctors/${ids.doctorId}/slots?date=${dates.bookingDate}`,
  );
  assert.equal(
    slots.body.slots.find((slot) => slot.time === '09:00').available,
    true,
  );

  const rebook = await request('/api/appointments', {
    method: 'POST',
    token: tokens.patientB,
    body: {
      doctorId: ids.doctorId,
      date: dates.bookingDate,
      slotTime: '09:00',
    },
  });
  assert.equal(rebook.status, 201);
});

test('an appointment cannot be cancelled twice', async () => {
  const response = await request(`/api/appointments/${appointmentAId}/cancel`, {
    method: 'PATCH',
    token: tokens.patientA,
  });

  assert.equal(response.status, 409);
});

test('cancelling an unknown appointment returns 404', async () => {
  const response = await request('/api/appointments/does-not-exist/cancel', {
    method: 'PATCH',
    token: tokens.patientA,
  });

  assert.equal(response.status, 404);
});
