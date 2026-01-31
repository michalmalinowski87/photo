import { Router } from 'express';
import { wrapHandler } from './handlerWrapper';
import * as dashboardStats from '../../../functions/dashboard/stats';
import * as getOrderStatuses from '../../../functions/dashboard/getOrderStatuses';
import * as getLambdaMetrics from '../../../functions/dashboard/getLambdaMetrics';
import * as getZipMetrics from '../../../functions/dashboard/getZipMetrics';
import * as getZipMetricsSummary from '../../../functions/dashboard/getZipMetricsSummary';

const router = Router();

router.get('/stats', wrapHandler(dashboardStats.handler));
router.get('/status', wrapHandler(getOrderStatuses.handler));
router.get('/lambda-metrics', wrapHandler(getLambdaMetrics.handler));
router.get('/zip-metrics', wrapHandler(getZipMetrics.handler));
router.get('/zip-metrics/summary', wrapHandler(getZipMetricsSummary.handler));

export { router as dashboardRoutes };

