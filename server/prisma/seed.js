/**
 * Full demo seed for MediQueue.
 *
 * Creates a realistic multi-hospital dataset:
 * - 1 platform administrator
 * - 3 hospitals, each with its own administrator
 * - 6 doctors (2 per hospital) with weekly schedules
 * - 12 patients
 * - past, today and future appointments in mixed states
 * - four live queues today (completed, no-show, in consultation, waiting, emergency)
 * - one active doctor delay and a set of notifications
 *
 * The seed is idempotent: it clears every table first, then recreates the data.
 * Run with: npm run db:seed
 * Requires server/.env (created by npm run setup:env) for DEMO_PASSWORD.
 *
 * Live queues are held in memory and rebuilt from SQLite when the API starts,
 * so restart the API server after reseeding if it is already running.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const demoPassword = process.env.DEMO_PASSWORD;

if (!demoPassword) {
  console.error('DEMO_PASSWORD is missing. Run `npm run setup:env` first.');
  process.exit(1);
}

const MINUTE = 60 * 1000;

function minutesAgo(minutes) {
  return new Date(Date.now() - minutes * MINUTE);
}

function toLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shiftDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toLocalDateString(date);
}

function makeSlotKey(doctorId, date, slotTime) {
  return `${doctorId}|${date}|${slotTime}`;
}

/* ------------------------------------------------------------------ */
/* Static demo data                                                    */
/* ------------------------------------------------------------------ */

const HOSPITALS = [
  {
    key: 'citycare',
    name: 'City Care Hospital',
    address: '12 MG Road',
    city: 'Pune',
    phone: '+91 20 4000 1000',
    email: 'contact@citycare.local',
    description:
      'A multi-speciality hospital with a focus on cardiology and general medicine.',
    admin: {
      email: 'admin@citycare.local',
      name: 'Riya Kapoor',
      phone: '+91 98765 10001',
    },
  },
  {
    key: 'sunrise',
    name: 'Sunrise Multispeciality Hospital',
    address: '45 Marine Drive',
    city: 'Mumbai',
    phone: '+91 22 4000 2000',
    email: 'contact@sunrise.local',
    description:
      'A coastal multi-speciality hospital known for orthopaedics and dermatology.',
    admin: {
      email: 'admin@sunrise.local',
      name: 'Vikram Rao',
      phone: '+91 98765 10002',
    },
  },
  {
    key: 'greenvalley',
    name: 'Green Valley Clinic',
    address: '8 College Road',
    city: 'Nashik',
    phone: '+91 253 4000 3000',
    email: 'contact@greenvalley.local',
    description:
      'A neighbourhood clinic offering paediatric and ENT care with short waiting times.',
    admin: {
      email: 'admin@greenvalley.local',
      name: 'Neha Deshmukh',
      phone: '+91 98765 10003',
    },
  },
];

