import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  listDoctorAppointments,
  searchPatients,
} from '../controllers/doctorDashboard.controller.js';

export const doctorDashboardRouter = Router();

doctorDashboardRouter.use(requireAuth, requireRole('DOCTOR'));

doctorDashboardRouter.get('/appointments', listDoctorAppointments);
doctorDashboardRouter.get('/patients', searchPatients);
