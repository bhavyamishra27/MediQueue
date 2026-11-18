import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  listNotifications,
  readAllNotifications,
  readNotification,
} from '../controllers/notification.controller.js';

export const notificationRouter = Router();

notificationRouter.use(requireAuth);

notificationRouter.get('/', listNotifications);
notificationRouter.post('/read-all', readAllNotifications);
notificationRouter.patch('/:id/read', readNotification);