const DOCTORS = [
  {
    key: 'arjun',
    hospital: 'citycare',
    email: 'dr.arjun@citycare.local',
    name: 'Dr. Arjun Mehta',
    phone: '+91 98765 20001',
    specialization: 'Cardiology',
    qualification: 'MBBS, MD (Cardiology)',
    experienceYears: 12,
    avgConsultationMinutes: 15,
    roomNumber: 'C-204',
    bio: 'Cardiologist with 12 years of clinical experience and a focus on preventive care.',
    schedule: { startTime: '09:00', endTime: '17:00', slotDurationMinutes: 15 },
  },
  {
    key: 'sneha',
    hospital: 'citycare',
    email: 'dr.sneha@citycare.local',
    name: 'Dr. Sneha Iyer',
    phone: '+91 98765 20002',
    specialization: 'General Medicine',
    qualification: 'MBBS, MD (Internal Medicine)',
    experienceYears: 9,
    avgConsultationMinutes: 12,
    roomNumber: 'C-101',
    bio: 'General physician handling fevers, infections and long-term conditions.',
    schedule: { startTime: '09:00', endTime: '16:00', slotDurationMinutes: 20 },
  },
  {
    key: 'rohan',
    hospital: 'sunrise',
    email: 'dr.rohan@sunrise.local',
    name: 'Dr. Rohan Kulkarni',
    phone: '+91 98765 20003',
    specialization: 'Orthopaedics',
    qualification: 'MBBS, MS (Orthopaedics)',
    experienceYears: 15,
    avgConsultationMinutes: 20,
    roomNumber: 'S-302',
    bio: 'Orthopaedic surgeon specialising in joint replacement and sports injuries.',
    schedule: { startTime: '09:00', endTime: '14:00', slotDurationMinutes: 30 },
  },
  {
    key: 'priya',
    hospital: 'sunrise',
    email: 'dr.priya@sunrise.local',
    name: 'Dr. Priya Nair',
    phone: '+91 98765 20004',
    specialization: 'Dermatology',
    qualification: 'MBBS, MD (Dermatology)',
    experienceYears: 7,
    avgConsultationMinutes: 10,
    roomNumber: 'S-105',
    bio: 'Dermatologist treating skin allergies, acne and hair loss.',
    schedule: { startTime: '10:00', endTime: '16:00', slotDurationMinutes: 15 },
  },
  {
    key: 'imran',
    hospital: 'greenvalley',
    email: 'dr.imran@greenvalley.local',
    name: 'Dr. Imran Sheikh',
    phone: '+91 98765 20005',
    specialization: 'Pediatrics',
    qualification: 'MBBS, DCH',
    experienceYears: 11,
    avgConsultationMinutes: 15,
    roomNumber: 'G-201',
    bio: 'Paediatrician caring for newborns, children and adolescents.',
    schedule: { startTime: '09:30', endTime: '16:30', slotDurationMinutes: 15 },
  },
  {
    key: 'kavita',
    hospital: 'greenvalley',
    email: 'dr.kavita@greenvalley.local',
    name: 'Dr. Kavita Joshi',
    phone: '+91 98765 20006',
    specialization: 'ENT',
    qualification: 'MBBS, MS (ENT)',
    experienceYears: 8,
    avgConsultationMinutes: 12,
    roomNumber: 'G-104',
    bio: 'ENT specialist for ear infections, sinus problems and hearing loss.',
    schedule: { startTime: '09:00', endTime: '13:00', slotDurationMinutes: 20 },
  },
];

const PATIENTS = [
  {
    key: 'aarav',
    email: 'patient@example.com',
    name: 'Aarav Sharma',
    phone: '+91 98765 30001',
    dateOfBirth: '1994-06-14',
    gender: 'Male',
    bloodGroup: 'O+',
  },
  {
    key: 'diya',
    email: 'patient2@example.com',
    name: 'Diya Patel',
    phone: '+91 98765 30002',
    dateOfBirth: '1991-02-20',
    gender: 'Female',
    bloodGroup: 'A+',
  },
  {
    key: 'vivaan',
    email: 'patient3@example.com',
    name: 'Vivaan Gupta',
    phone: '+91 98765 30003',
    dateOfBirth: '1988-11-05',
    gender: 'Male',
    bloodGroup: 'B+',
  },
  {
    key: 'ananya',
    email: 'patient4@example.com',
    name: 'Ananya Rao',
    phone: '+91 98765 30004',
    dateOfBirth: '1996-08-12',
    gender: 'Female',
    bloodGroup: 'AB+',
  },
  {
    key: 'kabir',
    email: 'patient5@example.com',
    name: 'Kabir Singh',
    phone: '+91 98765 30005',
    dateOfBirth: '1985-03-28',
    gender: 'Male',
    bloodGroup: 'O-',
  },
  {
    key: 'meera',
    email: 'patient6@example.com',
    name: 'Meera Joshi',
    phone: '+91 98765 30006',
    dateOfBirth: '1999-12-01',
    gender: 'Female',
    bloodGroup: 'A-',
  },
  {
    key: 'aditya',
    email: 'patient7@example.com',
    name: 'Aditya Verma',
    phone: '+91 98765 30007',
    dateOfBirth: '1993-07-19',
    gender: 'Male',
    bloodGroup: 'B-',
  },
  {
    key: 'ishita',
    email: 'patient8@example.com',
    name: 'Ishita Nair',
    phone: '+91 98765 30008',
    dateOfBirth: '1997-05-09',
    gender: 'Female',
    bloodGroup: 'O+',
  },
  {
    key: 'riya',
    email: 'patient9@example.com',
    name: 'Riya Menon',
    phone: '+91 98765 30009',
    dateOfBirth: '1990-09-23',
    gender: 'Female',
    bloodGroup: 'AB-',
  },
  {
    key: 'arnav',
    email: 'patient10@example.com',
    name: 'Arnav Deshmukh',
    phone: '+91 98765 30010',
    dateOfBirth: '1987-01-16',
    gender: 'Male',
    bloodGroup: 'A+',
  },
  {
    key: 'sara',
    email: 'patient11@example.com',
    name: 'Sara Khan',
    phone: '+91 98765 30011',
    dateOfBirth: '2001-04-30',
    gender: 'Female',
    bloodGroup: 'B+',
  },
  {
    key: 'neel',
    email: 'patient12@example.com',
    name: 'Neel Kapoor',
    phone: '+91 98765 30012',
    dateOfBirth: '1992-10-11',
    gender: 'Male',
    bloodGroup: 'O+',
  },
];

