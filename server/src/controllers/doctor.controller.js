import { asyncHandler } from '../utils/asyncHandler.js';
import {
  createHospitalDoctor,
  deactivateHospitalDoctor,
  getPublicDoctor,
  listHospitalDoctors,
  listPublicDoctors,
  listSpecializations,
  updateHospitalDoctor,
} from '../services/doctor.service.js';
import { getDoctorSlots } from '../services/slot.service.js';

export const listDoctors = asyncHandler(async (req, res) => {
  const doctors = await listPublicDoctors(req.query ?? {});
  res.status(200).json({ doctors });
});

export const getDoctor = asyncHandler(async (req, res) => {
  const doctor = await getPublicDoctor(req.params.id);
  res.status(200).json({ doctor });
});

export const listDoctorSpecializations = asyncHandler(async (req, res) => {
  const specializations = await listSpecializations();
  res.status(200).json({ specializations });
});

export const listDoctorSlots = asyncHandler(async (req, res) => {
  const availability = await getDoctorSlots(req.params.id, req.query ?? {});
  res.status(200).json(availability);
});

export const listMyDoctors = asyncHandler(async (req, res) => {
  const doctors = await listHospitalDoctors(req.user);
  res.status(200).json({ doctors });
});

export const createMyDoctor = asyncHandler(async (req, res) => {
  const doctor = await createHospitalDoctor(req.user, req.body ?? {});
  res.status(201).json({ doctor });
});

export const updateMyDoctor = asyncHandler(async (req, res) => {
  const doctor = await updateHospitalDoctor(req.user, req.params.id, req.body ?? {});
  res.status(200).json({ doctor });
});

export const deactivateMyDoctor = asyncHandler(async (req, res) => {
  const doctor = await deactivateHospitalDoctor(req.user, req.params.id);
  res.status(200).json({ doctor });
});
