import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { requireDoctorId } from '../utils/scope.js';
import { todayDateString } from '../utils/dates.js';
import { buildAppointmentCounts } from '../utils/appointmentStats.js';
import { serializePatientInfo } from '../utils/serializers.js';

const DOCTOR_APPOINTMENT_SELECT = {
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
  queueEntry: {
    select: {
      id: true,
      tokenNumber: true,
      priority: true,
      status: true,
    },
  },
};

const MAX_PATIENT_RESULTS = 8;

function serializeDoctorAppointment(appointment) {
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

function buildCounts(appointments) {
  return buildAppointmentCounts(appointments);
}

/**
 * The doctor's own appointment list for one day (today by default). The doctor
 * id always comes from the authenticated identity, never from the query string.
 */
export async function getDoctorAppointments(user, { date } = {}) {
  const doctorId = requireDoctorId(user);
  const day = typeof date === 'string' && date.trim() ? date.trim() : todayDateString();

  const doctor = await prisma.doctor.findUnique({
    where: { id: doctorId },
    select: {
      id: true,
      specialization: true,
      roomNumber: true,
      avgConsultationMinutes: true,
      isActive: true,
      user: { select: { name: true } },
      hospital: { select: { id: true, name: true, city: true } },
    },
  });

  if (!doctor) throw ApiError.notFound('Doctor profile not found.');

  const appointments = await prisma.appointment.findMany({
    where: { doctorId, date: day },
    orderBy: [{ slotTime: 'asc' }, { bookedAt: 'asc' }],
    select: DOCTOR_APPOINTMENT_SELECT,
  });

  return {
    date: day,
    doctor: {
      id: doctor.id,
      name: doctor.user?.name ?? 'Doctor',
      specialization: doctor.specialization,
      roomNumber: doctor.roomNumber ?? null,
      avgConsultationMinutes: doctor.avgConsultationMinutes,
      isActive: doctor.isActive,
      hospital: doctor.hospital
        ? { id: doctor.hospital.id, name: doctor.hospital.name, city: doctor.hospital.city }
        : null,
    },
    appointments: appointments.map(serializeDoctorAppointment),
    counts: buildCounts(appointments),
  };
}

/**
 * Patient lookup for the emergency-add flow. Emergency patients must already
 * have a MediQueue account; the doctor searches by name or email and picks one.
 */
export async function searchPatientsForDoctor(user, query) {
  requireDoctorId(user);

  const term = typeof query === 'string' ? query.trim().slice(0, 80) : '';
  if (term.length < 2) return { patients: [], query: term };

  const patients = await prisma.patient.findMany({
    where: {
      user: {
        is: {
          OR: [{ name: { contains: term } }, { email: { contains: term } }],
        },
      },
    },
    orderBy: { user: { name: 'asc' } },
    take: MAX_PATIENT_RESULTS,
    select: {
      id: true,
      dateOfBirth: true,
      gender: true,
      bloodGroup: true,
      user: { select: { name: true, email: true, phone: true } },
    },
  });

  return { patients: patients.map(serializePatientInfo), query: term };
}
