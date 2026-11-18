import { asyncHandler } from '../utils/asyncHandler.js';
import { login, registerPatient } from '../services/auth.service.js';

export const register = asyncHandler(async (req, res) => {
  const result = await registerPatient(req.body ?? {});
  res.status(201).json(result);
});

export const loginUser = asyncHandler(async (req, res) => {
  const result = await login(req.body ?? {});
  res.status(200).json(result);
});

export const getMe = asyncHandler(async (req, res) => {
  res.status(200).json({ user: req.user });
});
