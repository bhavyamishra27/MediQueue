/**
 * Response serializers for Phase 3. Public shapes deliberately exclude
 * administrator identities, user emails, password hashes and internal ids that
 * the public does not need.
 */

export function serializeSchedule(schedule) {
  return {
    id: schedule.id,
    dayOfWeek: schedule.dayOfWeek,
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    slotDurationMinutes: schedule.slotDurationMinutes,
    isActive: schedule.isActive,
  };
}

export function serializePublicDoctorSummary(doctor) {
  return {
    id: doctor.id,
    name: doctor.user?.name ?? 'Doctor',
    specialization: doctor.specialization,
    qualification: doctor.qualification ?? null,
    experienceYears: doctor.experienceYears ?? null,
    avgConsultationMinutes: doctor.avgConsultationMinutes,
    roomNumber: doctor.roomNumber ?? null,
    bio: doctor.bio ?? null,
    hospital: doctor.hospital
      ? {
          id: doctor.hospital.id,
          name: doctor.hospital.name,
          city: doctor.hospital.city,
          address: doctor.hospital.address,
        }
      : null,
  };
}

export function serializePublicDoctorDetail(doctor) {
  return {
    ...serializePublicDoctorSummary(doctor),
    hospital: doctor.hospital
      ? {
          id: doctor.hospital.id,
          name: doctor.hospital.name,
          address: doctor.hospital.address,
          city: doctor.hospital.city,
          phone: doctor.hospital.phone,
          email: doctor.hospital.email ?? null,
          description: doctor.hospital.description ?? null,
        }
      : null,
    schedules: (doctor.schedules ?? []).map(serializeSchedule),
  };
}

export function serializePublicHospitalSummary(hospital) {
  const doctors = hospital.doctors ?? [];
  const specializations = [...new Set(doctors.map((doctor) => doctor.specialization))];

  return {
    id: hospital.id,
    name: hospital.name,
    address: hospital.address,
    city: hospital.city,
    phone: hospital.phone,
    email: hospital.email ?? null,
    description: hospital.description ?? null,
    doctorCount: doctors.length,
    specializations: specializations.sort((a, b) => a.localeCompare(b)),
  };
}

export function serializePublicHospitalDetail(hospital) {
  return {
    id: hospital.id,
    name: hospital.name,
    address: hospital.address,
    city: hospital.city,
    phone: hospital.phone,
    email: hospital.email ?? null,
    description: hospital.description ?? null,
    doctors: (hospital.doctors ?? []).map(serializePublicDoctorSummary),
  };
}

export function serializeAdminDoctor(doctor) {
  return {
    id: doctor.id,
    userId: doctor.userId,
    name: doctor.user?.name ?? 'Doctor',
    email: doctor.user?.email ?? null,
    phone: doctor.user?.phone ?? null,
    specialization: doctor.specialization,
    qualification: doctor.qualification ?? null,
    experienceYears: doctor.experienceYears ?? null,
    avgConsultationMinutes: doctor.avgConsultationMinutes,
    roomNumber: doctor.roomNumber ?? null,
    bio: doctor.bio ?? null,
    isActive: doctor.isActive,
    createdAt: doctor.createdAt,
    schedules: (doctor.schedules ?? []).map(serializeSchedule),
  };
}

export function serializeAdminHospital(hospital) {
  return {
    id: hospital.id,
    name: hospital.name,
    address: hospital.address,
    city: hospital.city,
    phone: hospital.phone,
    email: hospital.email ?? null,
    description: hospital.description ?? null,
    createdAt: hospital.createdAt,
    updatedAt: hospital.updatedAt,
  };
}

/**
 * Clinical patient details for authorized staff (doctors and hospital
 * administrators). It never includes password hashes or account user ids.
 */
export function ageFromDateOfBirth(dateOfBirth) {
  if (!dateOfBirth) return null;

  const birth = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDelta = now.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birth.getDate())) {
    age -= 1;
  }

  return age >= 0 && age < 130 ? age : null;
}

export function serializePatientInfo(patient) {
  if (!patient) return null;

  return {
    id: patient.id,
    name: patient.user?.name ?? 'Patient',
    email: patient.user?.email ?? null,
    phone: patient.user?.phone ?? null,
    dateOfBirth: patient.dateOfBirth ?? null,
    age: ageFromDateOfBirth(patient.dateOfBirth),
    gender: patient.gender ?? null,
    bloodGroup: patient.bloodGroup ?? null,
  };
}

/**
 * Patient-facing appointment shape. It never exposes the slot key, the
 * patient's database id or any other patient's details.
 */
