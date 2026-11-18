/**
 * Pure queue calculations. No database or Express imports so every function is
 * trivial to unit test and reason about.
 */

export function compareQueueEntries(a, b) {
  return (a.priority - b.priority) || (a.tokenNumber - b.tokenNumber);
}

/**
 * 1-based position of `target` among `entries`, using the same ordering as the
 * MinHeap: priority first, then token number. Scans the array in O(n).
 */
export function getPosition(entries, target) {
  if (!target || !Array.isArray(entries)) return null;

  let ahead = 0;
  for (const entry of entries) {
    if (compareQueueEntries(entry, target) < 0) ahead += 1;
  }

  return ahead + 1;
}

export function getAheadCount(entries, target) {
  const position = getPosition(entries, target);
  return position === null ? null : position - 1;
}

function normaliseAverage(value) {
  return Number.isFinite(value) && value > 0 ? value : 15;
}

function normaliseDelay(value) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Approximate wait before this patient's consultation starts.
 * Formula: (patients ahead + current patient if any) × average + reported delay.
 */
export function estimateWaitMinutes({
  position = 1,
  currentPatient = false,
  avgConsultationMinutes = 15,
  delayMinutes = 0,
} = {}) {
  const ahead = Math.max(0, (Number(position) || 1) - 1);
  const average = normaliseAverage(avgConsultationMinutes);
  const delay = normaliseDelay(delayMinutes);

  return Math.max(0, Math.round((ahead + (currentPatient ? 1 : 0)) * average + delay));
}

function timeToMinutes(value) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(value)) {
    return null;
  }

  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes) {
  const wrapped = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(wrapped / 60);
  const minutes = wrapped % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Estimated clock time for a patient. The estimate starts at the later of
 * "now" and the booked slot time, then adds the wait estimate.
 */
export function estimateStartTime({
  now = null,
  slotTime = null,
  position = 1,
  currentPatient = false,
  avgConsultationMinutes = 15,
  delayMinutes = 0,
} = {}) {
  const nowValue = timeToMinutes(now);
  const slotValue = timeToMinutes(slotTime);

  let base;
  if (nowValue === null && slotValue === null) return null;
  if (nowValue === null) base = slotValue;
  else if (slotValue === null) base = nowValue;
  else base = Math.max(nowValue, slotValue);

  return minutesToTime(
    base +
      estimateWaitMinutes({
        position,
        currentPatient,
        avgConsultationMinutes,
        delayMinutes,
      }),
  );
}

/**
 * Uses the doctor's configured average until at least three consultations have
 * been completed today; after that it uses today's actual average.
 */
export function calculateEffectiveAverage(doctorAvg, completedTodayDurations = []) {
  const configured = normaliseAverage(doctorAvg);
  const durations = (completedTodayDurations ?? []).filter(
    (value) => Number.isFinite(value) && value > 0,
  );

  if (durations.length < 3) return configured;

  const total = durations.reduce((sum, value) => sum + value, 0);
  return Math.max(1, Math.round(total / durations.length));
}
