import { Router } from 'express';
import { getMe, loginUser, register } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = Router();

// Public: patient self-registration only.
authRouter.post('/register', register);

// Public: exchange email + password for a JWT.
authRouter.post('/login', loginUser);

// Protected: returns the current user with scoped identity fields.
authRouter.get('/me', requireAuth, getMe);
