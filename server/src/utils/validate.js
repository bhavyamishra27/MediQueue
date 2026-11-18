import { ApiError } from './ApiError.js';
import {
  BOOKING_WINDOW_DAYS,
  addDaysToDateString,
  isPastDate,
  isValidDateString,
  todayDateString,
} from './dates.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function isValidEmail(value) {
  return typeof value === 'string' && value.length <= 254 && EMAIL_PATTERN.test(value);
}

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isRealDate(value) {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;

  // Compare UTC parts explicitly. Using local-time parsing and toISOString()
  // would shift the date by a day in non-UTC timezones.
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Validates login input. Deliberately does not distinguish between an unknown
 * email and a wrong password so the API cannot be used to enumerate accounts.
 */
export function validateLoginInput(input = {}) {
  const email = normalizeEmail(input.email);
  const password = typeof input.password === 'string' ? input.password : '';

  const details = {};
  if (!email) details.email = 'Email is required.';
  else if (!isValidEmail(email)) details.email = 'Enter a valid email address.';
  if (!password) details.password = 'Password is required.';

  if (Object.keys(details).length > 0) {
    throw ApiError.badRequest('Please provide a valid email and password.', details);
  }

  return { email, password };
}

/**
 * Validates and normalizes patient self-registration input.
 * Only patients may self-register; staff accounts are created by an administrator.
 */
export function validateRegistrationInput(input = {}) {
  const details = {};

  const name = cleanString(input.name);
  if (name.length < 2) details.name = 'Name must be at least 2 characters.';
  else if (name.length > 80) details.name = 'Name must be 80 characters or fewer.';

  const email = normalizeEmail(input.email);
  if (!email) details.email = 'Email is required.';
  else if (!isValidEmail(email)) details.email = 'Enter a valid email address.';

  const password = typeof input.password === 'string' ? input.password : '';
  if (password.length < 8) details.password = 'Password must be at least 8 characters.';
  else if (Buffer.byteLength(password, 'utf8') > 72) {
    // bcrypt only uses the first 72 bytes; reject longer input instead of
    // silently truncating it.
    details.password = 'Password is too long (maximum 72 bytes).';
  }

  const phone = cleanString(input.phone);
  if (phone && phone.length > 30) details.phone = 'Phone number must be 30 characters or fewer.';

  const dateOfBirth = cleanString(input.dateOfBirth);
  if (dateOfBirth) {
    if (!isRealDate(dateOfBirth)) {
      details.dateOfBirth = 'Date of birth must use the YYYY-MM-DD format.';
    } else if (new Date(`${dateOfBirth}T00:00:00Z`) > new Date()) {
      details.dateOfBirth = 'Date of birth cannot be in the future.';
    }
  }

  const gender = cleanString(input.gender);
  if (gender.length > 20) details.gender = 'Gender must be 20 characters or fewer.';

  const bloodGroup = cleanString(input.bloodGroup).toUpperCase();
  if (bloodGroup.length > 10) details.bloodGroup = 'Blood group must be 10 characters or fewer.';

  if (Object.keys(details).length > 0) {
    throw ApiError.badRequest('Please correct the highlighted fields.', details);
  }

  return {
    name,
    email,
    password,
    phone: phone || null,
    dateOfBirth: dateOfBirth || null,
    gender: gender || null,
    bloodGroup: bloodGroup || null,
  };
}

// ---------------------------------------------------------------------------
// Phase 3: hospital, doctor and schedule validation
// ---------------------------------------------------------------------------

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function hasOwn(input, key) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

export function isValidTime(value) {
  return typeof value === 'string' && TIME_PATTERN.test(value);
}

export function timeToMinutes(value) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Parses an optional whole number. `undefined`, `null` and an empty string mean
 * "not provided" and return null. Anything invalid returns NaN so callers can
 * add a field error.
 */
function parseOptionalWholeNumber(value, min, max) {
  if (value === undefined || value === null || value === '') return null;
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(number) || number < min || number > max) return Number.NaN;
  return number;
}

function validateRequiredText(value, { field, label, min, max, details }) {
  const text = cleanString(value);
  if (text.length < min) {
    details[field] = `${label} must be at least ${min} characters.`;
  } else if (text.length > max) {
    details[field] = `${label} must be ${max} characters or fewer.`;
  }
  return text;
}

