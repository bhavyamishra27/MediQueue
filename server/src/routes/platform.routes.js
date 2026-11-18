import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  createHospital,
  createHospitalAdmin,
  getDashboard,
  listHospitalAdmins,
  listHospitals,
  updateHospitalAdmin,
} from '../controllers/platform.controller.js';

export const platformRouter = Router();

platformRouter.use(requireAuth, requireRole('PLATFORM_ADMIN'));

platformRouter.get('/dashboard', getDashboard);
platformRouter.get('/hospitals', listHospitals);
platformRouter.post('/hospitals', createHospital);
platformRouter.get('/hospital-admins', listHospitalAdmins);
platformRouter.post('/hospital-admins', createHospitalAdmin);
platformRouter.patch('/hospital-admins/:id', updateHospitalAdmin);
