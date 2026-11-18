/**
 * Presentation helpers for the patient-facing live queue.
 * The server is the single source of truth for position, priority and
 * estimates; these helpers only choose labels and colours.
 */

export const QUEUE_STATUS_BADGES = {
  WAITING: { label: 'Waiting', variant: 'amber' },
  CALLED: { label: 'Called', variant: 'blue' },
  IN_CONSULTATION: { label: 'In consultation', variant: 'violet' },
  COMPLETED: { label: 'Completed', variant: 'green' },
  CANCELLED: { label: 'Cancelled', variant: 'default' },
  NO_SHOW: { label: 'No show', variant: 'red' },
};

export const APPOINTMENT_STATUS_BADGES = {
  BOOKED: { label: 'Booked', variant: 'blue' },
  CHECKED_IN: { label: 'Checked in', variant: 'teal' },
  CALLED: { label: 'Called', variant: 'amber' },
  IN_CONSULTATION: { label: 'In consultation', variant: 'violet' },
  COMPLETED: { label: 'Completed', variant: 'green' },
  CANCELLED: { label: 'Cancelled', variant: 'default' },
  NO_SHOW: { label: 'No show', variant: 'red' },
};

export function queueStatusBadge(status) {
  return QUEUE_STATUS_BADGES[status] ?? { label: status, variant: 'default' };
}

export function appointmentStatusBadge(status) {
  return APPOINTMENT_STATUS_BADGES[status] ?? { label: status, variant: 'default' };
}

export function priorityBadge(priority) {
  return Number(priority) === 0
    ? { label: 'Emergency', variant: 'red' }
    : { label: 'Normal', variant: 'default' };
}

export function formatToken(tokenNumber) {
  return `#${String(tokenNumber).padStart(2, '0')}`;
}

export function formatWait(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) return 'Less than a minute';
  if (value < 60) return `About ${Math.round(value)} min`;
  const hours = Math.floor(value / 60);
  const rest = Math.round(value % 60);
  return rest === 0 ? `About ${hours} hr` : `About ${hours} hr ${rest} min`;
}

export function formatRelativeTime(value) {
  if (!value) return '';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '';

  const diffSeconds = Math.round((then - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  const thresholds = [
    { limit: 60, unit: 'second' },
    { limit: 60 * 60, unit: 'minute' },
    { limit: 60 * 60 * 24, unit: 'hour' },
    { limit: 60 * 60 * 24 * 7, unit: 'day' },
    { limit: 60 * 60 * 24 * 30, unit: 'week' },
    { limit: 60 * 60 * 24 * 365, unit: 'month' },
    { limit: Infinity, unit: 'year' },
  ];

  let previous = 1;
  for (const { limit, unit } of thresholds) {
    if (Math.abs(diffSeconds) < limit) {
      const divisor = previous;
      return formatter.format(Math.round(diffSeconds / divisor), unit);
    }
    previous = limit;
  }

  return '';
}
