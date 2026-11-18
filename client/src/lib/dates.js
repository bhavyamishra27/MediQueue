export const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday', short: 'Sun' },
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
  { value: 6, label: 'Saturday', short: 'Sat' },
];

// Monday-first display order for weekly schedule grids.
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const DAY_BY_VALUE = new Map(DAYS_OF_WEEK.map((day) => [day.value, day]));

export function getDayLabel(dayOfWeek, { short = false } = {}) {
  const day = DAY_BY_VALUE.get(Number(dayOfWeek));
  if (!day) return 'Unknown day';
  return short ? day.short : day.label;
}

export function formatTimeRange(startTime, endTime) {
  return `${startTime} – ${endTime}`;
}

export function timeToMinutes(value) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function formatDuration(minutes) {
  const total = Math.max(0, Number(minutes) || 0);
  const hours = Math.floor(total / 60);
  const remaining = total % 60;
  if (hours === 0) return `${remaining} min`;
  if (remaining === 0) return `${hours} hr`;
  return `${hours} hr ${remaining} min`;
}

export function formatScheduleSummary(schedules = []) {
  const active = schedules.filter((schedule) => schedule.isActive);
  if (active.length === 0) return 'No weekly schedule';

  const days = [
    ...new Set(active.map((schedule) => getDayLabel(schedule.dayOfWeek, { short: true }))),
  ];

  return `${days.join(', ')} · ${active.length} session${active.length === 1 ? '' : 's'}`;
}

// ---------------------------------------------------------------------------
// Calendar-date helpers for Phase 4 booking. Dates are stored as local
// "YYYY-MM-DD" strings, so never parse them with `new Date(string)` (which
// would treat them as UTC).
// ---------------------------------------------------------------------------

export function toDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getTodayDateString() {
  return toDateString(new Date());
}

function parseDateParts(dateString) {
  const [year, month, day] = String(dateString).split('-').map(Number);
  return { year, month, day };
}

export function addDaysToDateString(dateString, days) {
  const { year, month, day } = parseDateParts(dateString);
  return toDateString(new Date(year, month - 1, day + days));
}

export function getDayOfWeekFromDateString(dateString) {
  const { year, month, day } = parseDateParts(dateString);
  return new Date(year, month - 1, day).getDay();
}

export function isPastDateString(dateString) {
  return dateString < getTodayDateString();
}

export function formatDateLabel(dateString) {
  const { year, month, day } = parseDateParts(dateString);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateLong(dateString) {
  const { year, month, day } = parseDateParts(dateString);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}
