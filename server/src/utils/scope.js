import { ApiError } from './ApiError.js';

/**
 * Every hospital-administrator query is scoped through this helper. The
 * hospitalId comes from the fresh database identity loaded by requireAuth, so a
 * request body or token can never point an administrator at another hospital.
 */
export function requireHospitalId(user) {
  if (!user || !user.hospitalId) {
    throw ApiError.forbidden('Your account is not linked to a hospital.');
  }

  return user.hospitalId;
}

/**
 * Patient routes always derive the patient id from the authenticated database
 * identity, never from the request body.
 */
export function requirePatientId(user) {
  if (!user || !user.patientId) {
    throw ApiError.forbidden('Your account is not linked to a patient profile.');
  }

  return user.patientId;
}

/**
 * Doctor queue routes always operate on the signed-in doctor's own queue. The
 * doctor id comes from the fresh database identity loaded by requireAuth, so a
 * client cannot act on another doctor's queue.
 */
export function requireDoctorId(user) {
  if (!user || !user.doctorId) {
    throw ApiError.forbidden('Your account is not linked to a doctor profile.');
  }

  return user.doctorId;
}
