import { Router } from 'express';
import { wrapHandler } from './handlerWrapper';
import * as ordersList from '../../../functions/orders/list';
import * as ordersListAll from '../../../functions/orders/listAll';
import * as ordersGet from '../../../functions/orders/get';
import * as ordersGetStatus from '../../../functions/orders/getStatus';
import * as ordersDownloadZip from '../../../functions/orders/downloadZip';
import * as ordersMarkPaid from '../../../functions/orders/markPaid';
import * as ordersMarkPartiallyPaid from '../../../functions/orders/markPartiallyPaid';
import * as ordersMarkCanceled from '../../../functions/orders/markCanceled';
import * as ordersMarkRefunded from '../../../functions/orders/markRefunded';
import * as ordersApproveChangeRequest from '../../../functions/orders/approveChangeRequest';
import * as ordersDenyChangeRequest from '../../../functions/orders/denyChangeRequest';
import * as ordersListDelivered from '../../../functions/orders/listDelivered';
import * as ordersListFinalImages from '../../../functions/orders/listFinalImages';
import * as ordersUploadFinal from '../../../functions/orders/uploadFinal';
import * as ordersUploadFinalBatch from '../../../functions/orders/uploadFinalBatch';
import * as ordersDownloadFinalZip from '../../../functions/orders/downloadFinalZip';
import * as ordersSendFinalLink from '../../../functions/orders/sendFinalLink';
import * as ordersUpdate from '../../../functions/orders/update';
import * as ordersUploadFinalComplete from '../../../functions/orders/uploadFinalComplete';
import * as ordersCleanupOriginals from '../../../functions/orders/cleanupOriginals';

const router = Router();

// Gallery-scoped orders (mounted at root, so paths are relative to root)
router.get('/galleries/:id/orders', wrapHandler(ordersList.handler));
// orders/delivered route is registered as public route in index.ts (no requireAuth)
// router.get('/galleries/:id/orders/delivered', wrapHandler(ordersListDelivered.handler));
router.get('/galleries/:id/orders/:orderId', wrapHandler(ordersGet.handler));
router.get('/galleries/:id/orders/:orderId/status', wrapHandler(ordersGetStatus.handler));
router.patch('/galleries/:id/orders/:orderId', wrapHandler(ordersUpdate.handler));
// orders/:orderId/zip route is registered as public route in index.ts (no requireAuth)
// router.get('/galleries/:id/orders/:orderId/zip', wrapHandler(ordersDownloadZip.handler));
router.post('/galleries/:id/orders/:orderId/mark-paid', wrapHandler(ordersMarkPaid.handler));
router.post('/galleries/:id/orders/:orderId/mark-partially-paid', wrapHandler(ordersMarkPartiallyPaid.handler));
router.post('/galleries/:id/orders/:orderId/mark-canceled', wrapHandler(ordersMarkCanceled.handler));
router.post('/galleries/:id/orders/:orderId/mark-refunded', wrapHandler(ordersMarkRefunded.handler));
router.post('/galleries/:id/orders/:orderId/approve-change', wrapHandler(ordersApproveChangeRequest.handler));
router.post('/galleries/:id/orders/:orderId/deny-change', wrapHandler(ordersDenyChangeRequest.handler));
// final/images and final/zip routes are registered as public routes in index.ts (no requireAuth)
// router.get('/galleries/:id/orders/:orderId/final/images', wrapHandler(ordersListFinalImages.handler));
// Final image deletion now handled by galleries batch delete endpoint: POST /galleries/:id/photos/batch-delete with type='final'
router.post('/galleries/:id/orders/:orderId/final/upload', wrapHandler(ordersUploadFinal.handler));
router.post('/galleries/:id/orders/:orderId/final/upload-batch', wrapHandler(ordersUploadFinalBatch.handler));
router.post('/galleries/:id/orders/:orderId/final/upload-complete', wrapHandler(ordersUploadFinalComplete.handler));
// router.post('/galleries/:id/orders/:orderId/final/zip', wrapHandler(ordersDownloadFinalZip.handler));
router.post('/galleries/:id/orders/:orderId/send-final-link', wrapHandler(ordersSendFinalLink.handler));
router.post('/galleries/:id/orders/:orderId/cleanup-originals', wrapHandler(ordersCleanupOriginals.handler));

// Global orders
router.get('/orders', wrapHandler(ordersListAll.handler));

export { router as ordersRoutes };

