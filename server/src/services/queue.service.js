import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { requireDoctorId, requirePatientId } from '../utils/scope.js';
import { isToday, minutesToTime, nowMinutes, todayDateString } from '../utils/dates.js';
import { queueManager, queueMutex, doctorQueueKey } from './queueRuntime.js';
import {
  createNotification,
  createNotifications,
  emitNotifications,
} from './notification.service.js';
import { emitToRoom, emitToRooms, isRealtimeEnabled, rooms } from '../realtime/emitter.js';
import {
  calculateEffectiveAverage,
  estimateStartTime,
  estimateWaitMinutes,
} from '../dsa/QueueCalculator.js';
import {
  serializeDsaSnapshot,
  serializePatientAppointment,
  serializePatientQueueEntry,
  serializeSafeQueueRow,
  serializeStaffQueueEntry,
} from '../utils/serializers.js';
import { PATIENT_APPOINTMENT_SELECT } from '../utils/selects.js';
import { validateDelayInput, validateEmergencyInput } from '../utils/validate.js';

const ACTIVE_QUEUE_STATUSES = ['WAITING', 'CALLED', 'IN_CONSULTATION'];
const WAITING = 'WAITING';

const QUEUE_ENTRY_CONTEXT_SELECT = {
  id: true,
  doctorId: true,
  patientId: true,
  appointmentId: true,
  queueDate: true,
  tokenNumber: true,
  priority: true,
  status: true,
  checkedInAt: true,
  calledAt: true,
  startedAt: true,
  completedAt: true,
  noShowAt: true,
  cancelledAt: true,
  patient: {
    select: {
      userId: true,
      user: { select: { name: true } },
    },
  },
  appointment: {
    select: {
      id: true,
      slotTime: true,
      status: true,
    },
  },
};

const DOCTOR_DIRECTORY_SELECT = {
  id: true,
  hospitalId: true,
  roomNumber: true,
  avgConsultationMinutes: true,
  isActive: true,
  user: { select: { name: true } },
  hospital: { select: { name: true } },
};

function toRuntimeEntry(entry) {
  return {
    id: entry.id,
    appointmentId: entry.appointmentId,
    doctorId: entry.doctorId,
    patientId: entry.patientId,
    patientName: entry.patient?.user?.name ?? 'Patient',
    tokenNumber: entry.tokenNumber,
    priority: entry.priority,
    status: entry.status,
    slotTime: entry.appointment?.slotTime ?? null,
    checkedInAt: entry.checkedInAt ?? null,
    calledAt: entry.calledAt ?? null,
    startedAt: entry.startedAt ?? null,
  };
}

function toDoctorRecord(doctor) {
  return {
    id: doctor.id,
    name: doctor.user?.name ?? 'Doctor',
    hospitalId: doctor.hospitalId,
    hospitalName: doctor.hospital?.name ?? null,
    roomNumber: doctor.roomNumber ?? null,
    avgConsultationMinutes: doctor.avgConsultationMinutes,
    isActive: doctor.isActive,
  };
}

async function ensureDoctorRegistered(doctorId) {
  const cached = queueManager.getDoctor(doctorId);
  if (cached) return cached;

  const doctor = await prisma.doctor.findUnique({
    where: { id: doctorId },
    select: DOCTOR_DIRECTORY_SELECT,
  });

  if (!doctor) throw ApiError.notFound('Doctor profile not found.');
  return queueManager.registerDoctor(toDoctorRecord(doctor));
}

function assertDoctorActive(doctor) {
  if (doctor && doctor.isActive === false) {
    throw ApiError.forbidden('This doctor profile is inactive.');
  }
}

async function getActiveDelay(doctorId, date) {
  const report = await prisma.delayReport.findFirst({
    where: { doctorId, date, isActive: true },
    orderBy: { createdAt: 'desc' },
    select: { id: true, delayMinutes: true, reason: true, createdAt: true },
  });

  if (!report) return { minutes: 0, reason: null, reportedAt: null, id: null };

  return {
    id: report.id,
    minutes: report.delayMinutes,
    reason: report.reason,
    reportedAt: report.createdAt,
  };
}

async function getAverageContext(doctorId, date) {
  const doctor = await prisma.doctor.findUnique({
    where: { id: doctorId },
    select: { avgConsultationMinutes: true },
  });

  if (!doctor) throw ApiError.notFound('Doctor profile not found.');

  const completed = await prisma.queueEntry.findMany({
    where: {
      doctorId,
      queueDate: date,
      status: 'COMPLETED',
      startedAt: { not: null },
      completedAt: { not: null },
    },
    select: { startedAt: true, completedAt: true },
  });

  const durations = completed.map((entry) =>
    Math.max(1, Math.round((entry.completedAt.getTime() - entry.startedAt.getTime()) / 60000)),
  );

  return {
    configured: doctor.avgConsultationMinutes,
    effective: calculateEffectiveAverage(doctor.avgConsultationMinutes, durations),
    completedCount: completed.length,
  };
}

