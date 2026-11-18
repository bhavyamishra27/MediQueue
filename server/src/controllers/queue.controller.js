import { asyncHandler } from '../utils/asyncHandler.js';
import {
  addEmergencyPatient,
  callNextPatient,
  clearDelay,
  completeConsultation,
  getDoctorQueue,
  getMyQueueState,
  markNoShow,
  reportDelay,
  startConsultation,
} from '../services/queue.service.js';

export const getMyQueue = asyncHandler(async (req, res) => {
  const queue = await getMyQueueState(req.user);
  res.status(200).json({ queue });
});

export const getQueue = asyncHandler(async (req, res) => {
  const queue = await getDoctorQueue(req.user);
  res.status(200).json({ queue });
});

export const callNext = asyncHandler(async (req, res) => {
  const result = await callNextPatient(req.user);
  res.status(200).json(result);
});

export const start = asyncHandler(async (req, res) => {
  const result = await startConsultation(req.user);
  res.status(200).json(result);
});

export const complete = asyncHandler(async (req, res) => {
  const result = await completeConsultation(req.user);
  res.status(200).json(result);
});

export const noShow = asyncHandler(async (req, res) => {
  const result = await markNoShow(req.user, req.params.entryId);
  res.status(200).json(result);
});

export const addEmergency = asyncHandler(async (req, res) => {
  const result = await addEmergencyPatient(req.user, req.body ?? {});
  res.status(201).json(result);
});

export const reportDoctorDelay = asyncHandler(async (req, res) => {
  const result = await reportDelay(req.user, req.body ?? {});
  res.status(200).json(result);
});

export const clearDoctorDelay = asyncHandler(async (req, res) => {
  const result = await clearDelay(req.user);
  res.status(200).json(result);
});
