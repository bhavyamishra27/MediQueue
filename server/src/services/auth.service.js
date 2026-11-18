import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { validateLoginInput, validateRegistrationInput } from '../utils/validate.js';

const BCRYPT_ROUNDS = 10;

// A real bcrypt hash used when an email does not exist. Comparing against it
// keeps failed-login timing roughly constant and avoids leaking account existence.
const DUMMY_PASSWORD_HASH = '$2b$10$GiEyxeO65yFtW0gUWThiJuXYS9pBqF8CXiJ.WI8PnKMTgIcNmz23.';

const SAFE_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  phone: true,
  role: true,
  createdAt: true,
  patient: { select: { id: true } },
  doctor: {
    select: {
      id: true,
      hospitalId: true,
      hospital: { select: { id: true, name: true } },
    },
  },
  administeredHospital: { select: { id: true, name: true } },
};

const USER_WITH_PASSWORD_SELECT = {
  ...SAFE_USER_SELECT,
  passwordHash: true,
};

/**
 * Converts a database user into the only shape the API exposes.
 * Password hashes and unrelated relations never leave the server.
 */
export function serializeUser(user) {
  const doctorHospital = user.doctor?.hospital ?? null;
  const administeredHospital = user.administeredHospital ?? null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone ?? null,
    role: user.role,
    createdAt: user.createdAt,
    patientId: user.patient?.id ?? null,
    doctorId: user.doctor?.id ?? null,
    hospitalId: doctorHospital?.id ?? administeredHospital?.id ?? null,
    hospitalName: doctorHospital?.name ?? administeredHospital?.name ?? null,
  };
}

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
}

export async function registerPatient(input) {
  const data = validateRegistrationInput(input);

  const existing = await prisma.user.findUnique({
    where: { email: data.email },
    select: { id: true },
  });

  if (existing) {
    throw ApiError.conflict('An account with that email already exists.');
  }

  const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: data.email,
        passwordHash,
        name: data.name,
        phone: data.phone,
        role: 'PATIENT',
      },
      select: { id: true },
    });

    await tx.patient.create({
      data: {
        userId: created.id,
        dateOfBirth: data.dateOfBirth,
        gender: data.gender,
        bloodGroup: data.bloodGroup,
      },
    });

    return tx.user.findUniqueOrThrow({
      where: { id: created.id },
      select: SAFE_USER_SELECT,
    });
  });

  return {
    token: signToken(user),
    user: serializeUser(user),
  };
}

export async function login(input) {
  const { email, password } = validateLoginInput(input);

  const user = await prisma.user.findUnique({
    where: { email },
    select: USER_WITH_PASSWORD_SELECT,
  });

  const passwordMatches = await bcrypt.compare(
    password,
    user?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );

  if (!user || !passwordMatches) {
    throw ApiError.unauthorized('Invalid email or password.');
  }

  const { passwordHash, ...safeUser } = user;

  return {
    token: signToken(safeUser),
    user: serializeUser(safeUser),
  };
}

/**
 * Loads the current identity fresh from the database on every authenticated
 * request. This means deleted accounts, role changes and newly linked doctor
 * or hospital records take effect immediately.
 */
export async function getAuthUser(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: SAFE_USER_SELECT,
  });

  if (!user) {
    throw ApiError.unauthorized('Your session is no longer valid.');
  }

  return serializeUser(user);
}
