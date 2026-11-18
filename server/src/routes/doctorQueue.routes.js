import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  addEmergency,
  callNext,
  clearDoctorDelay,
  complete,
  getQueue,
  noShow,
  reportDoctorDelay,
  start,
} from '../controllers/queue.controller.js';

export const doctorQueueRouter = Router();

doctorQueueRouter.use(requireAuth, requireRole('DOCTOR'));

doctorQueueRouter.get('/queue', getQueue);
doctorQueueRouter.post('/queue/call-next', callNext);
doctorQueueRouter.post('/queue/start', start);
doctorQueueRouter.post('/queue/complete', complete);
doctorQueueRouter.post('/queue/emergency', addEmergency);
doctorQueueRouter.post('/queue/:entryId/no-show', noShow);

doctorQueueRouter.post('/delay', reportDoctorDelay);
doctorQueueRouter.post('/delay/clear', clearDoctorDelay);
