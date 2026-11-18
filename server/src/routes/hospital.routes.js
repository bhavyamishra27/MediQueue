import { Router } from 'express';
import { getHospital, listHospitals } from '../controllers/hospital.controller.js';

export const hospitalRouter = Router();

// Public discovery. Only active doctors and public hospital fields are exposed.
hospitalRouter.get('/', listHospitals);
hospitalRouter.get('/:id', getHospital);
