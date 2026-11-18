import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { todayDateString } from '../utils/dates.js';
import {
  validateHospitalAdminCreateInput,
  validateHospitalAdminUpdateInput,
  validateHospitalCreateInput,
} from '../utils/validate.js';

const BCRYPT_ROUNDS = 10;

const PLATFORM_HOSPITAL_SELECT = {
  id: true,
  name: true,
  address: true,
  city: true,
  phone: true,
  email: true,
  description: true,
  createdAt: true,
  admin: { select: { id: true, name: true, email: true, phone: true, createdAt: true } },
  _count: { select: { doctors: true } },
};

const PLATFORM_ADMIN_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  createdAt: true,
  administeredHospital: { select: { id: true, name: true, city: true } },
};

function serializePlatformHospital(hospital) {
  return {
    id: hospital.id,
    name: hospital.name,
    address: hospital.address,
    city: hospital.city,
    phone: hospital.phone,
    email: hospital.email ?? null,
    description: hospital.description ?? null,
    createdAt: hospital.createdAt,
    doctorCount: hospital._count?.doctors ?? 0,
    admin: hospital.admin
      ? {
          id: hospital.admin.id,
          name: hospital.admin.name,
          email: hospital.admin.email,
          phone: hospital.admin.phone ?? null,
          createdAt: hospital.admin.createdAt,
        }
      : null,
  };
}

function serializePlatformAdmin(admin) {
  return {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    phone: admin.phone ?? null,
    createdAt: admin.createdAt,
    hospital: admin.administeredHospital
      ? {
          id: admin.administeredHospital.id,
          name: admin.administeredHospital.name,
          city: admin.administeredHospital.city,
        }
      : null,
  };
}

function normalizeFilter(value) {
  return typeof value === 'string' ? value.trim().slice(0, 80) : '';
}

async function assertEmailAvailable(email, excludeUserId = null) {
  const existing = await prisma.user.findFirst({
    where: {
      email,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { id: true },
  });

  if (existing) {
    throw ApiError.conflict('An account with that email already exists.');
  }
}

export async function getPlatformDashboard() {
  const today = todayDateString();

  const [
    hospitals,
    hospitalsWithoutAdmin,
    hospitalAdmins,
    doctors,
    activeDoctors,
    patients,
    appointments,
    appointmentsToday,
    recentHospitals,
  ] = await Promise.all([
    prisma.hospital.count(),
    prisma.hospital.count({ where: { adminId: null } }),
    prisma.user.count({ where: { role: 'HOSPITAL_ADMIN' } }),
    prisma.doctor.count(),
    prisma.doctor.count({ where: { isActive: true } }),
    prisma.patient.count(),
    prisma.appointment.count(),
    prisma.appointment.count({ where: { date: today } }),
    prisma.hospital.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: PLATFORM_HOSPITAL_SELECT,
    }),
  ]);

  return {
    hospitals: {
      total: hospitals,
      withAdmin: hospitals - hospitalsWithoutAdmin,
      withoutAdmin: hospitalsWithoutAdmin,
    },
    hospitalAdmins: { total: hospitalAdmins },
    doctors: { total: doctors, active: activeDoctors },
    patients: { total: patients },
    appointments: { total: appointments, today: appointmentsToday },
    recentHospitals: recentHospitals.map(serializePlatformHospital),
  };
}

export async function listPlatformHospitals(filters = {}) {
  const search = normalizeFilter(filters.search);
  const city = normalizeFilter(filters.city);

  const where = {};
  if (city) where.city = { contains: city };
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { address: { contains: search } },
      { city: { contains: search } },
      { email: { contains: search } },
    ];
  }

  const hospitals = await prisma.hospital.findMany({
    where,
    orderBy: { name: 'asc' },
    select: PLATFORM_HOSPITAL_SELECT,
  });

  return { hospitals: hospitals.map(serializePlatformHospital) };
}

/**
 * Registers a hospital and its first administrator atomically. If either row
 * fails, neither is left behind.
 */
export async function createPlatformHospital(input) {
  const { hospital: hospitalData, admin: adminData } = validateHospitalCreateInput(input);

  await assertEmailAvailable(adminData.email);

  const passwordHash = await bcrypt.hash(adminData.password, BCRYPT_ROUNDS);

  const hospital = await prisma.$transaction(async (tx) => {
    const admin = await tx.user.create({
      data: {
        email: adminData.email,
        passwordHash,
        name: adminData.name,
        phone: adminData.phone,
        role: 'HOSPITAL_ADMIN',
      },
      select: { id: true },
    });

    return tx.hospital.create({
      data: {
        ...hospitalData,
        adminId: admin.id,
      },
      select: PLATFORM_HOSPITAL_SELECT,
    });
  });

  return serializePlatformHospital(hospital);
}

export async function listPlatformHospitalAdmins() {
  const admins = await prisma.user.findMany({
    where: { role: 'HOSPITAL_ADMIN' },
    orderBy: { name: 'asc' },
    select: PLATFORM_ADMIN_SELECT,
  });

  return { admins: admins.map(serializePlatformAdmin) };
}

/**
 * Assigns an administrator to a hospital that currently has none. The unique
 * `Hospital.adminId` column is the final guard against a double assignment.
 */
export async function createPlatformHospitalAdmin(input) {
  const data = validateHospitalAdminCreateInput(input);

  const hospital = await prisma.hospital.findUnique({
    where: { id: data.hospitalId },
    select: { id: true, name: true, adminId: true },
  });

  if (!hospital) {
    throw ApiError.notFound('Hospital not found.');
  }

  if (hospital.adminId) {
    throw ApiError.conflict('This hospital already has an administrator.');
  }

  await assertEmailAvailable(data.email);

  const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

  const admin = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: data.email,
        passwordHash,
        name: data.name,
        phone: data.phone,
        role: 'HOSPITAL_ADMIN',
      },
      select: { id: true },
    });

    const linked = await tx.hospital.updateMany({
      where: { id: data.hospitalId, adminId: null },
      data: { adminId: created.id },
    });

    if (linked.count === 0) {
      throw ApiError.conflict('This hospital already has an administrator.');
    }

    return tx.user.findUniqueOrThrow({
      where: { id: created.id },
      select: PLATFORM_ADMIN_SELECT,
    });
  });

  return serializePlatformAdmin(admin);
}

export async function updatePlatformHospitalAdmin(adminId, input) {
  const data = validateHospitalAdminUpdateInput(input);

  const existing = await prisma.user.findFirst({
    where: { id: adminId, role: 'HOSPITAL_ADMIN' },
    select: { id: true },
  });

  if (!existing) {
    throw ApiError.notFound('Hospital administrator not found.');
  }

  const updateData = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.phone !== undefined) updateData.phone = data.phone;
  if (data.password) {
    updateData.passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
  }

  const admin = await prisma.user.update({
    where: { id: adminId },
    data: updateData,
    select: PLATFORM_ADMIN_SELECT,
  });

  return serializePlatformAdmin(admin);
}