function validateOptionalText(value, { field, label, max, details }) {
  const text = cleanString(value);
  if (text.length > max) {
    details[field] = `${label} must be ${max} characters or fewer.`;
  }
  return text || null;
}

function validatePhoneValue(value, details, { required = false } = {}) {
  const phone = cleanString(value);
  if (required && phone.length < 5) {
    details.phone = 'Phone number is required.';
  } else if (phone && phone.length < 5) {
    details.phone = 'Phone number must be at least 5 characters.';
  } else if (phone.length > 30) {
    details.phone = 'Phone number must be 30 characters or fewer.';
  }
  return phone || null;
}

/**
 * Partial update of the signed-in hospital administrator's hospital profile.
 * Only supplied fields are validated and returned, so PATCH stays a PATCH.
 */
export function validateHospitalProfileUpdate(input = {}) {
  const details = {};
  const data = {};
  const fields = ['name', 'address', 'city', 'phone', 'email', 'description'];
  const provided = fields.filter((field) => hasOwn(input, field));

  if (provided.length === 0) {
    throw ApiError.badRequest('No hospital profile changes were provided.');
  }

  if (hasOwn(input, 'name')) {
    data.name = validateRequiredText(input.name, {
      field: 'name',
      label: 'Hospital name',
      min: 2,
      max: 120,
      details,
    });
  }

  if (hasOwn(input, 'address')) {
    data.address = validateRequiredText(input.address, {
      field: 'address',
      label: 'Address',
      min: 5,
      max: 200,
      details,
    });
  }

  if (hasOwn(input, 'city')) {
    data.city = validateRequiredText(input.city, {
      field: 'city',
      label: 'City',
      min: 2,
      max: 80,
      details,
    });
  }

  if (hasOwn(input, 'phone')) {
    data.phone = validatePhoneValue(input.phone, details, { required: true });
  }

  if (hasOwn(input, 'email')) {
    const email = normalizeEmail(input.email);
    if (email && !isValidEmail(email)) {
      details.email = 'Enter a valid email address.';
    }
    data.email = email || null;
  }

  if (hasOwn(input, 'description')) {
    data.description = validateOptionalText(input.description, {
      field: 'description',
      label: 'Description',
      max: 1000,
      details,
    });
  }

  if (Object.keys(details).length > 0) {
    throw ApiError.badRequest('Please correct the highlighted fields.', details);
  }

  return data;
}

/**
 * Creates the User + Doctor pair for a hospital administrator. The role is
 * always forced to DOCTOR; callers cannot create another administrator here.
 */
export function validateDoctorCreateInput(input = {}) {
  const details = {};

  const name = validateRequiredText(input.name, {
    field: 'name',
    label: 'Doctor name',
    min: 2,
    max: 80,
    details,
  });

  const email = normalizeEmail(input.email);
  if (!email) details.email = 'Email is required.';
  else if (!isValidEmail(email)) details.email = 'Enter a valid email address.';

  const password = typeof input.password === 'string' ? input.password : '';
  if (password.length < 8) {
    details.password = 'Password must be at least 8 characters.';
  } else if (Buffer.byteLength(password, 'utf8') > 72) {
    details.password = 'Password is too long (maximum 72 bytes).';
  }

  const phone = validatePhoneValue(input.phone, details);

  const specialization = validateRequiredText(input.specialization, {
    field: 'specialization',
    label: 'Specialization',
    min: 2,
    max: 80,
    details,
  });

  const qualification = validateOptionalText(input.qualification, {
    field: 'qualification',
    label: 'Qualification',
    max: 120,
    details,
  });

  const experienceYears = parseOptionalWholeNumber(input.experienceYears, 0, 70);
  if (Number.isNaN(experienceYears)) {
    details.experienceYears = 'Experience must be a whole number between 0 and 70.';
  }

  const rawAverage = hasOwn(input, 'avgConsultationMinutes')
    ? input.avgConsultationMinutes
    : 15;
  const avgConsultationMinutes = parseOptionalWholeNumber(rawAverage, 5, 120);
  if (avgConsultationMinutes === null || Number.isNaN(avgConsultationMinutes)) {
    details.avgConsultationMinutes =
      'Average consultation time must be a whole number between 5 and 120 minutes.';
  }

  const roomNumber = validateOptionalText(input.roomNumber, {
    field: 'roomNumber',
    label: 'Room number',
    max: 30,
    details,
  });

  const bio = validateOptionalText(input.bio, {
    field: 'bio',
    label: 'Bio',
    max: 1000,
    details,
  });

  if (Object.keys(details).length > 0) {
    throw ApiError.badRequest('Please correct the highlighted fields.', details);
  }

  return {
    name,
    email,
    password,
    phone,
    specialization,
    qualification,
    experienceYears,
    avgConsultationMinutes,
    roomNumber,
    bio,
  };
}

