import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  getDashboard,
  listAppointments,
  listQueues,
} from '../controllers/hospitalDashboard.controller.js';

export const hospitalDashboardRouter = Router();

// Read-only monitoring routes. Every query is scoped to the administrator's own
// hospital through the authenticated database identity.
hospitalDashboardRouter.use(requireAuth, requireRole('HOSPITAL_ADMIN'));

hospitalDashboardRouter.get('/dashboard', getDashboard);
hospitalDashboardRouter.get('/appointments', listAppointments);
hospitalDashboardRouter.get('/queues', listQueues);
