import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  createMyDoctor,
  deactivateMyDoctor,
  listMyDoctors,
  updateMyDoctor,
} from '../controllers/doctor.controller.js';
import { getMyHospital, updateMyHospital } from '../controllers/hospital.controller.js';
import {
  createSchedule,
  deleteSchedule,
  listSchedules,
  updateSchedule,
} from '../controllers/schedule.controller.js';

export const hospitalAdminRouter = Router();

// Every route below is scoped to the administrator's own hospital. The
// hospitalId itself comes from the database identity, never from the request.
hospitalAdminRouter.use(requireAuth, requireRole('HOSPITAL_ADMIN'));

hospitalAdminRouter.get('/me', getMyHospital);
hospitalAdminRouter.patch('/me', updateMyHospital);

hospitalAdminRouter.get('/doctors', listMyDoctors);
hospitalAdminRouter.post('/doctors', createMyDoctor);
hospitalAdminRouter.patch('/doctors/:id', updateMyDoctor);
hospitalAdminRouter.post('/doctors/:id/deactivate', deactivateMyDoctor);

hospitalAdminRouter.get('/doctors/:id/schedules', listSchedules);
hospitalAdminRouter.post('/doctors/:id/schedules', createSchedule);
hospitalAdminRouter.patch('/doctors/:id/schedules/:scheduleId', updateSchedule);
hospitalAdminRouter.delete('/doctors/:id/schedules/:scheduleId', deleteSchedule);