/**
 * Partial update of a doctor. The hospital relation is never accepted from the
 * client, so an administrator cannot move a doctor to another hospital.
 */
export function validateDoctorUpdateInput(input = {}) {
  const details = {};
  const data = {};
  const fields = [
    'name',
    'email',
    'phone',
    'specialization',
    'qualification',
    'experienceYears',
    'avgConsultationMinutes',
    'roomNumber',
    'bio',
    'isActive',
  ];
  const provided = fields.filter((field) => hasOwn(input, field));

  if (provided.length === 0) {
    throw ApiError.badRequest('No doctor changes were provided.');
  }

  if (hasOwn(input, 'name')) {
    data.name = validateRequiredText(input.name, {
      field: 'name',
      label: 'Doctor name',
      min: 2,
      max: 80,
      details,
    });
  }

  if (hasOwn(input, 'email')) {
    const email = normalizeEmail(input.email);
    if (!email) details.email = 'Email is required.';
    else if (!isValidEmail(email)) details.email = 'Enter a valid email address.';
    data.email = email;
  }

  if (hasOwn(input, 'phone')) {
    data.phone = validatePhoneValue(input.phone, details);
  }

  if (hasOwn(input, 'specialization')) {
    data.specialization = validateRequiredText(input.specialization, {
      field: 'specialization',
      label: 'Specialization',
      min: 2,
      max: 80,
      details,
    });
  }

  if (hasOwn(input, 'qualification')) {
    data.qualification = validateOptionalText(input.qualification, {
      field: 'qualification',
      label: 'Qualification',
      max: 120,
      details,
    });
  }

  if (hasOwn(input, 'experienceYears')) {
    const experienceYears = parseOptionalWholeNumber(input.experienceYears, 0, 70);
    if (Number.isNaN(experienceYears)) {
      details.experienceYears = 'Experience must be a whole number between 0 and 70.';
    }
    data.experienceYears = experienceYears;
  }

  if (hasOwn(input, 'avgConsultationMinutes')) {
    const average = parseOptionalWholeNumber(input.avgConsultationMinutes, 5, 120);
    if (average === null || Number.isNaN(average)) {
      details.avgConsultationMinutes =
        'Average consultation time must be a whole number between 5 and 120 minutes.';
    }
    data.avgConsultationMinutes = average;
  }

  if (hasOwn(input, 'roomNumber')) {
    data.roomNumber = validateOptionalText(input.roomNumber, {
      field: 'roomNumber',
      label: 'Room number',
      max: 30,
      details,
    });
  }

  if (hasOwn(input, 'bio')) {
    data.bio = validateOptionalText(input.bio, {
      field: 'bio',
      label: 'Bio',
      max: 1000,
      details,
    });
  }

  if (hasOwn(input, 'isActive')) {
    if (typeof input.isActive !== 'boolean') {
      details.isActive = 'Active status must be true or false.';
    } else {
      data.isActive = input.isActive;
    }
  }

  if (Object.keys(details).length > 0) {
    throw ApiError.badRequest('Please correct the highlighted fields.', details);
  }

  return data;
}