function decorateWaiting(waiting, { current, average, delayMinutes }) {
  const now = minutesToTime(nowMinutes());

  return waiting.map((entry) => {
    const position = entry.position ?? 1;
    const options = {
      position,
      currentPatient: Boolean(current),
      avgConsultationMinutes: average,
      delayMinutes,
    };

    return {
      ...entry,
      estimatedWaitMinutes: estimateWaitMinutes(options),
      estimatedStartTime: estimateStartTime({
        now,
        slotTime: entry.slotTime ?? null,
        ...options,
      }),
    };
  });
}

function serializeDoctorSummary(doctor) {
  if (!doctor) return null;

  return {
    id: doctor.id,
    name: doctor.name,
    hospitalId: doctor.hospitalId,
    hospitalName: doctor.hospitalName,
    roomNumber: doctor.roomNumber ?? null,
    avgConsultationMinutes: doctor.avgConsultationMinutes,
  };
}

/**
 * Tells the doctor, hospital administrators and the patient that appointment
 * data changed. Clients use this as a refresh signal; it carries no patient
 * data, so it is safe to broadcast to the whole hospital room.
 */
function broadcastAppointmentsUpdated({ doctorId = null, hospitalId = null, patientUserId = null }) {
  const roomList = [];
  if (doctorId) roomList.push(rooms.doctor(doctorId));
  if (hospitalId) roomList.push(rooms.hospital(hospitalId));
  if (patientUserId) roomList.push(rooms.patient(patientUserId));

  emitToRooms(roomList, 'appointments:updated', {
    doctorId,
    date: todayDateString(),
  });
}

function broadcastPatientCalled({ patientUserId = null, doctorId, entry }) {
  const doctor = queueManager.getDoctor(doctorId);

  const payload = {
    appointmentId: entry.appointmentId ?? null,
    tokenNumber: entry.tokenNumber,
    roomNumber: doctor?.roomNumber ?? null,
    doctorName: doctor?.name ?? 'Doctor',
  };

  const roomList = [rooms.doctor(doctorId)];
  if (patientUserId) roomList.push(rooms.patient(patientUserId));

  emitToRooms(roomList, 'patient:called', payload);
}

/**
 * Pushes the complete staff queue view to the doctor and hospital rooms, then
 * sends every waiting patient only their own position and estimate. When no
 * socket server is attached this is a no-op and the REST response still builds
 * the same view, so unit/integration tests keep working unchanged.
 */
export async function broadcastDoctorQueue(
  doctorId,
  date,
  { emergencyEntry = null, delayEvent = false } = {},
) {
  if (!isRealtimeEnabled()) return null;

  const view = await buildDoctorQueueView(doctorId, date);
  const doctor = queueManager.getDoctor(doctorId);
  const hospitalId = doctor?.hospitalId ?? null;

  emitToRoom(rooms.doctor(doctorId), 'queue:updated', view);
  if (hospitalId) emitToRoom(rooms.hospital(hospitalId), 'queue:updated', view);

  if (emergencyEntry) {
    const payload = { entry: emergencyEntry, queue: view };
    emitToRoom(rooms.doctor(doctorId), 'queue:emergency', payload);
    if (hospitalId) emitToRoom(rooms.hospital(hospitalId), 'queue:emergency', payload);
  }

  const waitingAppointmentIds = view.waiting
    .map((entry) => entry.appointmentId)
    .filter(Boolean);

  if (waitingAppointmentIds.length === 0) return view;

  const rows = await prisma.queueEntry.findMany({
    where: {
      doctorId,
      queueDate: date,
      status: WAITING,
      appointmentId: { in: waitingAppointmentIds },
    },
    select: {
      appointmentId: true,
      patient: { select: { userId: true } },
    },
  });

  const userIdByAppointment = new Map(
    rows.map((row) => [row.appointmentId, row.patient.userId]),
  );

  for (const entry of view.waiting) {
    const userId = userIdByAppointment.get(entry.appointmentId);
    if (!userId) continue;

    const base = {
      date,
      doctor: view.doctor,
      tokenNumber: entry.tokenNumber,
      position: entry.position,
      estimatedWaitMinutes: entry.estimatedWaitMinutes,
      estimatedStartTime: entry.estimatedStartTime,
      currentTokenNumber: view.current?.tokenNumber ?? null,
    };

    emitToRoom(rooms.patient(userId), 'queue:position', base);

    if (delayEvent) {
      emitToRoom(rooms.patient(userId), 'doctor:delay', {
        ...base,
        delay: view.delay,
      });
    }
  }

  return view;
}

