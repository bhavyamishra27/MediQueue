import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { requireHospitalId } from '../utils/scope.js';
import {
  validateDoctorCreateInput,
  validateDoctorUpdateInput,
} from '../utils/validate.js';
import {
  serializeAdminDoctor,
  serializePublicDoctorDetail,
  serializePublicDoctorSummary,
} from '../utils/serializers.js';
import {
  ADMIN_DOCTOR_SELECT,
  PUBLIC_DOCTOR_DETAIL_SELECT,
  PUBLIC_DOCTOR_SUMMARY_SELECT,
} from '../utils/selects.js';

const BCRYPT_ROUNDS = 10;

function normalizeFilter(value) {
  return typeof value === 'string' ? value.trim().slice(0, 80) : '';
}

export async function listPublicDoctors(filters = {}) {
  const search = normalizeFilter(filters.search);
  const specialization = normalizeFilter(filters.specialization);
  const hospitalId = normalizeFilter(filters.hospitalId);
  const city = normalizeFilter(filters.city);

  const where = { isActive: true };

  if (hospitalId) where.hospitalId = hospitalId;
  if (specialization) where.specialization = { contains: specialization };
  if (city) where.hospital = { is: { city: { contains: city } } };

  if (search) {
    where.OR = [
      { specialization: { contains: search } },
      { qualification: { contains: search } },
      { bio: { contains: search } },
      { user: { is: { name: { contains: search } } } },
      { hospital: { is: { name: { contains: search } } } },
    ];
  }

  const doctors = await prisma.doctor.findMany({
    where,
    orderBy: { user: { name: 'asc' } },
    select: PUBLIC_DOCTOR_SUMMARY_SELECT,
  });

  return doctors.map(serializePublicDoctorSummary);
}

export async function listSpecializations() {
  const rows = await prisma.doctor.findMany({
    where: { isActive: true },
    distinct: ['specialization'],
    orderBy: { specialization: 'asc' },
    select: { specialization: true },
  });

  return rows.map((row) => row.specialization);
}

export async function getPublicDoctor(doctorId) {
  const doctor = await prisma.doctor.findFirst({
    where: { id: doctorId, isActive: true },
    select: PUBLIC_DOCTOR_DETAIL_SELECT,
  });

  if (!doctor) {
    throw ApiError.notFound('Doctor not found.');
  }

  return serializePublicDoctorDetail(doctor);
}

export async function listHospitalDoctors(user) {
  const hospitalId = requireHospitalId(user);

  const doctors = await prisma.doctor.findMany({
    where: { hospitalId },
    orderBy: { user: { name: 'asc' } },
    select: ADMIN_DOCTOR_SELECT,
  });

  return doctors.map(serializeAdminDoctor);
}

export async function createHospitalDoctor(user, input) {
  const hospitalId = requireHospitalId(user);
  const data = validateDoctorCreateInput(input);

  const existing = await prisma.user.findUnique({
    where: { email: data.email },
    select: { id: true },
  });

  if (existing) {
    throw ApiError.conflict('An account with that email already exists.');
  }

  const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

  const doctor = await prisma.$transaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: {
        email: data.email,
        passwordHash,
        name: data.name,
        phone: data.phone,
        role: 'DOCTOR',
      },
      select: { id: true },
    });

    const createdDoctor = await tx.doctor.create({
      data: {
        userId: createdUser.id,
        hospitalId,
        specialization: data.specialization,
        qualification: data.qualification,
        experienceYears: data.experienceYears,
        avgConsultationMinutes: data.avgConsultationMinutes,
        roomNumber: data.roomNumber,
        bio: data.bio,
      },
      select: { id: true },
    });

    return tx.doctor.findUniqueOrThrow({
      where: { id: createdDoctor.id },
      select: ADMIN_DOCTOR_SELECT,
    });
  });

  return serializeAdminDoctor(doctor);
}

export async function updateHospitalDoctor(user, doctorId, input) {
  const hospitalId = requireHospitalId(user);

  const existing = await prisma.doctor.findFirst({
    where: { id: doctorId, hospitalId },
    select: { id: true, userId: true },
  });

  if (!existing) {
    throw ApiError.notFound('Doctor not found in your hospital.');
  }

  const data = validateDoctorUpdateInput(input);

  if (data.email) {
    const conflict = await prisma.user.findFirst({
      where: { email: data.email, id: { not: existing.userId } },
      select: { id: true },
    });

    if (conflict) {
      throw ApiError.conflict('An account with that email already exists.');
    }
  }

  const doctor = await prisma.$transaction(async (tx) => {
    const userData = {};
    if (data.name !== undefined) userData.name = data.name;
    if (data.email !== undefined) userData.email = data.email;
    if (data.phone !== undefined) userData.phone = data.phone;

    if (Object.keys(userData).length > 0) {
      await tx.user.update({ where: { id: existing.userId }, data: userData });
    }

    const doctorData = {};
    for (const field of [
      'specialization',
      'qualification',
      'experienceYears',
      'avgConsultationMinutes',
      'roomNumber',
      'bio',
      'isActive',
    ]) {
      if (data[field] !== undefined) doctorData[field] = data[field];
    }

    if (Object.keys(doctorData).length > 0) {
      await tx.doctor.update({ where: { id: doctorId }, data: doctorData });
    }

    return tx.doctor.findUniqueOrThrow({
      where: { id: doctorId },
      select: ADMIN_DOCTOR_SELECT,
    });
  });

  return serializeAdminDoctor(doctor);
}

export async function deactivateHospitalDoctor(user, doctorId) {
  const hospitalId = requireHospitalId(user);

  const existing = await prisma.doctor.findFirst({
    where: { id: doctorId, hospitalId },
    select: { id: true },
  });

  if (!existing) {
    throw ApiError.notFound('Doctor not found in your hospital.');
  }

  const doctor = await prisma.doctor.update({
    where: { id: doctorId },
    data: { isActive: false },
    select: ADMIN_DOCTOR_SELECT,
  });

  return serializeAdminDoctor(doctor);
}
