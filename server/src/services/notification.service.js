import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { serializeNotification } from '../utils/serializers.js';
import { emitToRoom, rooms } from '../realtime/emitter.js';

const NOTIFICATION_SELECT = {
  id: true,
  title: true,
  message: true,
  type: true,
  isRead: true,
  appointmentId: true,
  createdAt: true,
};

const NOTIFICATION_WITH_USER_SELECT = {
  ...NOTIFICATION_SELECT,
  userId: true,
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function clampLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_LIMIT);
}

async function unreadCountFor(userId) {
  return prisma.notification.count({ where: { userId, isRead: false } });
}

/**
 * Creates one notification inside the caller's transaction. The row (including
 * the owner id) is returned so the caller can emit `notification:new` only
 * after the transaction commits.
 */
export function createNotification(tx, data) {
  return tx.notification.create({ data, select: NOTIFICATION_WITH_USER_SELECT });
}

/**
 * Creates several notifications inside one transaction. A short loop of
 * individual inserts is used instead of `createMany` so every created row can
 * be emitted to its owner after commit.
 */
export function createNotifications(tx, dataList) {
  if (!dataList || dataList.length === 0) return Promise.resolve([]);
  return Promise.all(dataList.map((data) => createNotification(tx, data)));
}

/**
 * Emits each committed notification to its owner's private user room. This is
 * intentionally separate from creation so a rolled-back transaction never
 * notifies a client about a notification that does not exist.
 */
export function emitNotifications(rows) {
  for (const row of rows ?? []) {
    if (!row?.userId) continue;
    emitToRoom(rooms.user(row.userId), 'notification:new', serializeNotification(row));
  }
}

/**
 * Notifications always belong to the signed-in user. There is no endpoint that
 * accepts another user id, so one account can never read another's inbox.
 */
export async function listMyNotifications(user, { limit } = {}) {
  const take = clampLimit(limit);

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take,
      select: NOTIFICATION_SELECT,
    }),
    unreadCountFor(user.id),
  ]);

  return {
    notifications: notifications.map(serializeNotification),
    unreadCount,
  };
}

export async function markNotificationRead(user, notificationId) {
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, userId: user.id },
    data: { isRead: true },
  });

  if (result.count === 0) {
    throw ApiError.notFound('Notification not found.');
  }

  return { unreadCount: await unreadCountFor(user.id) };
}

export async function markAllNotificationsRead(user) {
  const result = await prisma.notification.updateMany({
    where: { userId: user.id, isRead: false },
    data: { isRead: true },
  });

  return { updated: result.count, unreadCount: 0 };
}