export function serializePatientAppointment(appointment) {
  return {
    id: appointment.id,
    date: appointment.date,
    slotTime: appointment.slotTime ?? null,
    status: appointment.status,
    isEmergency: appointment.isEmergency,
    reason: appointment.reason ?? null,
    bookedAt: appointment.bookedAt,
    checkedInAt: appointment.checkedInAt ?? null,
    cancelledAt: appointment.cancelledAt ?? null,
    doctor: appointment.doctor
      ? {
          id: appointment.doctor.id,
          name: appointment.doctor.user?.name ?? 'Doctor',
          specialization: appointment.doctor.specialization,
          roomNumber: appointment.doctor.roomNumber ?? null,
          avgConsultationMinutes: appointment.doctor.avgConsultationMinutes,
        }
      : null,
    hospital: appointment.doctor?.hospital
      ? {
          id: appointment.doctor.hospital.id,
          name: appointment.doctor.hospital.name,
          city: appointment.doctor.hospital.city,
          address: appointment.doctor.hospital.address,
        }
      : null,
  };
}

export function serializeSlotDoctor(doctor) {
  return {
    id: doctor.id,
    name: doctor.user?.name ?? 'Doctor',
    specialization: doctor.specialization,
    avgConsultationMinutes: doctor.avgConsultationMinutes,
    roomNumber: doctor.roomNumber ?? null,
    hospital: doctor.hospital
      ? {
          id: doctor.hospital.id,
          name: doctor.hospital.name,
          city: doctor.hospital.city,
          address: doctor.hospital.address,
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Phase 5: live queue shapes
// ---------------------------------------------------------------------------

/**
 * Hides a patient's identity from other patients while keeping the queue
 * readable: "Aarav Sharma" -> "A*** S***".
 */
export function maskPatientName(name) {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return 'Patient';
  return parts.map((part) => `${part[0].toUpperCase()}***`).join(' ');
}

function priorityLabel(priority) {
  return priority === 0 ? 'Emergency' : 'Normal';
}

/**
 * Staff-facing queue entry. Doctors and hospital administrators may see names
 * because they are authorized to run the queue.
 */
export function serializeStaffQueueEntry(entry) {
  return {
    id: entry.id,
    appointmentId: entry.appointmentId ?? null,
    patientId: entry.patientId ?? null,
    patientName: entry.patientName ?? 'Patient',
    tokenNumber: entry.tokenNumber,
    priority: entry.priority,
    priorityLabel: priorityLabel(entry.priority),
    status: entry.status,
    slotTime: entry.slotTime ?? null,
    position: entry.position ?? null,
    estimatedWaitMinutes: entry.estimatedWaitMinutes ?? null,
    estimatedStartTime: entry.estimatedStartTime ?? null,
    checkedInAt: entry.checkedInAt ?? null,
    calledAt: entry.calledAt ?? null,
    startedAt: entry.startedAt ?? null,
  };
}

/**
 * Patient-facing queue entry: the patient's own token and estimates. It never
 * exposes another patient's id, appointment id or name.
 */
export function serializePatientQueueEntry(entry) {
  return {
    id: entry.id,
    tokenNumber: entry.tokenNumber,
    priority: entry.priority,
    priorityLabel: priorityLabel(entry.priority),
    status: entry.status,
    position: entry.position ?? null,
    estimatedWaitMinutes: entry.estimatedWaitMinutes ?? null,
    estimatedStartTime: entry.estimatedStartTime ?? null,
    checkedInAt: entry.checkedInAt ?? null,
    slotTime: entry.slotTime ?? null,
  };
}

/**
 * Privacy-safe queue row shown to patients: token, masked name and priority
 * only. The `isYou` flag lets the UI highlight the signed-in patient.
 */
export function serializeSafeQueueRow(entry, { isYou = false } = {}) {
  return {
    tokenNumber: entry.tokenNumber,
    patientName: maskPatientName(entry.patientName),
    priority: entry.priority,
    priorityLabel: priorityLabel(entry.priority),
    status: entry.status,
    position: entry.position ?? null,
    isYou,
  };
}

export function serializeDsaEntry(entry) {
  return {
    tokenNumber: entry.tokenNumber,
    priority: entry.priority,
    priorityLabel: priorityLabel(entry.priority),
    patientName: entry.patientName ?? 'Patient',
    status: entry.status,
  };
}

export function serializeNotification(notification) {
  return {
    id: notification.id,
    title: notification.title,
    message: notification.message,
    type: notification.type,
    isRead: notification.isRead,
    appointmentId: notification.appointmentId ?? null,
    createdAt: notification.createdAt,
  };
}

export function serializeDsaSnapshot(dsa) {
  return {
    comparator: dsa.comparator,
    heapArray: (dsa.heapArray ?? []).map(serializeDsaEntry),
    fifoOrder: (dsa.fifoOrder ?? []).map(serializeDsaEntry),
    orderedWaiting: (dsa.orderedWaiting ?? []).map(serializeDsaEntry),
    current: dsa.current ? serializeDsaEntry(dsa.current) : null,
    size: dsa.size,
    isEmpty: dsa.isEmpty,
    operations: dsa.operations ?? [],
    complexities: dsa.complexities ?? [],
  };
}