export async function buildDoctorQueueView(doctorId, date) {
  const doctor = await ensureDoctorRegistered(doctorId);
  const delay = await getActiveDelay(doctorId, date);
  const average = await getAverageContext(doctorId, date);

  queueManager.setDoctorDelay(doctorId, delay.minutes);

  const snapshot = queueManager.getSnapshot(doctorId);
  const waiting = decorateWaiting(snapshot.waiting, {
    current: snapshot.current,
    average: average.effective,
    delayMinutes: delay.minutes,
  });

  return {
    date,
    doctor: serializeDoctorSummary(doctor),
    delay,
    averageConsultationMinutes: average.effective,
    configuredAverageMinutes: average.configured,
    completedToday: average.completedCount,
    current: snapshot.current ? serializeStaffQueueEntry(snapshot.current) : null,
    waiting: waiting.map(serializeStaffQueueEntry),
    counts: snapshot.counts,
    dsa: serializeDsaSnapshot(queueManager.getDsaSnapshot(doctorId)),
  };
}

/**
 * Rebuilds every doctor's in-memory queue from SQLite. Called once at startup
 * and safe to call again (for tests or recovery); SQLite stays authoritative.
 */
export async function rebuildQueues() {
  const date = todayDateString();

  const doctors = await prisma.doctor.findMany({
    select: DOCTOR_DIRECTORY_SELECT,
  });

  queueManager.clearAll();
  for (const doctor of doctors) {
    queueManager.registerDoctor(toDoctorRecord(doctor));
  }

  const entries = await prisma.queueEntry.findMany({
    where: { queueDate: date, status: { in: ACTIVE_QUEUE_STATUSES } },
    orderBy: [{ checkedInAt: 'asc' }, { tokenNumber: 'asc' }],
    select: QUEUE_ENTRY_CONTEXT_SELECT,
  });

  for (const entry of entries) {
    queueManager.registerPatient({
      id: entry.patientId,
      name: entry.patient?.user?.name ?? 'Patient',
    });
  }

  const byDoctor = new Map();
  for (const entry of entries) {
    const list = byDoctor.get(entry.doctorId) ?? [];
    list.push(entry);
    byDoctor.set(entry.doctorId, list);
  }

  for (const [doctorId, list] of byDoctor) {
    const waiting = list
      .filter((entry) => entry.status === WAITING)
      .map(toRuntimeEntry);

    queueManager.rebuildDoctorQueue(doctorId, waiting);

    const current = list.find(
      (entry) => entry.status === 'CALLED' || entry.status === 'IN_CONSULTATION',
    );

    if (current) {
      queueManager.setCurrent(doctorId, toRuntimeEntry(current), { silent: true });
    }
  }

  const delays = await prisma.delayReport.findMany({
    where: { date, isActive: true },
    select: { doctorId: true, delayMinutes: true },
  });

  for (const delay of delays) {
    queueManager.setDoctorDelay(delay.doctorId, delay.delayMinutes);
  }

  return {
    date,
    doctors: doctors.length,
    activeEntries: entries.length,
  };
}

/**
 * Rebuilds one doctor's in-memory queue from SQLite. Used for targeted recovery
 * so an operation on one doctor never disturbs another doctor's live queue.
 */
async function rebuildDoctorQueueState(doctorId, date) {
  const doctor = await prisma.doctor.findUnique({
    where: { id: doctorId },
    select: DOCTOR_DIRECTORY_SELECT,
  });

  if (!doctor) throw ApiError.notFound('Doctor profile not found.');
  queueManager.registerDoctor(toDoctorRecord(doctor));

  const entries = await prisma.queueEntry.findMany({
    where: {
      doctorId,
      queueDate: date,
      status: { in: ACTIVE_QUEUE_STATUSES },
    },
    orderBy: [{ checkedInAt: 'asc' }, { tokenNumber: 'asc' }],
    select: QUEUE_ENTRY_CONTEXT_SELECT,
  });

  for (const entry of entries) {
    queueManager.registerPatient({
      id: entry.patientId,
      name: entry.patient?.user?.name ?? 'Patient',
    });
  }

  const waiting = entries
    .filter((entry) => entry.status === WAITING)
    .map(toRuntimeEntry);

  queueManager.clearCurrent(doctorId, { silent: true });
  queueManager.rebuildDoctorQueue(doctorId, waiting);

  const current = entries.find(
    (entry) => entry.status === 'CALLED' || entry.status === 'IN_CONSULTATION',
  );

  if (current) {
    queueManager.setCurrent(doctorId, toRuntimeEntry(current), { silent: true });
  }

  return { doctorId, date, activeEntries: entries.length };
}

