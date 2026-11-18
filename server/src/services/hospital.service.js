import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { requireHospitalId } from '../utils/scope.js';
import { validateHospitalProfileUpdate } from '../utils/validate.js';
import {
  serializeAdminHospital,
  serializePublicHospitalDetail,
  serializePublicHospitalSummary,
} from '../utils/serializers.js';
import { PUBLIC_DOCTOR_SUMMARY_SELECT } from '../utils/selects.js';

const PUBLIC_HOSPITAL_FIELDS = {
  id: true,
  name: true,
  address: true,
  city: true,
  phone: true,
  email: true,
  description: true,
};

const ADMIN_HOSPITAL_SELECT = {
  ...PUBLIC_HOSPITAL_FIELDS,
  createdAt: true,
  updatedAt: true,
};

function normalizeFilter(value) {
  return typeof value === 'string' ? value.trim().slice(0, 80) : '';
}

export async function listPublicHospitals(filters = {}) {
  const search = normalizeFilter(filters.search);
  const city = normalizeFilter(filters.city);

  const where = {};
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { city: { contains: search } },
      { address: { contains: search } },
      { description: { contains: search } },
    ];
  }
  if (city) {
    where.city = { contains: city };
  }

  const hospitals = await prisma.hospital.findMany({
    where,
    orderBy: { name: 'asc' },
    select: {
      ...PUBLIC_HOSPITAL_FIELDS,
      doctors: {
        where: { isActive: true },
        select: { specialization: true },
      },
    },
  });

  return hospitals.map(serializePublicHospitalSummary);
}

export async function getPublicHospital(hospitalId) {
  const hospital = await prisma.hospital.findUnique({
    where: { id: hospitalId },
    select: {
      ...PUBLIC_HOSPITAL_FIELDS,
      doctors: {
        where: { isActive: true },
        orderBy: { user: { name: 'asc' } },
        select: PUBLIC_DOCTOR_SUMMARY_SELECT,
      },
    },
  });

  if (!hospital) {
    throw ApiError.notFound('Hospital not found.');
  }

  return serializePublicHospitalDetail(hospital);
}

export async function getAdminHospital(user) {
  const hospitalId = requireHospitalId(user);

  const hospital = await prisma.hospital.findUnique({
    where: { id: hospitalId },
    select: ADMIN_HOSPITAL_SELECT,
  });

  if (!hospital) {
    throw ApiError.notFound('Your hospital could not be found.');
  }

  return serializeAdminHospital(hospital);
}

export async function updateAdminHospital(user, input) {
  const hospitalId = requireHospitalId(user);
  const data = validateHospitalProfileUpdate(input);

  const hospital = await prisma.hospital.update({
    where: { id: hospitalId },
    data,
    select: ADMIN_HOSPITAL_SELECT,
  });

  return serializeAdminHospital(hospital);
}
