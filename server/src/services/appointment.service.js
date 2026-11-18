import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { requirePatientId } from '../utils/scope.js';
import { timeToMinutes, validateAppointmentCreateInput } from '../utils/validate.js';
import { isToday, nowMinutes, todayDateString } from '../utils/dates.js';
import { serializePatientAppointment } from '../utils/serializers.js';
import { PATIENT_APPOINTMENT_SELECT } from '../utils/selects.js';
import { emitToRooms, rooms } from '../realtime/emitter.js';
import { getSlotAvailability } from './slot.service.js';
import { doctorQueueKey, queueManager, queueMutex } from './queueRuntime.js';
import { broadcastDoctorQueue } from './queue.service.js';

const SLOT_CONFLICT_MESSAGE =
  'That slot is no longer available. Please choose another time.';

function hasSlotPassed(date, slotTime) {
  if (!isToday(date)) return false;
  return timeToMinutes(slotTime) <= nowMinutes();
}

/**
 * Refresh signal for appointment lists. It deliberately carries no patient
 * data: every client reloads its own authorized view over REST.
 */
function notifyAppointmentsChanged({
  doctorId = null,
  hospitalId = null,
  patientUserId = null,
}) {
  const roomList = [];
  if (doctorId) roomList.push(rooms.doctor(doctorId));
  if (hospitalId) roomList.push(rooms.hospital(hospitalId));
  if (patientUserId) roomList.push(rooms.patient(patientUserId));

  emitToRooms(roomList, 'appointments:updated', {
    doctorId,
    date: todayDateString(),
  });
}

export async function createMyAppointment(user, input) {
  const patientId = requirePatientId(user);
  const data = validateAppointmentCreateInput(input);

  // Recompute availability on the server. The client may only choose a slot
  // from this generated grid, so arbitrary times cannot be booked.
  const availability = await getSlotAvailability(data.doctorId, data.date);
  const slot = availability.slots.find((candidate) => candidate.time === data.slotTime);

  if (!slot) {
    throw ApiError.badRequest(
      "That time is not one of the doctor's consultation slots.",
      { slotTime: 'Choose an available slot.' },
    );
  }

  if (hasSlotPassed(data.date, data.slotTime)) {
    throw ApiError.badRequest('That slot has already passed. Please choose a later time.', {
      slotTime: 'Choose a later slot.',
    });
  }

  if (!slot.available) {
    throw ApiError.conflict(SLOT_CONFLICT_MESSAGE, {
      slotTime: 'That slot is already booked.',
    });
  }

  const slotKey = `${data.doctorId}|${data.date}|${data.slotTime}`;

  try {
    const appointment = await prisma.appointment.create({
      data: {
        patientId,
        doctorId: data.doctorId,
        date: data.date,
        slotTime: data.slotTime,
        slotKey,
        status: 'BOOKED',
        reason: data.reason,
      },
      select: PATIENT_APPOINTMENT_SELECT,
    });

    notifyAppointmentsChanged({
      doctorId: data.doctorId,
      hospitalId: appointment.doctor?.hospital?.id ?? null,
      patientUserId: user.id,
    });

    return serializePatientAppointment(appointment);
  } catch (error) {
    // The unique slotKey is the final race guard: two patients can pass the
    // availability check at the same time, but only one insert can win.
    if (error?.code === 'P2002') {
      throw ApiError.conflict(SLOT_CONFLICT_MESSAGE, {
        slotTime: 'That slot was just booked. Choose another.',
      });
    }

    throw error;
  }
}

export async function listMyAppointments(user) {
  const patientId = requirePatientId(user);

  const appointments = await prisma.appointment.findMany({
    where: { patientId },
    orderBy: [{ date: 'asc' }, { slotTime: 'asc' }],
    select: PATIENT_APPOINTMENT_SELECT,
  });

  return appointments.map(serializePatientAppointment);
}

export async function cancelMyAppointment(user, appointmentId) {
  const patientId = requirePatientId(user);

  const existing = await prisma.appointment.findFirst({
    where: { id: appointmentId, patientId },
    select: {
      id: true,
      status: true,
      doctorId: true,
      queueEntry: { select: { id: true, status: true } },
    },
  });

  if (!existing) {
    throw ApiError.notFound('Appointment not found.');
  }

  if (!['BOOKED', 'CHECKED_IN'].includes(existing.status)) {
    throw ApiError.conflict('Only booked or waiting checked-in appointments can be cancelled.');
  }

  if (
    existing.status === 'CHECKED_IN' &&
    (!existing.queueEntry || existing.queueEntry.status !== 'WAITING')
  ) {
    throw ApiError.conflict(
      'This appointment can no longer be cancelled once the doctor has called you.',
    );
  }

  const wasCheckedIn = existing.status === 'CHECKED_IN';

  return queueMutex.run(doctorQueueKey(existing.doctorId), async () => {
    const cancelledAt = new Date();

    const appointment = await prisma.$transaction(async (tx) => {
      const current = await tx.appointment.findFirst({
        where: { id: appointmentId, patientId, doctorId: existing.doctorId },
        select: {
          id: true,
          status: true,
          queueEntry: { select: { id: true, status: true } },
        },
      });

      if (!current) {
        throw ApiError.notFound('Appointment not found.');
      }

      if (current.status === 'BOOKED') {
        // updateMany with the status in the WHERE clause makes the transition
        // atomic, so two simultaneous cancel requests cannot both succeed.
        const updated = await tx.appointment.updateMany({
          where: { id: appointmentId, patientId, status: 'BOOKED' },
          data: { status: 'CANCELLED', cancelledAt, slotKey: null },
        });

        if (updated.count === 0) {
          throw ApiError.conflict('This appointment can no longer be cancelled.');
        }
      } else if (current.status === 'CHECKED_IN') {
        // A checked-in patient may only cancel while still waiting. Once the
        // doctor has called them, cancelling would corrupt the live queue.
        if (!current.queueEntry || current.queueEntry.status !== 'WAITING') {
          throw ApiError.conflict(
            'This appointment can no longer be cancelled once the doctor has called you.',
          );
        }

        const queueUpdate = await tx.queueEntry.updateMany({
          where: { id: current.queueEntry.id, status: 'WAITING' },
          data: { status: 'CANCELLED', cancelledAt },
        });

        if (queueUpdate.count === 0) {
          throw ApiError.conflict('This appointment can no longer be cancelled.');
        }

        const appointmentUpdate = await tx.appointment.updateMany({
          where: { id: appointmentId, patientId, status: 'CHECKED_IN' },
          data: { status: 'CANCELLED', cancelledAt, slotKey: null },
        });

        if (appointmentUpdate.count === 0) {
          throw ApiError.conflict('This appointment can no longer be cancelled.');
        }
      } else {
        throw ApiError.conflict('This appointment can no longer be cancelled.');
      }

      return tx.appointment.findUniqueOrThrow({
        where: { id: appointmentId },
        select: PATIENT_APPOINTMENT_SELECT,
      });
    });

    // The database committed successfully; only now is it safe to mutate the
    // in-memory heap. If the transaction failed, the queue is untouched.
    if (wasCheckedIn) {
      queueManager.removeWaiting(appointmentId);
    }

    notifyAppointmentsChanged({
      doctorId: existing.doctorId,
      hospitalId: appointment.doctor?.hospital?.id ?? null,
      patientUserId: user.id,
    });

    if (wasCheckedIn && isToday(appointment.date)) {
      await broadcastDoctorQueue(existing.doctorId, appointment.date);
    }

    return serializePatientAppointment(appointment);
  });
}
