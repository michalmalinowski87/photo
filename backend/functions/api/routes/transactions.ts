import { Router } from 'express';
import { wrapHandler } from './handlerWrapper';
import * as transactionsGet from '../../../functions/transactions/get';
import * as transactionsCancel from '../../../functions/transactions/cancel';
import * as transactionsRetry from '../../../functions/transactions/retry';

const router = Router();

router.get('/:id', wrapHandler(transactionsGet.handler));
router.post('/:id/cancel', wrapHandler(transactionsCancel.handler));
router.post('/:id/retry', wrapHandler(transactionsRetry.handler));

export { router as transactionsRoutes };

