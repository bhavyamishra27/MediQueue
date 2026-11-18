import { asyncHandler } from '../utils/asyncHandler.js';
import {
  getAdminHospital,
  getPublicHospital,
  listPublicHospitals,
  updateAdminHospital,
} from '../services/hospital.service.js';

export const listHospitals = asyncHandler(async (req, res) => {
  const hospitals = await listPublicHospitals(req.query ?? {});
  res.status(200).json({ hospitals });
});

export const getHospital = asyncHandler(async (req, res) => {
  const hospital = await getPublicHospital(req.params.id);
  res.status(200).json({ hospital });
});

export const getMyHospital = asyncHandler(async (req, res) => {
  const hospital = await getAdminHospital(req.user);
  res.status(200).json({ hospital });
});

export const updateMyHospital = asyncHandler(async (req, res) => {
  const hospital = await updateAdminHospital(req.user, req.body ?? {});
  res.status(200).json({ hospital });
});
