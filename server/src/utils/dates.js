/**
 * Local-date helpers for Phase 4 booking.
 *
 * MediQueue stores calendar dates as "YYYY-MM-DD" strings and treats them as
 * local dates. Parsing with `new Date("YYYY-MM-DD")` would interpret the value
 * as UTC and shift the day in some timezones, so every helper builds dates from
 * explicit local parts instead.
 */

export const BOOKING_WINDOW_DAYS = 30;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function toLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayDateString() {
  return toLocalDateString(new Date());
}

export function parseDateString(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return null;

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export function isValidDateString(value) {
  return parseDateString(value) !== null;
}

export function getDayOfWeek(dateString) {
  const date = parseDateString(dateString);
  return date ? date.getDay() : null;
}

export function addDaysToDateString(dateString, days) {
  const date = parseDateString(dateString);
  if (!date) return null;

  date.setDate(date.getDate() + days);
  return toLocalDateString(date);
}

export function isPastDate(dateString) {
  return dateString < todayDateString();
}

export function isToday(dateString) {
  return dateString === todayDateString();
}

export function nowMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

export function minutesToTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}
