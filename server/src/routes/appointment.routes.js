import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  bookAppointment,
  cancelAppointment,
  checkIn,
  listMyAppointmentsHandler,
} from '../controllers/appointment.controller.js';

export const appointmentRouter = Router();

appointmentRouter.use(requireAuth, requireRole('PATIENT'));

appointmentRouter.post('/', bookAppointment);
appointmentRouter.get('/mine', listMyAppointmentsHandler);
appointmentRouter.post('/:id/check-in', checkIn);
appointmentRouter.patch('/:id/cancel', cancelAppointment);
