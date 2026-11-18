import { PrismaClient } from '@prisma/client';
import { env } from './env.js';

export const prisma = new PrismaClient({
  log: env.nodeEnv === 'development' ? ['warn', 'error'] : ['error'],
});

/**
 * SQLite tuning for a small multi-user demo:
 * - WAL allows reads while a write is in progress.
 * - busy_timeout makes concurrent writers wait instead of failing immediately.
 * - foreign keys are enforced (Prisma enables this by default, kept explicit).
 */
export async function configureDatabase() {
  await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
  await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000;');
  await prisma.$queryRawUnsafe('PRAGMA foreign_keys = ON;');
}