/**
 * Patient check-in. A token is issued only here, so token order always matches
 * real arrival order. The doctor lock plus the unique token constraint guard
 * against simultaneous check-ins.
 */
export async function checkInAppointment(user, appointmentId) {
  const patientId = requirePatientId(user);

  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, patientId },
    select: {
      id: true,
      doctorId: true,
      date: true,
      status: true,
      isEmergency: true,
    },
  });

  if (!appointment) throw ApiError.notFound('Appointment not found.');

  if (!isToday(appointment.date)) {
    throw ApiError.badRequest('You can only check in on the day of your appointment.', {
      appointmentId: 'Check-in opens on the appointment date.',
    });
  }

  if (appointment.status === 'CHECKED_IN') {
    throw ApiError.conflict('You are already checked in for this appointment.');
  }

  if (appointment.status !== 'BOOKED') {
    throw ApiError.conflict('Only booked appointments can be checked in.');
  }

  const doctorId = appointment.doctorId;
  const date = appointment.date;

  return queueMutex.run(doctorQueueKey(doctorId), async () => {
    const doctor = await ensureDoctorRegistered(doctorId);
    assertDoctorActive(doctor);

    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.appointment.findFirst({
        where: { id: appointmentId, patientId, doctorId, status: 'BOOKED' },
        select: {
          id: true,
          doctorId: true,
          date: true,
          isEmergency: true,
        },
      });

      if (!current) {
        throw ApiError.conflict('This appointment can no longer be checked in.');
      }

      const existingEntry = await tx.queueEntry.findUnique({
        where: { appointmentId },
        select: { id: true },
      });

      if (existingEntry) {
        throw ApiError.conflict('A queue token has already been issued for this appointment.');
      }

      const aggregate = await tx.queueEntry.aggregate({
        where: { doctorId, queueDate: date },
        _max: { tokenNumber: true },
      });

      const tokenNumber = (aggregate._max.tokenNumber ?? 0) + 1;
      const checkedInAt = new Date();

      const queueEntry = await tx.queueEntry.create({
        data: {
          doctorId,
          patientId,
          appointmentId,
          queueDate: date,
          tokenNumber,
          priority: current.isEmergency ? 0 : 1,
          status: WAITING,
          checkedInAt,
        },
        select: QUEUE_ENTRY_CONTEXT_SELECT,
      });

      await tx.appointment.update({
        where: { id: appointmentId },
        data: { status: 'CHECKED_IN', checkedInAt },
      });

      const notification = await createNotification(tx, {
        userId: user.id,
        title: 'Checked in',
        message: `You are checked in. Your token number is #${tokenNumber}.`,
        type: 'QUEUE',
        appointmentId,
      });

      const updatedAppointment = await tx.appointment.findUniqueOrThrow({
        where: { id: appointmentId },
        select: PATIENT_APPOINTMENT_SELECT,
      });

      return { queueEntry, appointment: updatedAppointment, notification };
    });

    queueManager.insertWaiting(toRuntimeEntry(result.queueEntry));

    emitNotifications([result.notification]);
    broadcastAppointmentsUpdated({
      doctorId,
      hospitalId: doctor.hospitalId,
      patientUserId: user.id,
    });
    await broadcastDoctorQueue(doctorId, date);

    return {
      appointment: serializePatientAppointment(result.appointment),
      queueEntry: serializePatientQueueEntry(toRuntimeEntry(result.queueEntry)),
    };
  });
}

/**
 * Patient's own active queue state plus a privacy-safe view of the queue.
 */
