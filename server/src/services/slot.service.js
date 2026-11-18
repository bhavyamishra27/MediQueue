import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { timeToMinutes, validateSlotsQuery } from '../utils/validate.js';
import {
  getDayOfWeek,
  isPastDate,
  isToday,
  minutesToTime,
  nowMinutes,
} from '../utils/dates.js';
import { serializeSchedule, serializeSlotDoctor } from '../utils/serializers.js';
import { SCHEDULE_SELECT, SLOT_DOCTOR_SELECT } from '../utils/selects.js';

/**
 * Expands a weekly schedule window into fixed-length slots.
 * A slot is only generated when the full duration fits inside the window.
 */
export function expandSessionSlots(sessions = []) {
  const byTime = new Map();

  for (const session of sessions) {
    const duration = session.slotDurationMinutes;
    const endMinutes = timeToMinutes(session.endTime);
    let startMinutes = timeToMinutes(session.startTime);

    while (startMinutes + duration <= endMinutes) {
      const time = minutesToTime(startMinutes);

      if (!byTime.has(time)) {
        byTime.set(time, {
          time,
          endTime: minutesToTime(startMinutes + duration),
          durationMinutes: duration,
        });
      }

      startMinutes += duration;
    }
  }

  return [...byTime.values()].sort((a, b) => a.time.localeCompare(b.time));
}

/**
 * Loads everything the booking layer needs for one doctor and date:
 * the active sessions, the generated grid and current availability.
 */
export async function getSlotAvailability(doctorId, date) {
  const doctor = await prisma.doctor.findFirst({
    where: { id: doctorId, isActive: true },
    select: SLOT_DOCTOR_SELECT,
  });

  if (!doctor) {
    throw ApiError.notFound('Doctor not found or inactive.');
  }

  const dayOfWeek = getDayOfWeek(date);
  const sessions = await prisma.doctorSchedule.findMany({
    where: { doctorId, dayOfWeek, isActive: true },
    orderBy: { startTime: 'asc' },
    select: SCHEDULE_SELECT,
  });

  const booked = await prisma.appointment.findMany({
    where: { doctorId, date, slotKey: { not: null } },
    select: { slotTime: true },
  });
  const bookedTimes = new Set(booked.map((appointment) => appointment.slotTime));

  const past = isPastDate(date);
  const currentMinutes = isToday(date) ? nowMinutes() : null;

  const slots = expandSessionSlots(sessions).map((slot) => ({
    ...slot,
    available:
      !past &&
      !bookedTimes.has(slot.time) &&
      (currentMinutes === null || timeToMinutes(slot.time) > currentMinutes),
  }));

  return { doctor, date, dayOfWeek, sessions, slots, isPast: past };
}

export async function getDoctorSlots(doctorId, query) {
  const { date } = validateSlotsQuery(query);
  const availability = await getSlotAvailability(doctorId, date);

  return {
    date: availability.date,
    dayOfWeek: availability.dayOfWeek,
    isPast: availability.isPast,
    doctor: serializeSlotDoctor(availability.doctor),
    sessions: availability.sessions.map(serializeSchedule),
    slots: availability.slots,
  };
}
