import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { requireHospitalId } from '../utils/scope.js';
import { isValidDateString, todayDateString } from '../utils/dates.js';
import {
  buildAppointmentCounts,
} from '../utils/appointmentStats.js';
import {
  serializeAdminHospital,
  serializePatientInfo,
} from '../utils/serializers.js';

const APPOINTMENT_STATUSES = new Set([
  'BOOKED',
  'CHECKED_IN',
  'CALLED',
  'IN_CONSULTATION',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
]);

const ACTIVE_QUEUE_STATUSES = ['WAITING', 'CALLED', 'IN_CONSULTATION'];

const HOSPITAL_PROFILE_SELECT = {
  id: true,
  name: true,
  address: true,
  city: true,
  phone: true,
  email: true,
  description: true,
  createdAt: true,
  updatedAt: true,
};

const HOSPITAL_DOCTOR_SELECT = {
  id: true,
  specialization: true,
  roomNumber: true,
  avgConsultationMinutes: true,
  isActive: true,
  user: { select: { name: true } },
};

const HOSPITAL_APPOINTMENT_SELECT = {
  id: true,
  date: true,
  slotTime: true,
  status: true,
  isEmergency: true,
  reason: true,
  bookedAt: true,
  checkedInAt: true,
  calledAt: true,
  startedAt: true,
  completedAt: true,
  noShowAt: true,
  cancelledAt: true,
  patient: {
    select: {
      id: true,
      dateOfBirth: true,
      gender: true,
      bloodGroup: true,
      user: { select: { name: true, email: true, phone: true } },
    },
  },
  doctor: {
    select: {
      id: true,
      specialization: true,
      roomNumber: true,
      user: { select: { name: true } },
    },
  },
  queueEntry: {
    select: {
      id: true,
      tokenNumber: true,
      priority: true,
      status: true,
    },
  },
};

const HOSPITAL_QUEUE_ENTRY_SELECT = {
  id: true,
  doctorId: true,
  appointmentId: true,
  patientId: true,
  tokenNumber: true,
  priority: true,
  status: true,
  checkedInAt: true,
  calledAt: true,
  startedAt: true,
  appointment: { select: { slotTime: true, isEmergency: true } },
  patient: { select: { id: true, user: { select: { name: true } } } },
};

function serializeDoctorSummary(doctor) {
  return {
    id: doctor.id,
    name: doctor.user?.name ?? 'Doctor',
    specialization: doctor.specialization,
    roomNumber: doctor.roomNumber ?? null,
    avgConsultationMinutes: doctor.avgConsultationMinutes,
    isActive: doctor.isActive,
  };
}

function serializeHospitalAppointment(appointment) {
  const entry = appointment.queueEntry;

  return {
    id: appointment.id,
    date: appointment.date,
    slotTime: appointment.slotTime ?? null,
    status: appointment.status,
    isEmergency: appointment.isEmergency,
    reason: appointment.reason ?? null,
    bookedAt: appointment.bookedAt,
    checkedInAt: appointment.checkedInAt ?? null,
    calledAt: appointment.calledAt ?? null,
    startedAt: appointment.startedAt ?? null,
    completedAt: appointment.completedAt ?? null,
    noShowAt: appointment.noShowAt ?? null,
    cancelledAt: appointment.cancelledAt ?? null,
    patient: serializePatientInfo(appointment.patient),
    doctor: appointment.doctor
      ? {
          id: appointment.doctor.id,
          name: appointment.doctor.user?.name ?? 'Doctor',
          specialization: appointment.doctor.specialization,
          roomNumber: appointment.doctor.roomNumber ?? null,
        }
      : null,
    queueEntry: entry
      ? {
          id: entry.id,
          tokenNumber: entry.tokenNumber,
          priority: entry.priority,
          status: entry.status,
        }
      : null,
  };
}

function waitMinutesSince(value) {
  if (!value) return null;
  const started = new Date(value).getTime();
  if (Number.isNaN(started)) return null;
  return Math.max(0, Math.round((Date.now() - started) / 60000));
}

function serializeQueueRow(entry, position = null) {
  return {
    id: entry.id,
    appointmentId: entry.appointmentId ?? null,
    patientId: entry.patientId ?? null,
    patientName: entry.patient?.user?.name ?? 'Patient',
    tokenNumber: entry.tokenNumber,
    priority: entry.priority,
    priorityLabel: entry.priority === 0 ? 'Emergency' : 'Normal',
    status: entry.status,
    slotTime: entry.appointment?.slotTime ?? null,
    isEmergency: Boolean(entry.appointment?.isEmergency),
    position,
    checkedInAt: entry.checkedInAt ?? null,
    calledAt: entry.calledAt ?? null,
    startedAt: entry.startedAt ?? null,
    waitMinutes: waitMinutesSince(entry.checkedInAt),
  };
}

