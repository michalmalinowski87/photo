import { Router } from 'express';
import { wrapHandler } from './handlerWrapper';
import * as dashboardStats from '../../../functions/dashboard/stats';

const router = Router();

router.get('/stats', wrapHandler(dashboardStats.handler));

export { router as dashboardRoutes };