export function validateScheduleCreateInput(input = {}) {
  const details = {};

  const dayOfWeek = parseOptionalWholeNumber(input.dayOfWeek, 0, 6);
  if (dayOfWeek === null) {
    details.dayOfWeek = 'Day of week is required.';
  } else if (Number.isNaN(dayOfWeek)) {
    details.dayOfWeek = 'Day of week must be between 0 (Sunday) and 6 (Saturday).';
  }

  const startTime = cleanString(input.startTime);
  if (!isValidTime(startTime)) {
    details.startTime = 'Start time must use the HH:mm format.';
  }

  const endTime = cleanString(input.endTime);
  if (!isValidTime(endTime)) {
    details.endTime = 'End time must use the HH:mm format.';
  }

  if (
    !details.startTime &&
    !details.endTime &&
    timeToMinutes(endTime) <= timeToMinutes(startTime)
  ) {
    details.endTime = 'End time must be after the start time.';
  }

  const rawDuration = hasOwn(input, 'slotDurationMinutes')
    ? input.slotDurationMinutes
    : 15;
  const slotDurationMinutes = parseOptionalWholeNumber(rawDuration, 5, 240);
  if (slotDurationMinutes === null || Number.isNaN(slotDurationMinutes)) {
    details.slotDurationMinutes =
      'Slot duration must be a whole number between 5 and 240 minutes.';
  } else if (!details.startTime && !details.endTime) {
    const windowMinutes = timeToMinutes(endTime) - timeToMinutes(startTime);
    if (slotDurationMinutes > windowMinutes) {
      details.slotDurationMinutes =
        'Slot duration cannot exceed the schedule window.';
    }
  }

  let isActive = true;
  if (hasOwn(input, 'isActive')) {
    if (typeof input.isActive !== 'boolean') {
      details.isActive = 'Active status must be true or false.';
    } else {
      isActive = input.isActive;
    }
  }

  if (Object.keys(details).length > 0) {
    throw ApiError.badRequest('Please correct the highlighted fields.', details);
  }

  return { dayOfWeek, startTime, endTime, slotDurationMinutes, isActive };
}

export function validateScheduleUpdateInput(input = {}) {
  const details = {};
  const data = {};
  const fields = [
    'dayOfWeek',
    'startTime',
    'endTime',
    'slotDurationMinutes',
    'isActive',
  ];
  const provided = fields.filter((field) => hasOwn(input, field));

  if (provided.length === 0) {
    throw ApiError.badRequest('No schedule changes were provided.');
  }

  if (hasOwn(input, 'dayOfWeek')) {
    const dayOfWeek = parseOptionalWholeNumber(input.dayOfWeek, 0, 6);
    if (dayOfWeek === null || Number.isNaN(dayOfWeek)) {
      details.dayOfWeek = 'Day of week must be between 0 (Sunday) and 6 (Saturday).';
    }
    data.dayOfWeek = dayOfWeek;
  }

  if (hasOwn(input, 'startTime')) {
    const startTime = cleanString(input.startTime);
    if (!isValidTime(startTime)) {
      details.startTime = 'Start time must use the HH:mm format.';
    }
    data.startTime = startTime;
  }

  if (hasOwn(input, 'endTime')) {
    const endTime = cleanString(input.endTime);
    if (!isValidTime(endTime)) {
      details.endTime = 'End time must use the HH:mm format.';
    }
    data.endTime = endTime;
  }

  if (hasOwn(input, 'slotDurationMinutes')) {
    const slotDurationMinutes = parseOptionalWholeNumber(
      input.slotDurationMinutes,
      5,
      240,
    );
    if (slotDurationMinutes === null || Number.isNaN(slotDurationMinutes)) {
      details.slotDurationMinutes =
        'Slot duration must be a whole number between 5 and 240 minutes.';
    }
    data.slotDurationMinutes = slotDurationMinutes;
  }

  if (hasOwn(input, 'isActive')) {
    if (typeof input.isActive !== 'boolean') {
      details.isActive = 'Active status must be true or false.';
    } else {
      data.isActive = input.isActive;
    }
  }

  if (Object.keys(details).length > 0) {
    throw ApiError.badRequest('Please correct the highlighted fields.', details);
  }

  return data;
}

// ---------------------------------------------------------------------------
// Phase 4: appointment booking validation
// ---------------------------------------------------------------------------

/**
 * Validates the appointment-booking body. The slot itself is checked against
 * the doctor's generated schedule in the service layer; this function only
 * covers shape, date format and booking-window rules.
 */
