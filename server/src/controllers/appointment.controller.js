import { asyncHandler } from '../utils/asyncHandler.js';
import {
  cancelMyAppointment,
  createMyAppointment,
  listMyAppointments,
} from '../services/appointment.service.js';
import { checkInAppointment } from '../services/queue.service.js';

export const bookAppointment = asyncHandler(async (req, res) => {
  const appointment = await createMyAppointment(req.user, req.body ?? {});
  res.status(201).json({ appointment });
});

export const listMyAppointmentsHandler = asyncHandler(async (req, res) => {
  const appointments = await listMyAppointments(req.user);
  res.status(200).json({ appointments });
});

export const cancelAppointment = asyncHandler(async (req, res) => {
  const appointment = await cancelMyAppointment(req.user, req.params.id);
  res.status(200).json({ appointment });
});

export const checkIn = asyncHandler(async (req, res) => {
  const result = await checkInAppointment(req.user, req.params.id);
  res.status(201).json(result);
});
