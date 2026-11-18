import { Router } from 'express';
import { healthRouter } from './health.routes.js';
import { authRouter } from './auth.routes.js';
import { hospitalRouter } from './hospital.routes.js';
import { doctorRouter } from './doctor.routes.js';
import { hospitalAdminRouter } from './hospitalAdmin.routes.js';
import { appointmentRouter } from './appointment.routes.js';
import { patientQueueRouter } from './patientQueue.routes.js';
import { doctorQueueRouter } from './doctorQueue.routes.js';
import { doctorDashboardRouter } from './doctorDashboard.routes.js';
import { hospitalDashboardRouter } from './hospitalDashboard.routes.js';
import { platformRouter } from './platform.routes.js';
import { notificationRouter } from './notification.routes.js';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/hospitals', hospitalRouter);
apiRouter.use('/doctors', doctorRouter);
apiRouter.use('/hospital', hospitalAdminRouter);
apiRouter.use('/hospital', hospitalDashboardRouter);
apiRouter.use('/appointments', appointmentRouter);
apiRouter.use('/queues', patientQueueRouter);
apiRouter.use('/doctor', doctorQueueRouter);
apiRouter.use('/doctor', doctorDashboardRouter);
apiRouter.use('/platform', platformRouter);
apiRouter.use('/notifications', notificationRouter);