export function validateAppointmentCreateInput(input = {}) {
  const details = {};

  const doctorId = cleanString(input.doctorId);
  if (!doctorId) details.doctorId = 'Choose a doctor.';

  const date = cleanString(input.date);
  if (!date) {
    details.date = 'Choose a date.';
  } else if (!isValidDateString(date)) {
    details.date = 'Date must use the YYYY-MM-DD format.';
  } else if (isPastDate(date)) {
    details.date = 'Appointments cannot be booked for a past date.';
  } else {
    const lastBookableDate = addDaysToDateString(todayDateString(), BOOKING_WINDOW_DAYS);
    if (lastBookableDate && date > lastBookableDate) {
      details.date = `Appointments can be booked up to ${BOOKING_WINDOW_DAYS} days ahead.`;
    }
  }

  const slotTime = cleanString(input.slotTime);
  if (!slotTime) {
    details.slotTime = 'Choose a time slot.';
  } else if (!isValidTime(slotTime)) {
    details.slotTime = 'Slot time must use the HH:mm format.';
  }

  const reason = validateOptionalText(input.reason, {
    field: 'reason',
    label: 'Reason',
    max: 500,
    details,
  });

  if (Object.keys(details).length > 0) {
    throw ApiError.badRequest('Please correct the highlighted fields.', details);
  }

  return { doctorId, date, slotTime, reason };
}

export function validateSlotsQuery(query = {}) {
  const date = cleanString(query.date);
  if (!date) {
    throw ApiError.badRequest('Choose a date.', { date: 'Choose a date.' });
  }
  if (!isValidDateString(date)) {
    throw ApiError.badRequest('Choose a valid date.', {
      date: 'Date must use the YYYY-MM-DD format.',
    });
  }
  return { date };
}

// ---------------------------------------------------------------------------
// Phase 5: live queue validation
// ---------------------------------------------------------------------------

/**
 * Emergency patients must already be registered; the doctor chooses an
 * existing patient id rather than creating an account from the queue screen.
 */
export function validateEmergencyInput(input = {}) {
  const details = {};

  const patientId = cleanString(input.patientId);
  if (!patientId) details.patientId = 'Choose a patient.';

  const reason = validateOptionalText(input.reason, {
    field: 'reason',
    label: 'Reason',
    max: 500,
    details,
  });

  if (Object.keys(details).length > 0) {
    throw ApiError.badRequest('Please correct the highlighted fields.', details);
  }

  return { patientId, reason };
}

/**
 * The doctor reports the total current delay (not an increment), so estimates
 * stay easy to explain and the latest report always wins.
 */
export function validateDelayInput(input = {}) {
  const details = {};

  const raw = input.delayMinutes;
  let delayMinutes = null;

  if (raw === undefined || raw === null || raw === '') {
    details.delayMinutes = 'Enter the delay in minutes.';
  } else {
    const number = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isInteger(number) || number < 0 || number > 720) {
      details.delayMinutes = 'Delay must be a whole number between 0 and 720 minutes.';
    } else {
      delayMinutes = number;
    }
  }

  const reason = validateRequiredText(input.reason, {
    field: 'reason',
    label: 'Reason',
    min: 3,
    max: 300,
    details,
  });

  if (Object.keys(details).length > 0) {
    throw ApiError.badRequest('Please correct the highlighted fields.', details);
  }

  return { delayMinutes, reason };
}

// ---------------------------------------------------------------------------
// Phase 8: platform hospital + hospital administrator validation
// ---------------------------------------------------------------------------

function validatePasswordField(value, { field, details, required = true }) {
  const password = typeof value === 'string' ? value : '';

  if (!password) {
    if (required) details[field] = 'Password is required.';
    return null;
  }

  if (password.length < 8) {
    details[field] = 'Password must be at least 8 characters.';
  } else if (Buffer.byteLength(password, 'utf8') > 72) {
    // bcrypt only uses the first 72 bytes; reject longer input instead of
    // silently truncating it.
    details[field] = 'Password is too long (maximum 72 bytes).';
  }

  return password;
}

function validateKeyedPhone(value, { field, label, details, required = false }) {
  const phone = cleanString(value);

  if (required && phone.length < 5) {
    details[field] = `${label} is required.`;
  } else if (phone && phone.length < 5) {
    details[field] = `${label} must be at least 5 characters.`;
  } else if (phone.length > 30) {
    details[field] = `${label} must be 30 characters or fewer.`;
  }

  return phone || null;
}

