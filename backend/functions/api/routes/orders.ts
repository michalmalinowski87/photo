import { Router } from 'express';
import { wrapHandler } from './handlerWrapper';
import * as ordersList from '../../../functions/orders/list';
import * as ordersListAll from '../../../functions/orders/listAll';
import * as ordersGet from '../../../functions/orders/get';
import * as ordersGetStatus from '../../../functions/orders/getStatus';
import * as ordersMarkPaid from '../../../functions/orders/markPaid';
import * as ordersMarkPartiallyPaid from '../../../functions/orders/markPartiallyPaid';
import * as ordersMarkCanceled from '../../../functions/orders/markCanceled';
import * as ordersMarkRefunded from '../../../functions/orders/markRefunded';
import * as ordersApproveChangeRequest from '../../../functions/orders/approveChangeRequest';
import * as ordersDenyChangeRequest from '../../../functions/orders/denyChangeRequest';
import * as ordersUploadFinal from '../../../functions/orders/uploadFinal';
import * as ordersUploadFinalBatch from '../../../functions/orders/uploadFinalBatch';
import * as ordersSendFinalLink from '../../../functions/orders/sendFinalLink';
import * as ordersUpdate from '../../../functions/orders/update';
import * as ordersUploadFinalComplete from '../../../functions/orders/uploadFinalComplete';
import * as ordersCleanupOriginals from '../../../functions/orders/cleanupOriginals';
// zip/status, final/zip, final/images, and final/zip/status routes are registered as public routes in index.ts (no requireAuth)

const router = Router();

// Gallery-scoped orders (mounted at root, so paths are relative to root)
// /galleries/:id/orders route is registered as public route in index.ts (no requireAuth) to support client JWT tokens
// orders/delivered route is registered as public route in index.ts (no requireAuth)
router.get('/galleries/:id/orders/:orderId', wrapHandler(ordersGet.handler));
router.get('/galleries/:id/orders/:orderId/status', wrapHandler(ordersGetStatus.handler));
// zip/status and final/zip/status routes are registered as public routes in index.ts (no requireAuth) to support client JWT tokens
router.patch('/galleries/:id/orders/:orderId', wrapHandler(ordersUpdate.handler));
// orders/:orderId/zip route is registered as public route in index.ts (no requireAuth)
router.post('/galleries/:id/orders/:orderId/mark-paid', wrapHandler(ordersMarkPaid.handler));
router.post('/galleries/:id/orders/:orderId/mark-partially-paid', wrapHandler(ordersMarkPartiallyPaid.handler));
router.post('/galleries/:id/orders/:orderId/mark-canceled', wrapHandler(ordersMarkCanceled.handler));
router.post('/galleries/:id/orders/:orderId/mark-refunded', wrapHandler(ordersMarkRefunded.handler));
router.post('/galleries/:id/orders/:orderId/approve-change', wrapHandler(ordersApproveChangeRequest.handler));
router.post('/galleries/:id/orders/:orderId/deny-change', wrapHandler(ordersDenyChangeRequest.handler));
// final/images and final/zip routes are registered as public routes in index.ts (no requireAuth)
// Final image deletion now handled by galleries batch delete endpoint: POST /galleries/:id/photos/batch-delete with type='final'
router.post('/galleries/:id/orders/:orderId/final/upload', wrapHandler(ordersUploadFinal.handler));
router.post('/galleries/:id/orders/:orderId/final/upload-batch', wrapHandler(ordersUploadFinalBatch.handler));
router.post('/galleries/:id/orders/:orderId/final/upload-complete', wrapHandler(ordersUploadFinalComplete.handler));
// final/zip route is registered as public route in index.ts (no requireAuth)
router.post('/galleries/:id/orders/:orderId/send-final-link', wrapHandler(ordersSendFinalLink.handler));
router.post('/galleries/:id/orders/:orderId/cleanup-originals', wrapHandler(ordersCleanupOriginals.handler));

router.get('/orders', wrapHandler(ordersListAll.handler));

export { router as ordersRoutes };