/* ------------------------------------------------------------------ */
/* Seed helpers                                                        */
/* ------------------------------------------------------------------ */

async function createAppointment({
  patient,
  doctor,
  date,
  slotTime,
  status = 'BOOKED',
  isEmergency = false,
  reason = null,
  bookedAt = minutesAgo(60 * 24),
  checkedInAt = null,
  calledAt = null,
  startedAt = null,
  completedAt = null,
  cancelledAt = null,
  noShowAt = null,
}) {
  // A cancelled booking frees its slot, so it keeps the time but drops the key.
  const slotKey =
    slotTime === null || status === 'CANCELLED'
      ? null
      : makeSlotKey(doctor.id, date, slotTime);

  return prisma.appointment.create({
    data: {
      patientId: patient.id,
      doctorId: doctor.id,
      date,
      slotTime,
      slotKey,
      status,
      isEmergency,
      reason,
      bookedAt,
      checkedInAt,
      calledAt,
      startedAt,
      completedAt,
      cancelledAt,
      noShowAt,
    },
  });
}

async function createQueueEntry({
  appointment,
  doctor,
  patient,
  tokenNumber,
  priority = 1,
  status = 'WAITING',
  checkedInAt,
  calledAt = null,
  startedAt = null,
  completedAt = null,
  noShowAt = null,
}) {
  return prisma.queueEntry.create({
    data: {
      doctorId: doctor.id,
      patientId: patient.id,
      appointmentId: appointment.id,
      queueDate: appointment.date,
      tokenNumber,
      priority,
      status,
      checkedInAt,
      calledAt,
      startedAt,
      completedAt,
      noShowAt,
    },
  });
}

async function createNotification({
  user,
  title,
  message,
  type,
  isRead = false,
  appointmentId = null,
  createdAt = new Date(),
}) {
  return prisma.notification.create({
    data: {
      userId: user.id,
      title,
      message,
      type,
      isRead,
      appointmentId,
      createdAt,
    },
  });
}

/* ------------------------------------------------------------------ */
/* Seed                                                               */
/* ------------------------------------------------------------------ */

