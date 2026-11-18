import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getMyQueue } from '../controllers/queue.controller.js';

export const patientQueueRouter = Router();

patientQueueRouter.use(requireAuth, requireRole('PATIENT'));
patientQueueRouter.get('/me', getMyQueue);
