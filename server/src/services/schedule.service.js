import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { requireHospitalId } from '../utils/scope.js';
import {
  timeToMinutes,
  validateScheduleCreateInput,
  validateScheduleUpdateInput,
} from '../utils/validate.js';
import { serializeSchedule } from '../utils/serializers.js';
import { SCHEDULE_SELECT } from '../utils/selects.js';

async function assertDoctorInHospital(user, doctorId) {
  const hospitalId = requireHospitalId(user);

  const doctor = await prisma.doctor.findFirst({
    where: { id: doctorId, hospitalId },
    select: { id: true },
  });

  if (!doctor) {
    throw ApiError.notFound('Doctor not found in your hospital.');
  }

  return doctor;
}

async function assertNoScheduleConflict(doctorId, schedule, excludeId = null) {
  const duplicate = await prisma.doctorSchedule.findFirst({
    where: {
      doctorId,
      dayOfWeek: schedule.dayOfWeek,
      startTime: schedule.startTime,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });

  if (duplicate) {
    throw ApiError.conflict('A schedule already starts at that time on this day.');
  }

  // Inactive sessions do not generate slots, so they may overlap freely.
  if (!schedule.isActive) return;

  const existing = await prisma.doctorSchedule.findMany({
    where: {
      doctorId,
      dayOfWeek: schedule.dayOfWeek,
      isActive: true,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { startTime: true, endTime: true },
  });

  const newStart = timeToMinutes(schedule.startTime);
  const newEnd = timeToMinutes(schedule.endTime);

  const overlaps = existing.some((current) => {
    const currentStart = timeToMinutes(current.startTime);
    const currentEnd = timeToMinutes(current.endTime);
    return newStart < currentEnd && currentStart < newEnd;
  });

  if (overlaps) {
    throw ApiError.conflict(
      'This schedule overlaps another active schedule on the same day.',
    );
  }
}

export async function listDoctorSchedules(user, doctorId) {
  await assertDoctorInHospital(user, doctorId);

  const schedules = await prisma.doctorSchedule.findMany({
    where: { doctorId },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    select: SCHEDULE_SELECT,
  });

  return schedules.map(serializeSchedule);
}

export async function createDoctorSchedule(user, doctorId, input) {
  await assertDoctorInHospital(user, doctorId);

  const data = validateScheduleCreateInput(input);
  await assertNoScheduleConflict(doctorId, data);

  const schedule = await prisma.doctorSchedule.create({
    data: { doctorId, ...data },
    select: SCHEDULE_SELECT,
  });

  return serializeSchedule(schedule);
}

export async function updateDoctorSchedule(user, doctorId, scheduleId, input) {
  await assertDoctorInHospital(user, doctorId);

  const existing = await prisma.doctorSchedule.findFirst({
    where: { id: scheduleId, doctorId },
    select: SCHEDULE_SELECT,
  });

  if (!existing) {
    throw ApiError.notFound('Schedule not found.');
  }

  const patch = validateScheduleUpdateInput(input);

  // Validate the complete resulting window, not just the changed fields.
  const data = validateScheduleCreateInput({ ...existing, ...patch });
  await assertNoScheduleConflict(doctorId, data, scheduleId);

  const schedule = await prisma.doctorSchedule.update({
    where: { id: scheduleId },
    data,
    select: SCHEDULE_SELECT,
  });

  return serializeSchedule(schedule);
}

export async function deleteDoctorSchedule(user, doctorId, scheduleId) {
  await assertDoctorInHospital(user, doctorId);

  const existing = await prisma.doctorSchedule.findFirst({
    where: { id: scheduleId, doctorId },
    select: { id: true },
  });

  if (!existing) {
    throw ApiError.notFound('Schedule not found.');
  }

  await prisma.doctorSchedule.delete({ where: { id: scheduleId } });
}