async function main() {
  const passwordHash = await bcrypt.hash(demoPassword, 10);

  // Clear in dependency order so the seed can be run repeatedly.
  await prisma.$transaction([
    prisma.notification.deleteMany(),
    prisma.delayReport.deleteMany(),
    prisma.queueEntry.deleteMany(),
    prisma.appointment.deleteMany(),
    prisma.doctorSchedule.deleteMany(),
    prisma.doctor.deleteMany(),
    prisma.hospital.deleteMany(),
    prisma.patient.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  /* Platform administrator ------------------------------------------ */
  const platformAdmin = await prisma.user.create({
    data: {
      email: 'platform@mediqueue.local',
      passwordHash,
      name: 'Platform Administrator',
      role: 'PLATFORM_ADMIN',
    },
  });

  /* Hospitals and their administrators ------------------------------ */
  const hospitals = {};
  for (const entry of HOSPITALS) {
    const adminUser = await prisma.user.create({
      data: {
        email: entry.admin.email,
        passwordHash,
        name: entry.admin.name,
        phone: entry.admin.phone,
        role: 'HOSPITAL_ADMIN',
      },
    });

    const hospital = await prisma.hospital.create({
      data: {
        name: entry.name,
        address: entry.address,
        city: entry.city,
        phone: entry.phone,
        email: entry.email,
        description: entry.description,
        adminId: adminUser.id,
      },
    });

    hospitals[entry.key] = { ...hospital, adminUser };
  }

  /* Doctors and weekly schedules ------------------------------------ */
  // Every doctor is available on every weekday so the demo works on any day.
  const doctors = {};
  for (const entry of DOCTORS) {
    const doctorUser = await prisma.user.create({
      data: {
        email: entry.email,
        passwordHash,
        name: entry.name,
        phone: entry.phone,
        role: 'DOCTOR',
      },
    });

    const doctor = await prisma.doctor.create({
      data: {
        userId: doctorUser.id,
        hospitalId: hospitals[entry.hospital].id,
        specialization: entry.specialization,
        qualification: entry.qualification,
        experienceYears: entry.experienceYears,
        avgConsultationMinutes: entry.avgConsultationMinutes,
        roomNumber: entry.roomNumber,
        bio: entry.bio,
      },
    });

    for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek += 1) {
      await prisma.doctorSchedule.create({
        data: {
          doctorId: doctor.id,
          dayOfWeek,
          startTime: entry.schedule.startTime,
          endTime: entry.schedule.endTime,
          slotDurationMinutes: entry.schedule.slotDurationMinutes,
        },
      });
    }

    doctors[entry.key] = { ...doctor, user: doctorUser };
  }

  /* Patients --------------------------------------------------------- */
  const patients = {};
  for (const entry of PATIENTS) {
    const patientUser = await prisma.user.create({
      data: {
        email: entry.email,
        passwordHash,
        name: entry.name,
        phone: entry.phone,
        role: 'PATIENT',
      },
    });

    const patient = await prisma.patient.create({
      data: {
        userId: patientUser.id,
        dateOfBirth: entry.dateOfBirth,
        gender: entry.gender,
        bloodGroup: entry.bloodGroup,
      },
    });

    patients[entry.key] = { ...patient, user: patientUser };
  }

  const today = toLocalDateString();
  const yesterday = shiftDate(-1);
  const tomorrow = shiftDate(1);
  const inTwoDays = shiftDate(2);
  const inThreeDays = shiftDate(3);

  /* Past appointments ------------------------------------------------ */
  await createAppointment({
    patient: patients.diya,
    doctor: doctors.arjun,
    date: yesterday,
    slotTime: '10:00',
    status: 'COMPLETED',
    reason: 'Chest tightness follow-up',
    bookedAt: minutesAgo(60 * 48),
    checkedInAt: minutesAgo(60 * 30),
    calledAt: minutesAgo(60 * 29),
    startedAt: minutesAgo(60 * 28),
    completedAt: minutesAgo(60 * 28 - 15),
  });
  await createAppointment({
    patient: patients.ananya,
    doctor: doctors.sneha,
    date: yesterday,
    slotTime: '11:00',
    status: 'COMPLETED',
    reason: 'Viral fever',
    bookedAt: minutesAgo(60 * 40),
    checkedInAt: minutesAgo(60 * 26),
    calledAt: minutesAgo(60 * 25),
    startedAt: minutesAgo(60 * 24),
    completedAt: minutesAgo(60 * 24 - 12),
  });
  await createAppointment({
    patient: patients.neel,
    doctor: doctors.rohan,
    date: yesterday,
    slotTime: '09:30',
    status: 'NO_SHOW',
    reason: 'Knee pain',
    bookedAt: minutesAgo(60 * 50),
    checkedInAt: null,
    noShowAt: minutesAgo(60 * 27),
  });
  await createAppointment({
    patient: patients.riya,
    doctor: doctors.priya,
    date: yesterday,
    slotTime: '15:00',
    status: 'CANCELLED',
    reason: 'Skin allergy',
    bookedAt: minutesAgo(60 * 52),
    cancelledAt: minutesAgo(60 * 45),
  });
  await createAppointment({
    patient: patients.kabir,
    doctor: doctors.kavita,
    date: yesterday,
    slotTime: '12:30',
    status: 'COMPLETED',
    reason: 'Ear pain',
    bookedAt: minutesAgo(60 * 44),
    checkedInAt: minutesAgo(60 * 31),
    calledAt: minutesAgo(60 * 30),
    startedAt: minutesAgo(60 * 30 - 3),
    completedAt: minutesAgo(60 * 30 - 15),
  });

  /* Today's live queues ---------------------------------------------- */

  // City Care — Dr. Arjun Mehta: completed, no-show, in consultation,
  // two waiting (one emergency) and one booked patient.
  const arjunCompletedAppointment = await createAppointment({
    patient: patients.diya,
    doctor: doctors.arjun,
    date: today,
    slotTime: '09:00',
    status: 'COMPLETED',
    reason: 'Routine cardiac check-up',
    bookedAt: minutesAgo(60 * 20),
    checkedInAt: minutesAgo(100),
    calledAt: minutesAgo(85),
    startedAt: minutesAgo(80),
    completedAt: minutesAgo(65),
  });
  await createQueueEntry({
    appointment: arjunCompletedAppointment,
    doctor: doctors.arjun,
    patient: patients.diya,
    tokenNumber: 1,
    status: 'COMPLETED',
    checkedInAt: minutesAgo(100),
    calledAt: minutesAgo(85),
    startedAt: minutesAgo(80),
    completedAt: minutesAgo(65),
  });

  const arjunNoShowAppointment = await createAppointment({
    patient: patients.vivaan,
    doctor: doctors.arjun,
    date: today,
    slotTime: '09:15',
    status: 'NO_SHOW',
    reason: 'Blood pressure review',
    bookedAt: minutesAgo(60 * 18),
    checkedInAt: minutesAgo(95),
    noShowAt: minutesAgo(75),
  });
  await createQueueEntry({
    appointment: arjunNoShowAppointment,
    doctor: doctors.arjun,
    patient: patients.vivaan,
    tokenNumber: 2,
    status: 'NO_SHOW',
    checkedInAt: minutesAgo(95),
    noShowAt: minutesAgo(75),
  });

  const arjunCurrentAppointment = await createAppointment({
    patient: patients.ananya,
    doctor: doctors.arjun,
    date: today,
    slotTime: '09:30',
    status: 'IN_CONSULTATION',
    reason: 'Palpitations',
    bookedAt: minutesAgo(60 * 16),
    checkedInAt: minutesAgo(70),
    calledAt: minutesAgo(45),
    startedAt: minutesAgo(20),
  });
  await createQueueEntry({
    appointment: arjunCurrentAppointment,
    doctor: doctors.arjun,
    patient: patients.ananya,
    tokenNumber: 3,
    status: 'IN_CONSULTATION',
    checkedInAt: minutesAgo(70),
    calledAt: minutesAgo(45),
    startedAt: minutesAgo(20),
  });

  const arjunWaitingAppointment = await createAppointment({
    patient: patients.kabir,
    doctor: doctors.arjun,
    date: today,
    slotTime: '09:45',
    status: 'CHECKED_IN',
    reason: 'Post-surgery review',
    bookedAt: minutesAgo(60 * 14),
    checkedInAt: minutesAgo(30),
  });
  await createQueueEntry({
    appointment: arjunWaitingAppointment,
    doctor: doctors.arjun,
    patient: patients.kabir,
    tokenNumber: 4,
    status: 'WAITING',
    checkedInAt: minutesAgo(30),
  });

  const arjunEmergencyAppointment = await createAppointment({
    patient: patients.meera,
    doctor: doctors.arjun,
    date: today,
    slotTime: null,
    status: 'CHECKED_IN',
    isEmergency: true,
    reason: 'Severe chest pain',
    bookedAt: minutesAgo(12),
    checkedInAt: minutesAgo(12),
  });
  await createQueueEntry({
    appointment: arjunEmergencyAppointment,
    doctor: doctors.arjun,
    patient: patients.meera,
    tokenNumber: 5,
    priority: 0,
    status: 'WAITING',
    checkedInAt: minutesAgo(12),
  });

  const aaravTodayAppointment = await createAppointment({
    patient: patients.aarav,
    doctor: doctors.arjun,
    date: today,
    slotTime: '10:00',
    status: 'BOOKED',
    reason: 'Routine cardiac check-up',
    bookedAt: minutesAgo(60 * 12),
  });

  // City Care — Dr. Sneha Iyer: two waiting patients and one later booking.
  const snehaWaiting1 = await createAppointment({
    patient: patients.aditya,
    doctor: doctors.sneha,
    date: today,
    slotTime: '10:00',
    status: 'CHECKED_IN',
    reason: 'Persistent cough',
    bookedAt: minutesAgo(60 * 10),
    checkedInAt: minutesAgo(35),
  });
  await createQueueEntry({
    appointment: snehaWaiting1,
    doctor: doctors.sneha,
    patient: patients.aditya,
    tokenNumber: 1,
    status: 'WAITING',
    checkedInAt: minutesAgo(35),
  });

  const snehaWaiting2 = await createAppointment({
    patient: patients.ishita,
    doctor: doctors.sneha,
    date: today,
    slotTime: '10:20',
    status: 'CHECKED_IN',
    reason: 'Migraine',
    bookedAt: minutesAgo(60 * 9),
    checkedInAt: minutesAgo(18),
  });
  await createQueueEntry({
    appointment: snehaWaiting2,
    doctor: doctors.sneha,
    patient: patients.ishita,
    tokenNumber: 2,
    status: 'WAITING',
    checkedInAt: minutesAgo(18),
  });

  await createAppointment({
    patient: patients.neel,
    doctor: doctors.sneha,
    date: today,
    slotTime: '11:30',
    status: 'BOOKED',
    reason: 'Annual health check',
    bookedAt: minutesAgo(60 * 7),
  });

  // Sunrise — Dr. Rohan Kulkarni: one called patient and one waiting.
  const rohanCalled = await createAppointment({
    patient: patients.riya,
    doctor: doctors.rohan,
    date: today,
    slotTime: '09:30',
    status: 'CALLED',
    reason: 'Shoulder injury',
    bookedAt: minutesAgo(60 * 15),
    checkedInAt: minutesAgo(50),
    calledAt: minutesAgo(8),
  });
  await createQueueEntry({
    appointment: rohanCalled,
    doctor: doctors.rohan,
    patient: patients.riya,
    tokenNumber: 1,
    status: 'CALLED',
    checkedInAt: minutesAgo(50),
    calledAt: minutesAgo(8),
  });

  const rohanWaiting = await createAppointment({
    patient: patients.arnav,
    doctor: doctors.rohan,
    date: today,
    slotTime: '10:00',
    status: 'CHECKED_IN',
    reason: 'Lower back pain',
    bookedAt: minutesAgo(60 * 11),
    checkedInAt: minutesAgo(20),
  });
  await createQueueEntry({
    appointment: rohanWaiting,
    doctor: doctors.rohan,
    patient: patients.arnav,
    tokenNumber: 2,
    status: 'WAITING',
    checkedInAt: minutesAgo(20),
  });

  // Green Valley — Dr. Imran Sheikh: one waiting patient.
  const imranWaiting = await createAppointment({
    patient: patients.sara,
    doctor: doctors.imran,
    date: today,
    slotTime: '10:15',
    status: 'CHECKED_IN',
    reason: 'Child vaccination',
    bookedAt: minutesAgo(60 * 8),
    checkedInAt: minutesAgo(25),
  });
  await createQueueEntry({
    appointment: imranWaiting,
    doctor: doctors.imran,
    patient: patients.sara,
    tokenNumber: 1,
    status: 'WAITING',
    checkedInAt: minutesAgo(25),
  });

  /* Future appointments --------------------------------------------- */
  await createAppointment({
    patient: patients.aarav,
    doctor: doctors.sneha,
    date: tomorrow,
    slotTime: '11:00',
    status: 'BOOKED',
    reason: 'Fever and fatigue',
    bookedAt: minutesAgo(60 * 6),
  });
  await createAppointment({
    patient: patients.diya,
    doctor: doctors.priya,
    date: tomorrow,
    slotTime: '10:30',
    status: 'BOOKED',
    reason: 'Skin allergy',
    bookedAt: minutesAgo(60 * 5),
  });
  await createAppointment({
    patient: patients.vivaan,
    doctor: doctors.rohan,
    date: tomorrow,
    slotTime: '09:30',
    status: 'BOOKED',
    reason: 'Knee pain',
    bookedAt: minutesAgo(60 * 5),
  });
  await createAppointment({
    patient: patients.ananya,
    doctor: doctors.imran,
    date: tomorrow,
    slotTime: '15:00',
    status: 'BOOKED',
    reason: 'Child wellness visit',
    bookedAt: minutesAgo(60 * 4),
  });
  await createAppointment({
    patient: patients.kabir,
    doctor: doctors.kavita,
    date: tomorrow,
    slotTime: '11:00',
    status: 'BOOKED',
    reason: 'Sinus congestion',
    bookedAt: minutesAgo(60 * 4),
  });
  await createAppointment({
    patient: patients.meera,
    doctor: doctors.arjun,
    date: inTwoDays,
    slotTime: '09:30',
    status: 'BOOKED',
    reason: 'ECG review',
    bookedAt: minutesAgo(60 * 3),
  });
  await createAppointment({
    patient: patients.aditya,
    doctor: doctors.priya,
    date: inTwoDays,
    slotTime: '14:00',
    status: 'BOOKED',
    reason: 'Acne treatment',
    bookedAt: minutesAgo(60 * 3),
  });
  await createAppointment({
    patient: patients.ishita,
    doctor: doctors.rohan,
    date: inTwoDays,
    slotTime: '10:00',
    status: 'BOOKED',
    reason: 'Ankle sprain',
    bookedAt: minutesAgo(60 * 2),
  });
  await createAppointment({
    patient: patients.riya,
    doctor: doctors.imran,
    date: inThreeDays,
    slotTime: '11:30',
    status: 'BOOKED',
    reason: 'Vaccination booster',
    bookedAt: minutesAgo(60 * 2),
  });
  await createAppointment({
    patient: patients.arnav,
    doctor: doctors.kavita,
    date: inThreeDays,
    slotTime: '12:00',
    status: 'BOOKED',
    reason: 'Hearing test',
    bookedAt: minutesAgo(60),
  });
  await createAppointment({
    patient: patients.sara,
    doctor: doctors.arjun,
    date: inThreeDays,
    slotTime: '15:30',
    status: 'BOOKED',
    reason: 'Blood pressure review',
    bookedAt: minutesAgo(60),
  });
  await createAppointment({
    patient: patients.neel,
    doctor: doctors.sneha,
    date: inThreeDays,
    slotTime: '09:00',
    status: 'BOOKED',
    reason: 'Diabetes follow-up',
    bookedAt: minutesAgo(30),
  });

  /* Active delay ----------------------------------------------------- */
  await prisma.delayReport.create({
    data: {
      doctorId: doctors.arjun.id,
      date: today,
      delayMinutes: 15,
      reason: 'Emergency procedure running long',
      isActive: true,
      createdAt: minutesAgo(15),
    },
  });

  /* Notifications ---------------------------------------------------- */
  await createNotification({
    user: patients.aarav.user,
    title: 'Welcome to MediQueue',
    message:
      'Your account is ready. Browse hospitals and book your first appointment.',
    type: 'SYSTEM',
    createdAt: minutesAgo(60 * 24),
  });
  await createNotification({
    user: patients.aarav.user,
    title: 'Appointment confirmed',
    message:
      'Your appointment with Dr. Arjun Mehta today at 10:00 is confirmed. Check in when you arrive.',
    type: 'APPOINTMENT',
    appointmentId: aaravTodayAppointment.id,
    createdAt: minutesAgo(60 * 12),
  });
  await createNotification({
    user: patients.diya.user,
    title: 'Consultation completed',
    message: 'Your consultation with Dr. Arjun Mehta is complete. Get well soon.',
    type: 'QUEUE',
    appointmentId: arjunCompletedAppointment.id,
    isRead: true,
    createdAt: minutesAgo(65),
  });
  await createNotification({
    user: patients.ananya.user,
    title: "It's your turn",
    message: 'Token #3 has been called. Please proceed to the doctor’s room.',
    type: 'QUEUE',
    appointmentId: arjunCurrentAppointment.id,
    createdAt: minutesAgo(45),
  });
  await createNotification({
    user: patients.kabir.user,
    title: 'Checked in',
    message: 'You are checked in. Your token number is #4.',
    type: 'QUEUE',
    appointmentId: arjunWaitingAppointment.id,
    createdAt: minutesAgo(30),
  });
  await createNotification({
    user: patients.kabir.user,
    title: 'Doctor delay update',
    message:
      'The doctor has reported a 15-minute delay. Emergency procedure running long',
    type: 'DELAY',
    appointmentId: arjunWaitingAppointment.id,
    createdAt: minutesAgo(15),
  });
  await createNotification({
    user: patients.meera.user,
    title: 'Emergency added to queue',
    message:
      'You have been added as an emergency patient. Your token number is #5.',
    type: 'EMERGENCY',
    appointmentId: arjunEmergencyAppointment.id,
    createdAt: minutesAgo(12),
  });
  await createNotification({
    user: patients.riya.user,
    title: "It's your turn",
    message: 'Token #1 has been called. Please proceed to the doctor’s room.',
    type: 'QUEUE',
    appointmentId: rohanCalled.id,
    createdAt: minutesAgo(8),
  });
  await createNotification({
    user: patients.sara.user,
    title: 'Checked in',
    message: 'You are checked in. Your token number is #1.',
    type: 'QUEUE',
    appointmentId: imranWaiting.id,
    isRead: true,
    createdAt: minutesAgo(25),
  });
  await createNotification({
    user: hospitals.citycare.adminUser,
    title: 'Welcome to MediQueue',
    message:
      'Your hospital workspace is ready. Manage doctors, schedules and monitor live queues.',
    type: 'SYSTEM',
    isRead: true,
    createdAt: minutesAgo(60 * 24),
  });
  await createNotification({
    user: hospitals.sunrise.adminUser,
    title: 'Welcome to MediQueue',
    message:
      'Your hospital workspace is ready. Manage doctors, schedules and monitor live queues.',
    type: 'SYSTEM',
    isRead: true,
    createdAt: minutesAgo(60 * 24),
  });
  await createNotification({
    user: hospitals.greenvalley.adminUser,
    title: 'Welcome to MediQueue',
    message:
      'Your hospital workspace is ready. Manage doctors, schedules and monitor live queues.',
    type: 'SYSTEM',
    isRead: true,
    createdAt: minutesAgo(60 * 24),
  });

  /* Summary ---------------------------------------------------------- */
  const counts = {
    users: await prisma.user.count(),
    hospitals: await prisma.hospital.count(),
    doctors: await prisma.doctor.count(),
    patients: await prisma.patient.count(),
    schedules: await prisma.doctorSchedule.count(),
    appointments: await prisma.appointment.count(),
    queueEntries: await prisma.queueEntry.count(),
    delays: await prisma.delayReport.count(),
    notifications: await prisma.notification.count(),
  };

  console.log('\nFull demo seed complete.');
  console.log(`Demo password: ${demoPassword}`);
  console.table([
    { role: 'Platform admin', email: platformAdmin.email },
    { role: 'Hospital admin (City Care)', email: hospitals.citycare.adminUser.email },
    { role: 'Hospital admin (Sunrise)', email: hospitals.sunrise.adminUser.email },
    { role: 'Hospital admin (Green Valley)', email: hospitals.greenvalley.adminUser.email },
    { role: 'Doctor (City Care)', email: doctors.arjun.user.email },
    { role: 'Doctor (Sunrise)', email: doctors.rohan.user.email },
    { role: 'Doctor (Green Valley)', email: doctors.imran.user.email },
    { role: 'Patient (demo)', email: patients.aarav.user.email },
  ]);
  console.log('All 12 patient accounts use patientN@example.com (patient2..patient12).');
  console.log('Counts:', counts);
  console.log('\nRestart the API server if it is running so live queues rebuild from this data.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