export async function getMyQueueState(user) {
  const patientId = requirePatientId(user);
  const date = todayDateString();

  const entry = await prisma.queueEntry.findFirst({
    where: {
      patientId,
      queueDate: date,
      status: { in: ACTIVE_QUEUE_STATUSES },
    },
    orderBy: { checkedInAt: 'desc' },
    select: QUEUE_ENTRY_CONTEXT_SELECT,
  });

  if (!entry) {
    return {
      date,
      active: false,
      entry: null,
      doctor: null,
      current: null,
      waiting: [],
      delay: { minutes: 0, reason: null, reportedAt: null },
      averageConsultationMinutes: null,
    };
  }

  const doctorId = entry.doctorId;
  const doctor = await ensureDoctorRegistered(doctorId);

  // Self-heal: if the in-memory engine was rebuilt or restarted between the
  // check-in and this request, restore this entry before calculating position.
  const runtimeEntry = toRuntimeEntry(entry);
  const queue = queueManager.getQueue(doctorId);
  if (entry.status === WAITING && !queue?.has(entry.appointmentId)) {
    queueManager.insertWaiting(runtimeEntry);
  } else if (
    (entry.status === 'CALLED' || entry.status === 'IN_CONSULTATION') &&
    !queueManager.getCurrent(doctorId)
  ) {
    queueManager.setCurrent(doctorId, runtimeEntry, { silent: true });
  }

  const delay = await getActiveDelay(doctorId, date);
  const average = await getAverageContext(doctorId, date);
  queueManager.setDoctorDelay(doctorId, delay.minutes);

  const snapshot = queueManager.getSnapshot(doctorId);
  const position =
    entry.status === WAITING
      ? queueManager.getQueue(doctorId)?.getPosition(entry.appointmentId) ?? null
      : null;

  const estimateOptions = {
    position: position ?? 1,
    currentPatient: Boolean(snapshot.current),
    avgConsultationMinutes: average.effective,
    delayMinutes: delay.minutes,
  };

  const waiting = decorateWaiting(snapshot.waiting, {
    current: snapshot.current,
    average: average.effective,
    delayMinutes: delay.minutes,
  });

  return {
    date,
    active: true,
    entry: {
      ...serializePatientQueueEntry(runtimeEntry),
      position,
      estimatedWaitMinutes:
        entry.status === WAITING ? estimateWaitMinutes(estimateOptions) : 0,
      estimatedStartTime:
        entry.status === WAITING
          ? estimateStartTime({
              now: minutesToTime(nowMinutes()),
              slotTime: runtimeEntry.slotTime,
              ...estimateOptions,
            })
          : null,
    },
    doctor: serializeDoctorSummary(doctor),
    current: snapshot.current
      ? serializeSafeQueueRow(snapshot.current, {
          isYou: snapshot.current.appointmentId === entry.appointmentId,
        })
      : null,
    waiting: waiting.map((row) =>
      serializeSafeQueueRow(row, { isYou: row.appointmentId === entry.appointmentId }),
    ),
    delay,
    averageConsultationMinutes: average.effective,
  };
}

export async function getDoctorQueue(user) {
  const doctorId = requireDoctorId(user);
  const date = todayDateString();
  return buildDoctorQueueView(doctorId, date);
}

export async function callNextPatient(user) {
  const doctorId = requireDoctorId(user);
  const date = todayDateString();

  return queueMutex.run(doctorQueueKey(doctorId), async () => {
    const doctor = await ensureDoctorRegistered(doctorId);
    assertDoctorActive(doctor);

    if (queueManager.getCurrent(doctorId)) {
      throw ApiError.conflict(
        'Finish the current consultation or mark a no-show before calling the next patient.',
      );
    }

    // The database is authoritative. If it already has a called patient that
    // the in-memory queue does not know about, rebuild instead of guessing.
    const databaseCurrent = await prisma.queueEntry.findFirst({
      where: {
        doctorId,
        queueDate: date,
        status: { in: ['CALLED', 'IN_CONSULTATION'] },
      },
      select: { id: true },
    });

    if (databaseCurrent) {
      await rebuildDoctorQueueState(doctorId, date);
      throw ApiError.conflict(
        'The queue changed on the server. Please refresh and try again.',
      );
    }

    const next = queueManager.getQueue(doctorId)?.peekNext() ?? null;
    if (!next) {
      throw ApiError.conflict('No patients are waiting in the queue.');
    }

    const calledAt = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      const entry = await tx.queueEntry.findFirst({
        where: { id: next.id, doctorId, status: WAITING },
        select: QUEUE_ENTRY_CONTEXT_SELECT,
      });

      if (!entry) {
        throw ApiError.conflict('That patient is no longer waiting. Please refresh the queue.');
      }

      const queueEntry = await tx.queueEntry.update({
        where: { id: entry.id },
        data: { status: 'CALLED', calledAt },
        select: QUEUE_ENTRY_CONTEXT_SELECT,
      });

      await tx.appointment.update({
        where: { id: entry.appointmentId },
        data: { status: 'CALLED', calledAt },
      });

      const notification = await createNotification(tx, {
        userId: entry.patient.userId,
        title: "It's your turn",
        message: `Token #${entry.tokenNumber} has been called. Please proceed to the doctor's room.`,
        type: 'QUEUE',
        appointmentId: entry.appointmentId,
      });

      return { queueEntry, notification, patientUserId: entry.patient.userId };
    });

    const extracted = queueManager.callNext(doctorId);

    if (!extracted || extracted.appointmentId !== updated.queueEntry.appointmentId) {
      await rebuildDoctorQueueState(doctorId, date);
    } else {
      queueManager.setCurrent(
        doctorId,
        { ...toRuntimeEntry(updated.queueEntry), status: 'CALLED', calledAt },
        { silent: true },
      );
    }

    emitNotifications([updated.notification]);
    broadcastPatientCalled({
      patientUserId: updated.patientUserId,
      doctorId,
      entry: toRuntimeEntry(updated.queueEntry),
    });
    broadcastAppointmentsUpdated({
      doctorId,
      hospitalId: doctor.hospitalId,
      patientUserId: updated.patientUserId,
    });

    const queueView = await broadcastDoctorQueue(doctorId, date);

    return {
      queue: queueView ?? (await buildDoctorQueueView(doctorId, date)),
      entry: serializeStaffQueueEntry(toRuntimeEntry(updated.queueEntry)),
    };
  });
}

