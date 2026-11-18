import { asyncHandler } from '../utils/asyncHandler.js';
import {
  createDoctorSchedule,
  deleteDoctorSchedule,
  listDoctorSchedules,
  updateDoctorSchedule,
} from '../services/schedule.service.js';

export const listSchedules = asyncHandler(async (req, res) => {
  const schedules = await listDoctorSchedules(req.user, req.params.id);
  res.status(200).json({ schedules });
});

export const createSchedule = asyncHandler(async (req, res) => {
  const schedule = await createDoctorSchedule(
    req.user,
    req.params.id,
    req.body ?? {},
  );
  res.status(201).json({ schedule });
});

export const updateSchedule = asyncHandler(async (req, res) => {
  const schedule = await updateDoctorSchedule(
    req.user,
    req.params.id,
    req.params.scheduleId,
    req.body ?? {},
  );
  res.status(200).json({ schedule });
});

export const deleteSchedule = asyncHandler(async (req, res) => {
  await deleteDoctorSchedule(req.user, req.params.id, req.params.scheduleId);
  res.status(204).end();
});
