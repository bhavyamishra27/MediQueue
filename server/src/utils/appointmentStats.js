/**
 * Shared appointment status groups and count helpers.
 *
 * "In queue" deliberately uses appointment statuses, not queue-entry statuses:
 * a checked-in, called or in-consultation appointment is the same patient that
 * the live queue engine is tracking.
 */
export const IN_QUEUE_APPOINTMENT_STATUSES = ['CHECKED_IN', 'CALLED', 'IN_CONSULTATION'];

export function buildAppointmentCounts(appointments = []) {
  const counts = {
    total: appointments.length,
    booked: 0,
    inQueue: 0,
    completed: 0,
    noShow: 0,
    cancelled: 0,
    emergency: 0,
  };

  for (const appointment of appointments) {
    if (appointment.status === 'BOOKED') counts.booked += 1;
    if (IN_QUEUE_APPOINTMENT_STATUSES.includes(appointment.status)) counts.inQueue += 1;
    if (appointment.status === 'COMPLETED') counts.completed += 1;
    if (appointment.status === 'NO_SHOW') counts.noShow += 1;
    if (appointment.status === 'CANCELLED') counts.cancelled += 1;
    if (appointment.isEmergency) counts.emergency += 1;
  }

  return counts;
}
