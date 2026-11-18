import { asyncHandler } from '../utils/asyncHandler.js';
import {
  createPlatformHospital,
  createPlatformHospitalAdmin,
  getPlatformDashboard,
  listPlatformHospitalAdmins,
  listPlatformHospitals,
  updatePlatformHospitalAdmin,
} from '../services/platform.service.js';

export const getDashboard = asyncHandler(async (req, res) => {
  const dashboard = await getPlatformDashboard();
  res.status(200).json(dashboard);
});

export const listHospitals = asyncHandler(async (req, res) => {
  const result = await listPlatformHospitals(req.query ?? {});
  res.status(200).json(result);
});

export const createHospital = asyncHandler(async (req, res) => {
  const hospital = await createPlatformHospital(req.body ?? {});
  res.status(201).json({ hospital });
});

export const listHospitalAdmins = asyncHandler(async (req, res) => {
  const result = await listPlatformHospitalAdmins();
  res.status(200).json(result);
});

export const createHospitalAdmin = asyncHandler(async (req, res) => {
  const admin = await createPlatformHospitalAdmin(req.body ?? {});
  res.status(201).json({ admin });
});

export const updateHospitalAdmin = asyncHandler(async (req, res) => {
  const admin = await updatePlatformHospitalAdmin(req.params.id, req.body ?? {});
  res.status(200).json({ admin });
});
