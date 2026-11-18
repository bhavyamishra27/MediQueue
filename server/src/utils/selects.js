/**
 * Shared Prisma select objects. Keeping them in one place makes it easy to see
 * exactly which columns are exposed by the public and administrator APIs.
 */

export const SCHEDULE_SELECT = {
  id: true,
  dayOfWeek: true,
  startTime: true,
  endTime: true,
  slotDurationMinutes: true,
  isActive: true,
};

export const PUBLIC_DOCTOR_SUMMARY_SELECT = {
  id: true,
  specialization: true,
  qualification: true,
  experienceYears: true,
  avgConsultationMinutes: true,
  roomNumber: true,
  bio: true,
  user: { select: { name: true } },
  hospital: { select: { id: true, name: true, city: true, address: true } },
};

export const PUBLIC_DOCTOR_DETAIL_SELECT = {
  ...PUBLIC_DOCTOR_SUMMARY_SELECT,
  hospital: {
    select: {
      id: true,
      name: true,
      address: true,
      city: true,
      phone: true,
      email: true,
      description: true,
    },
  },
  schedules: {
    where: { isActive: true },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    select: SCHEDULE_SELECT,
  },
};

export const SLOT_DOCTOR_SELECT = {
  id: true,
  specialization: true,
  avgConsultationMinutes: true,
  roomNumber: true,
  user: { select: { name: true } },
  hospital: { select: { id: true, name: true, city: true, address: true } },
};

export const PATIENT_APPOINTMENT_SELECT = {
  id: true,
  date: true,
  slotTime: true,
  status: true,
  isEmergency: true,
  reason: true,
  bookedAt: true,
  checkedInAt: true,
  cancelledAt: true,
  doctor: {
    select: {
      id: true,
      specialization: true,
      roomNumber: true,
      avgConsultationMinutes: true,
      user: { select: { name: true } },
      hospital: { select: { id: true, name: true, city: true, address: true } },
    },
  },
};

export const ADMIN_DOCTOR_SELECT = {
  id: true,
  userId: true,
  specialization: true,
  qualification: true,
  experienceYears: true,
  avgConsultationMinutes: true,
  roomNumber: true,
  bio: true,
  isActive: true,
  createdAt: true,
  user: { select: { name: true, email: true, phone: true } },
  schedules: {
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    select: SCHEDULE_SELECT,
  },
};
