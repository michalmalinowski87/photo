import { Router } from 'express';
import { wrapHandler } from './handlerWrapper';
import * as walletBalance from '../../../functions/wallet/getBalance';
import * as walletTransactions from '../../../functions/wallet/listTransactions';

const router = Router();

router.get('/balance', wrapHandler(walletBalance.handler));
router.get('/transactions', wrapHandler(walletTransactions.handler));

export { router as walletRoutes };