export async function startConsultation(user) {
  const doctorId = requireDoctorId(user);
  const date = todayDateString();

  return queueMutex.run(doctorQueueKey(doctorId), async () => {
    const doctor = await ensureDoctorRegistered(doctorId);
    assertDoctorActive(doctor);

    const current = queueManager.getCurrent(doctorId);
    if (!current) {
      throw ApiError.conflict('Call a patient before starting a consultation.');
    }

    if (current.status === 'IN_CONSULTATION') {
      throw ApiError.conflict('The consultation is already in progress.');
    }

    if (current.status !== 'CALLED') {
      throw ApiError.conflict('Only a called patient can be started.');
    }

    const startedAt = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      const entry = await tx.queueEntry.findFirst({
        where: { id: current.id, doctorId, status: 'CALLED' },
        select: QUEUE_ENTRY_CONTEXT_SELECT,
      });

      if (!entry) {
        throw ApiError.conflict('The queue changed on the server. Please refresh.');
      }

      const queueEntry = await tx.queueEntry.update({
        where: { id: entry.id },
        data: { status: 'IN_CONSULTATION', startedAt },
        select: QUEUE_ENTRY_CONTEXT_SELECT,
      });

      await tx.appointment.update({
        where: { id: entry.appointmentId },
        data: { status: 'IN_CONSULTATION', startedAt },
      });

      return { queueEntry, patientUserId: entry.patient.userId };
    });

    queueManager.setCurrent(doctorId, toRuntimeEntry(updated.queueEntry), { silent: true });

    broadcastAppointmentsUpdated({
      doctorId,
      hospitalId: doctor.hospitalId,
      patientUserId: updated.patientUserId,
    });

    const queueView = await broadcastDoctorQueue(doctorId, date);

    return {
      queue: queueView ?? (await buildDoctorQueueView(doctorId, date)),
      entry: serializeStaffQueueEntry(toRuntimeEntry(updated.queueEntry)),
    };
  });
}

export async function completeConsultation(user) {
  const doctorId = requireDoctorId(user);
  const date = todayDateString();

  return queueMutex.run(doctorQueueKey(doctorId), async () => {
    const doctor = await ensureDoctorRegistered(doctorId);
    assertDoctorActive(doctor);

    const current = queueManager.getCurrent(doctorId);
    if (!current) {
      throw ApiError.conflict('There is no active consultation to complete.');
    }

    if (current.status !== 'IN_CONSULTATION') {
      throw ApiError.conflict('Start the consultation before completing it.');
    }

    const completedAt = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      const entry = await tx.queueEntry.findFirst({
        where: { id: current.id, doctorId, status: 'IN_CONSULTATION' },
        select: QUEUE_ENTRY_CONTEXT_SELECT,
      });

      if (!entry) {
        throw ApiError.conflict('The queue changed on the server. Please refresh.');
      }

      const queueEntry = await tx.queueEntry.update({
        where: { id: entry.id },
        data: { status: 'COMPLETED', completedAt },
        select: QUEUE_ENTRY_CONTEXT_SELECT,
      });

      await tx.appointment.update({
        where: { id: entry.appointmentId },
        data: { status: 'COMPLETED', completedAt },
      });

      const notification = await createNotification(tx, {
        userId: entry.patient.userId,
        title: 'Consultation completed',
        message: 'Your consultation is complete. Thank you for visiting MediQueue.',
        type: 'QUEUE',
        appointmentId: entry.appointmentId,
      });

      return { queueEntry, notification, patientUserId: entry.patient.userId };
    });

    queueManager.clearCurrent(doctorId);

    emitNotifications([updated.notification]);
    broadcastAppointmentsUpdated({
      doctorId,
      hospitalId: doctor.hospitalId,
      patientUserId: updated.patientUserId,
    });

    const queueView = await broadcastDoctorQueue(doctorId, date);

    return {
      queue: queueView ?? (await buildDoctorQueueView(doctorId, date)),
      entry: serializeStaffQueueEntry(toRuntimeEntry(updated.queueEntry)),
    };
  });
}