function compareWaiting(a, b) {
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.tokenNumber - b.tokenNumber;
}

async function loadHospitalDoctors(hospitalId) {
  return prisma.doctor.findMany({
    where: { hospitalId },
    orderBy: { user: { name: 'asc' } },
    select: HOSPITAL_DOCTOR_SELECT,
  });
}

async function getHospitalProfile(hospitalId) {
  const hospital = await prisma.hospital.findUnique({
    where: { id: hospitalId },
    select: HOSPITAL_PROFILE_SELECT,
  });

  if (!hospital) {
    throw ApiError.notFound('Your hospital could not be found.');
  }

  return hospital;
}

export async function getHospitalDashboard(user) {
  const hospitalId = requireHospitalId(user);
  const date = todayDateString();

  const [hospital, doctors, appointments, queueEntries, delays] = await Promise.all([
    getHospitalProfile(hospitalId),
    loadHospitalDoctors(hospitalId),
    prisma.appointment.findMany({
      where: { doctor: { hospitalId }, date },
      orderBy: [{ slotTime: 'asc' }, { bookedAt: 'asc' }],
      select: HOSPITAL_APPOINTMENT_SELECT,
    }),
    prisma.queueEntry.findMany({
      where: {
        doctor: { hospitalId },
        queueDate: date,
        status: { in: ACTIVE_QUEUE_STATUSES },
      },
      select: { doctorId: true, status: true, priority: true },
    }),
    prisma.delayReport.findMany({
      where: { doctor: { hospitalId }, date, isActive: true },
      orderBy: { createdAt: 'desc' },
      select: { doctorId: true, delayMinutes: true, reason: true, createdAt: true },
    }),
  ]);

  const delayByDoctor = new Map(delays.map((report) => [report.doctorId, report]));
  const queueByDoctor = new Map();
  for (const entry of queueEntries) {
    const current = queueByDoctor.get(entry.doctorId) ?? {
      waiting: 0,
      called: 0,
      inConsultation: 0,
      emergency: 0,
    };
    if (entry.status === 'WAITING') current.waiting += 1;
    if (entry.status === 'CALLED') current.called += 1;
    if (entry.status === 'IN_CONSULTATION') current.inConsultation += 1;
    if (entry.priority === 0) current.emergency += 1;
    queueByDoctor.set(entry.doctorId, current);
  }

  const doctorQueues = doctors.map((doctor) => {
    const counts = queueByDoctor.get(doctor.id) ?? {
      waiting: 0,
      called: 0,
      inConsultation: 0,
      emergency: 0,
    };
    const delay = delayByDoctor.get(doctor.id);

    return {
      doctor: serializeDoctorSummary(doctor),
      waiting: counts.waiting,
      called: counts.called,
      inConsultation: counts.inConsultation,
      emergency: counts.emergency,
      active: counts.waiting + counts.called + counts.inConsultation,
      delay: delay
        ? {
            minutes: delay.delayMinutes,
            reason: delay.reason,
            reportedAt: delay.createdAt,
          }
        : { minutes: 0, reason: null, reportedAt: null },
    };
  });

  const queueTotals = queueEntries.reduce(
    (totals, entry) => {
      if (entry.status === 'WAITING') totals.waiting += 1;
      if (entry.status === 'CALLED') totals.called += 1;
      if (entry.status === 'IN_CONSULTATION') totals.inConsultation += 1;
      if (entry.priority === 0) totals.emergency += 1;
      return totals;
    },
    { waiting: 0, called: 0, inConsultation: 0, emergency: 0 },
  );

  return {
    date,
    hospital: serializeAdminHospital(hospital),
    doctors: {
      total: doctors.length,
      active: doctors.filter((doctor) => doctor.isActive).length,
    },
    appointments: buildAppointmentCounts(appointments),
    queue: {
      ...queueTotals,
      active: queueTotals.waiting + queueTotals.called + queueTotals.inConsultation,
      doctorsWithQueue: doctorQueues.filter((row) => row.active > 0).length,
    },
    delays: delays.map((report) => {
      const doctor = doctors.find((row) => row.id === report.doctorId);
      return {
        doctorId: report.doctorId,
        doctorName: doctor?.user?.name ?? 'Doctor',
        delayMinutes: report.delayMinutes,
        reason: report.reason,
        reportedAt: report.createdAt,
      };
    }),
    todayAppointments: appointments.slice(0, 6).map(serializeHospitalAppointment),
    doctorQueues,
  };
}

