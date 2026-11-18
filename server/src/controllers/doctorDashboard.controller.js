import { asyncHandler } from '../utils/asyncHandler.js';
import {
  getDoctorAppointments,
  searchPatientsForDoctor,
} from '../services/doctorDashboard.service.js';

export const listDoctorAppointments = asyncHandler(async (req, res) => {
  const result = await getDoctorAppointments(req.user, { date: req.query.date });
  res.status(200).json(result);
});

export const searchPatients = asyncHandler(async (req, res) => {
  const result = await searchPatientsForDoctor(req.user, req.query.query);
  res.status(200).json(result);
});