export async function markNoShow(user, entryId) {
  const doctorId = requireDoctorId(user);
  const date = todayDateString();

  return queueMutex.run(doctorQueueKey(doctorId), async () => {
    const doctor = await ensureDoctorRegistered(doctorId);
    assertDoctorActive(doctor);

    const existing = await prisma.queueEntry.findFirst({
      where: { id: entryId, doctorId, queueDate: date },
      select: { id: true, status: true },
    });

    if (!existing) throw ApiError.notFound('Queue entry not found.');

    if (existing.status === 'IN_CONSULTATION') {
      throw ApiError.conflict('An in-consultation patient cannot be marked as a no-show.');
    }

    if (!['WAITING', 'CALLED'].includes(existing.status)) {
      throw ApiError.conflict('This queue entry can no longer be marked as a no-show.');
    }

    const current = queueManager.getCurrent(doctorId);
    const isCurrent = current?.id === entryId;
    const noShowAt = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      const entry = await tx.queueEntry.findFirst({
        where: { id: entryId, doctorId, status: { in: ['WAITING', 'CALLED'] } },
        select: QUEUE_ENTRY_CONTEXT_SELECT,
      });

      if (!entry) {
        throw ApiError.conflict('The queue changed on the server. Please refresh.');
      }

      const queueEntry = await tx.queueEntry.update({
        where: { id: entry.id },
        data: { status: 'NO_SHOW', noShowAt },
        select: QUEUE_ENTRY_CONTEXT_SELECT,
      });

      await tx.appointment.update({
        where: { id: entry.appointmentId },
        data: { status: 'NO_SHOW', noShowAt },
      });

      return { queueEntry, patientUserId: entry.patient.userId };
    });

    if (isCurrent) {
      queueManager.clearCurrent(doctorId);
    } else {
      queueManager.removeWaiting(updated.queueEntry.appointmentId);
    }

    broadcastAppointmentsUpdated({
      doctorId,
      hospitalId: doctor.hospitalId,
      patientUserId: updated.patientUserId,
    });

    const queueView = await broadcastDoctorQueue(doctorId, date);

    return {
      queue: queueView ?? (await buildDoctorQueueView(doctorId, date)),
      entry: serializeStaffQueueEntry(toRuntimeEntry(updated.queueEntry)),
    };
  });
}

export async function addEmergencyPatient(user, input) {
  const doctorId = requireDoctorId(user);
  const data = validateEmergencyInput(input);
  const date = todayDateString();

  return queueMutex.run(doctorQueueKey(doctorId), async () => {
    const doctor = await ensureDoctorRegistered(doctorId);
    assertDoctorActive(doctor);

    const patient = await prisma.patient.findUnique({
      where: { id: data.patientId },
      select: {
        id: true,
        userId: true,
        user: { select: { name: true } },
      },
    });

    if (!patient) {
      throw ApiError.badRequest('Choose a registered patient.', {
        patientId: 'Patient not found.',
      });
    }

    const alreadyQueued = await prisma.queueEntry.findFirst({
      where: {
        patientId: patient.id,
        doctorId,
        queueDate: date,
        status: { in: ACTIVE_QUEUE_STATUSES },
      },
      select: { id: true },
    });

    if (alreadyQueued) {
      throw ApiError.conflict('This patient is already in your queue today.');
    }

    const result = await prisma.$transaction(async (tx) => {
      const aggregate = await tx.queueEntry.aggregate({
        where: { doctorId, queueDate: date },
        _max: { tokenNumber: true },
      });

      const tokenNumber = (aggregate._max.tokenNumber ?? 0) + 1;
      const now = new Date();

      const appointment = await tx.appointment.create({
        data: {
          patientId: patient.id,
          doctorId,
          date,
          slotTime: null,
          slotKey: null,
          status: 'CHECKED_IN',
          isEmergency: true,
          reason: data.reason,
          checkedInAt: now,
        },
        select: { id: true },
      });

      const queueEntry = await tx.queueEntry.create({
        data: {
          doctorId,
          patientId: patient.id,
          appointmentId: appointment.id,
          queueDate: date,
          tokenNumber,
          priority: 0,
          status: WAITING,
          checkedInAt: now,
        },
        select: QUEUE_ENTRY_CONTEXT_SELECT,
      });

      const emergencyNotification = await createNotification(tx, {
        userId: patient.userId,
        title: 'Emergency added to queue',
        message: `You have been added as an emergency patient. Your token number is #${tokenNumber}.`,
        type: 'EMERGENCY',
        appointmentId: appointment.id,
      });

      const waitingPatients = await tx.queueEntry.findMany({
        where: {
          doctorId,
          queueDate: date,
          status: WAITING,
          NOT: { id: queueEntry.id },
        },
        select: {
          tokenNumber: true,
          patient: { select: { userId: true } },
        },
      });

      const waitingNotifications = await createNotifications(
        tx,
        waitingPatients.map((waiting) => ({
          userId: waiting.patient.userId,
          title: 'Queue updated',
          message:
            'An emergency patient has been added to the queue. Your estimated wait may change.',
          type: 'QUEUE',
        })),
      );

      return {
        appointment,
        queueEntry,
        notifications: [emergencyNotification, ...waitingNotifications],
      };
    });

    queueManager.registerPatient({ id: patient.id, name: patient.user.name });
    queueManager.insertWaiting(toRuntimeEntry(result.queueEntry));

    emitNotifications(result.notifications);
    broadcastAppointmentsUpdated({
      doctorId,
      hospitalId: doctor.hospitalId,
      patientUserId: patient.userId,
    });

    const entry = serializeStaffQueueEntry(toRuntimeEntry(result.queueEntry));
    const queueView = await broadcastDoctorQueue(doctorId, date, { emergencyEntry: entry });

    return {
      queue: queueView ?? (await buildDoctorQueueView(doctorId, date)),
      entry,
    };
  });
}

