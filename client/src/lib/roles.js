export const ROLES = {
  PATIENT: 'PATIENT',
  DOCTOR: 'DOCTOR',
  HOSPITAL_ADMIN: 'HOSPITAL_ADMIN',
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
};

export const ROLE_LABELS = {
  PATIENT: 'Patient',
  DOCTOR: 'Doctor',
  HOSPITAL_ADMIN: 'Hospital administrator',
  PLATFORM_ADMIN: 'Platform administrator',
};

export const ROLE_HOME = {
  PATIENT: '/patient',
  DOCTOR: '/doctor',
  HOSPITAL_ADMIN: '/hospital',
  PLATFORM_ADMIN: '/platform',
};

export const ROLE_DESCRIPTIONS = {
  PATIENT:
    'Book appointments, check in on the day, and follow your live token and queue position.',
  DOCTOR:
    'Run your daily consultation queue, call patients in priority order, and report delays.',
  HOSPITAL_ADMIN:
    'Manage your hospital profile, doctors, weekly schedules, appointments and live queues.',
  PLATFORM_ADMIN:
    'Register hospitals and create the administrator account for each hospital.',
};

export const ROLE_BADGE_CLASSES = {
  PATIENT: 'bg-blue-50 text-blue-700 ring-blue-200',
  DOCTOR: 'bg-teal-50 text-teal-700 ring-teal-200',
  HOSPITAL_ADMIN: 'bg-amber-50 text-amber-700 ring-amber-200',
  PLATFORM_ADMIN: 'bg-violet-50 text-violet-700 ring-violet-200',
};

export const ROLE_ACCENTS = {
  PATIENT: 'bg-blue-600',
  DOCTOR: 'bg-teal-600',
  HOSPITAL_ADMIN: 'bg-amber-500',
  PLATFORM_ADMIN: 'bg-violet-600',
};

export function getRoleHome(role) {
  return ROLE_HOME[role] || '/';
}

export function getRoleLabel(role) {
  return ROLE_LABELS[role] || 'Signed-in user';
}

export function getInitials(name = '') {
  const parts = String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) return '?';
  return parts.map((part) => part[0].toUpperCase()).join('');
}

const NAME_TITLES = new Set([
  'dr',
  'dr.',
  'mr',
  'mr.',
  'mrs',
  'mrs.',
  'ms',
  'ms.',
]);

/** Returns a friendly first name, skipping honorifics such as "Dr.". */
export function getFirstName(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  const meaningful = parts.find((part) => !NAME_TITLES.has(part.toLowerCase()));
  return meaningful || parts[0] || 'there';
}

const GENERIC_ACCOUNT_NAMES = new Set([
  'platform administrator',
  'platform admin',
  'hospital administrator',
  'hospital admin',
]);

/** Greeting name that keeps generic account names intact. */
export function getGreetingName(name = '') {
  const cleaned = String(name).trim();
  if (GENERIC_ACCOUNT_NAMES.has(cleaned.toLowerCase())) return cleaned;
  return getFirstName(cleaned);
}
