/**
 * Presentation helpers shared by the doctor workspace.
 * The server remains the source of truth for queue state and estimates.
 */

export function formatPatientMeta(patient) {
  if (!patient) return '';

  const bits = [];
  if (patient.age !== null && patient.age !== undefined) bits.push(`${patient.age} yrs`);
  if (patient.gender) bits.push(patient.gender);
  if (patient.bloodGroup) bits.push(`Blood ${patient.bloodGroup}`);
  return bits.join(' · ');
}

export function formatClock(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatClockWithSeconds(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export const DELAY_PRESETS = [10, 15, 20, 30, 45, 60];

/** Token priority chip colours for the DSA panel and waiting list. */
export function priorityChipClasses(priority) {
  return Number(priority) === 0
    ? 'border-red-200 bg-red-50 text-red-700'
    : 'border-slate-200 bg-white text-slate-700';
}
