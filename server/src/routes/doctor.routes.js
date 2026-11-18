import { Router } from 'express';
import {
  getDoctor,
  listDoctorSlots,
  listDoctorSpecializations,
  listDoctors,
} from '../controllers/doctor.controller.js';

export const doctorRouter = Router();

// Keep literal routes before `/:id` so they are not treated as a doctor id.
doctorRouter.get('/specializations', listDoctorSpecializations);
doctorRouter.get('/', listDoctors);
doctorRouter.get('/:id/slots', listDoctorSlots);
doctorRouter.get('/:id', getDoctor);
