import { Router } from 'express';
import { wrapHandler } from './handlerWrapper';
import * as paymentsCheckout from '../../../functions/payments/checkoutCreate';
import * as paymentsWebhook from '../../../functions/payments/webhook';
import * as paymentsSuccess from '../../../functions/payments/success';
import * as paymentsCancel from '../../../functions/payments/cancel';

const router = Router();

router.post('/checkout', wrapHandler(paymentsCheckout.handler));
router.post('/webhook', wrapHandler(paymentsWebhook.handler));
router.get('/success', wrapHandler(paymentsSuccess.handler));
router.get('/cancel', wrapHandler(paymentsCancel.handler));

export { router as paymentsRoutes };

