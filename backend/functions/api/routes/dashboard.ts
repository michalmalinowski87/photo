import { Router } from 'express';
import { wrapHandler } from './handlerWrapper';
import * as dashboardStats from '../../../functions/dashboard/stats';
import * as getOrderStatuses from '../../../functions/dashboard/getOrderStatuses';

const router = Router();

router.get('/stats', wrapHandler(dashboardStats.handler));
router.get('/status', wrapHandler(getOrderStatuses.handler));

export { router as dashboardRoutes };

