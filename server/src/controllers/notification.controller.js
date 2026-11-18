import { asyncHandler } from '../utils/asyncHandler.js';
import {
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/notification.service.js';

export const listNotifications = asyncHandler(async (req, res) => {
  const result = await listMyNotifications(req.user, { limit: req.query.limit });
  res.status(200).json(result);
});

export const readNotification = asyncHandler(async (req, res) => {
  const result = await markNotificationRead(req.user, req.params.id);
  res.status(200).json(result);
});

export const readAllNotifications = asyncHandler(async (req, res) => {
  const result = await markAllNotificationsRead(req.user);
  res.status(200).json(result);
});
