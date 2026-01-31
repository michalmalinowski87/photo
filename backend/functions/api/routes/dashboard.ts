import { Router } from 'express';
import { wrapHandler } from './handlerWrapper';
import * as dashboardStats from '../../../functions/dashboard/stats';
import * as getOrderStatuses from '../../../functions/dashboard/getOrderStatuses';
import * as getLambdaMetrics from '../../../functions/dashboard/getLambdaMetrics';

const router = Router();

router.get('/stats', wrapHandler(dashboardStats.handler));
router.get('/status', wrapHandler(getOrderStatuses.handler));
router.get('/lambda-metrics', wrapHandler(getLambdaMetrics.handler));

export { router as dashboardRoutes };