export async function reportDelay(user, input) {
  const doctorId = requireDoctorId(user);
  const data = validateDelayInput(input);
  const date = todayDateString();

  return queueMutex.run(doctorQueueKey(doctorId), async () => {
    const doctor = await ensureDoctorRegistered(doctorId);
    assertDoctorActive(doctor);

    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      await tx.delayReport.updateMany({
        where: { doctorId, date, isActive: true },
        data: { isActive: false, resolvedAt: now },
      });

      const created = await tx.delayReport.create({
        data: {
          doctorId,
          date,
          delayMinutes: data.delayMinutes,
          reason: data.reason,
          isActive: true,
        },
        select: { id: true, delayMinutes: true, reason: true, createdAt: true },
      });

      const waitingPatients = await tx.queueEntry.findMany({
        where: { doctorId, queueDate: date, status: WAITING },
        select: { patient: { select: { userId: true } } },
      });

      const notifications = await createNotifications(
        tx,
        waitingPatients.map((waiting) => ({
          userId: waiting.patient.userId,
          title: 'Doctor delay update',
          message: `The doctor has reported a ${data.delayMinutes}-minute delay. ${data.reason}`,
          type: 'DELAY',
        })),
      );

      return { report: created, notifications };
    });

    const { report } = result;

    queueManager.setDoctorDelay(doctorId, report.delayMinutes);
    emitNotifications(result.notifications);

    const queueView = await broadcastDoctorQueue(doctorId, date, { delayEvent: true });

    return {
      delay: {
        id: report.id,
        minutes: report.delayMinutes,
        reason: report.reason,
        reportedAt: report.createdAt,
      },
      queue: queueView ?? (await buildDoctorQueueView(doctorId, date)),
    };
  });
}

export async function clearDelay(user) {
  const doctorId = requireDoctorId(user);
  const date = todayDateString();

  return queueMutex.run(doctorQueueKey(doctorId), async () => {
    const doctor = await ensureDoctorRegistered(doctorId);
    assertDoctorActive(doctor);

    const now = new Date();

    const notifications = await prisma.$transaction(async (tx) => {
      await tx.delayReport.updateMany({
        where: { doctorId, date, isActive: true },
        data: { isActive: false, resolvedAt: now },
      });

      const waitingPatients = await tx.queueEntry.findMany({
        where: { doctorId, queueDate: date, status: WAITING },
        select: { patient: { select: { userId: true } } },
      });

      return createNotifications(
        tx,
        waitingPatients.map((waiting) => ({
          userId: waiting.patient.userId,
          title: 'Doctor delay cleared',
          message: 'The reported delay has been cleared. Your estimated wait has been updated.',
          type: 'DELAY',
        })),
      );
    });

    queueManager.setDoctorDelay(doctorId, 0);
    emitNotifications(notifications);

    const queueView = await broadcastDoctorQueue(doctorId, date, { delayEvent: true });

    return {
      delay: { id: null, minutes: 0, reason: null, reportedAt: null },
      queue: queueView ?? (await buildDoctorQueueView(doctorId, date)),
    };
  });
}
