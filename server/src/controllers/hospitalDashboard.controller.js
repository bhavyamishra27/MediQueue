import { asyncHandler } from '../utils/asyncHandler.js';
import {
  getHospitalDashboard,
  listHospitalAppointments,
  listHospitalQueues,
} from '../services/hospitalDashboard.service.js';

export const getDashboard = asyncHandler(async (req, res) => {
  const dashboard = await getHospitalDashboard(req.user);
  res.status(200).json(dashboard);
});

export const listAppointments = asyncHandler(async (req, res) => {
  const result = await listHospitalAppointments(req.user, req.query ?? {});
  res.status(200).json(result);
});

export const listQueues = asyncHandler(async (req, res) => {
  const result = await listHospitalQueues(req.user);
  res.status(200).json(result);
});