export async function listHospitalAppointments(user, { date, doctorId, status } = {}) {
  const hospitalId = requireHospitalId(user);

  const day = typeof date === 'string' && date.trim() ? date.trim() : todayDateString();
  if (!isValidDateString(day)) {
    throw ApiError.badRequest('Enter a valid date in YYYY-MM-DD format.', {
      date: 'Enter a valid date.',
    });
  }

  const normalizedDoctorId = typeof doctorId === 'string' ? doctorId.trim() : '';
  const normalizedStatus = typeof status === 'string' ? status.trim().toUpperCase() : '';

  if (normalizedStatus && !APPOINTMENT_STATUSES.has(normalizedStatus)) {
    throw ApiError.badRequest('Choose a valid appointment status.', {
      status: 'Choose a valid appointment status.',
    });
  }

  const doctors = await loadHospitalDoctors(hospitalId);

  if (normalizedDoctorId && !doctors.some((doctor) => doctor.id === normalizedDoctorId)) {
    throw ApiError.notFound('Doctor not found in your hospital.');
  }

  const baseWhere = {
    date: day,
    doctor: { hospitalId },
    ...(normalizedDoctorId ? { doctorId: normalizedDoctorId } : {}),
  };

  const [appointments, allForCounts] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        ...baseWhere,
        ...(normalizedStatus ? { status: normalizedStatus } : {}),
      },
      orderBy: [{ slotTime: 'asc' }, { bookedAt: 'asc' }],
      select: HOSPITAL_APPOINTMENT_SELECT,
    }),
    prisma.appointment.findMany({
      where: baseWhere,
      select: { status: true, isEmergency: true },
    }),
  ]);

  return {
    date: day,
    doctors: doctors.map(serializeDoctorSummary),
    appointments: appointments.map(serializeHospitalAppointment),
    counts: buildAppointmentCounts(allForCounts),
    filters: {
      doctorId: normalizedDoctorId || null,
      status: normalizedStatus || null,
    },
  };
}

/**
 * Read-only queue monitoring for every doctor in the administrator's hospital.
 * The hospital scope is applied to the query itself, so a forged doctorId or
 * queueDate cannot reveal another hospital's patients.
 */
export async function listHospitalQueues(user) {
  const hospitalId = requireHospitalId(user);
  const date = todayDateString();

  const [doctors, entries, delays] = await Promise.all([
    loadHospitalDoctors(hospitalId),
    prisma.queueEntry.findMany({
      where: {
        doctor: { hospitalId },
        queueDate: date,
        status: { in: ACTIVE_QUEUE_STATUSES },
      },
      orderBy: [{ checkedInAt: 'asc' }, { tokenNumber: 'asc' }],
      select: HOSPITAL_QUEUE_ENTRY_SELECT,
    }),
    prisma.delayReport.findMany({
      where: { doctor: { hospitalId }, date, isActive: true },
      orderBy: { createdAt: 'desc' },
      select: { doctorId: true, delayMinutes: true, reason: true, createdAt: true },
    }),
  ]);

  const delayByDoctor = new Map(delays.map((report) => [report.doctorId, report]));
  const entriesByDoctor = new Map();
  for (const entry of entries) {
    const list = entriesByDoctor.get(entry.doctorId) ?? [];
    list.push(entry);
    entriesByDoctor.set(entry.doctorId, list);
  }

  const queues = doctors.map((doctor) => {
    const list = entriesByDoctor.get(doctor.id) ?? [];
    const waiting = list
      .filter((entry) => entry.status === 'WAITING')
      .sort(compareWaiting);
    const current =
      list.find(
        (entry) => entry.status === 'CALLED' || entry.status === 'IN_CONSULTATION',
      ) ?? null;
    const delay = delayByDoctor.get(doctor.id);

    return {
      doctor: serializeDoctorSummary(doctor),
      delay: delay
        ? {
            minutes: delay.delayMinutes,
            reason: delay.reason,
            reportedAt: delay.createdAt,
          }
        : { minutes: 0, reason: null, reportedAt: null },
      current: current ? serializeQueueRow(current) : null,
      waiting: waiting.map((entry, index) => serializeQueueRow(entry, index + 1)),
      counts: {
        waiting: waiting.length,
        active: list.length,
        emergency: list.filter((entry) => entry.priority === 0).length,
      },
    };
  });

  return {
    date,
    queues,
    totals: {
      doctors: doctors.length,
      activeDoctors: queues.filter((queue) => queue.counts.active > 0).length,
      waiting: queues.reduce((total, queue) => total + queue.counts.waiting, 0),
      inConsultation: queues.filter((queue) => queue.current).length,
      delays: delays.length,
      emergency: queues.reduce((total, queue) => total + queue.counts.emergency, 0),
    },
  };
}