/**
 * A platform administrator registers a hospital and its first administrator in
 * one step. The hospital and administrator fields are flat in the request body
 * so the dialog can submit a single form.
 */
export function validateHospitalCreateInput(input = {}) {
  const details = {};

  const name = validateRequiredText(input.name, {
    field: 'name',
    label: 'Hospital name',
    min: 2,
    max: 120,
    details,
  });

  const address = validateRequiredText(input.address, {
    field: 'address',
    label: 'Address',
    min: 5,
    max: 200,
    details,
  });

  const city = validateRequiredText(input.city, {
    field: 'city',
    label: 'City',
    min: 2,
    max: 80,
    details,
  });

  const phone = validateKeyedPhone(input.phone, {
    field: 'phone',
    label: 'Hospital phone',
    details,
    required: true,
  });

  const email = normalizeEmail(input.email);
  if (email && !isValidEmail(email)) {
    details.email = 'Enter a valid email address.';
  }

  const description = validateOptionalText(input.description, {
    field: 'description',
    label: 'Description',
    max: 1000,
    details,
  });

  const adminName = validateRequiredText(input.adminName, {
    field: 'adminName',
    label: 'Administrator name',
    min: 2,
    max: 80,
    details,
  });

  const adminEmail = normalizeEmail(input.adminEmail);
  if (!adminEmail) details.adminEmail = 'Administrator email is required.';
  else if (!isValidEmail(adminEmail)) {
    details.adminEmail = 'Enter a valid administrator email address.';
  }

  const adminPhone = validateKeyedPhone(input.adminPhone, {
    field: 'adminPhone',
    label: 'Administrator phone',
    details,
  });

  const adminPassword = validatePasswordField(input.adminPassword, {
    field: 'adminPassword',
    details,
  });

  if (Object.keys(details).length > 0) {
    throw ApiError.badRequest('Please correct the highlighted fields.', details);
  }

  return {
    hospital: { name, address, city, phone, email: email || null, description },
    admin: { name: adminName, email: adminEmail, phone: adminPhone, password: adminPassword },
  };
}

/**
 * Assigns a new administrator to a hospital that does not have one yet.
 */
export function validateHospitalAdminCreateInput(input = {}) {
  const details = {};

  const hospitalId = cleanString(input.hospitalId);
  if (!hospitalId) details.hospitalId = 'Choose a hospital.';

  const name = validateRequiredText(input.name, {
    field: 'name',
    label: 'Administrator name',
    min: 2,
    max: 80,
    details,
  });

  const email = normalizeEmail(input.email);
  if (!email) details.email = 'Email is required.';
  else if (!isValidEmail(email)) details.email = 'Enter a valid email address.';

  const phone = validateKeyedPhone(input.phone, {
    field: 'phone',
    label: 'Phone number',
    details,
  });

  const password = validatePasswordField(input.password, {
    field: 'password',
    details,
  });

  if (Object.keys(details).length > 0) {
    throw ApiError.badRequest('Please correct the highlighted fields.', details);
  }

  return { hospitalId, name, email, phone, password };
}

/**
 * Partial update of a hospital administrator. A blank password means "leave the
 * current password alone"; only name, phone and password can change here.
 */
export function validateHospitalAdminUpdateInput(input = {}) {
  const details = {};
  const data = {};
  const fields = ['name', 'phone', 'password'];
  const provided = fields.filter((field) => hasOwn(input, field));

  if (provided.length === 0) {
    throw ApiError.badRequest('No administrator changes were provided.');
  }

  if (hasOwn(input, 'name')) {
    data.name = validateRequiredText(input.name, {
      field: 'name',
      label: 'Administrator name',
      min: 2,
      max: 80,
      details,
    });
  }

  if (hasOwn(input, 'phone')) {
    data.phone = validateKeyedPhone(input.phone, {
      field: 'phone',
      label: 'Phone number',
      details,
    });
  }

  if (hasOwn(input, 'password')) {
    const raw = typeof input.password === 'string' ? input.password : '';
    if (raw) {
      data.password = validatePasswordField(raw, { field: 'password', details });
    }
  }

  if (Object.keys(details).length > 0) {
    throw ApiError.badRequest('Please correct the highlighted fields.', details);
  }

  return data;
}

