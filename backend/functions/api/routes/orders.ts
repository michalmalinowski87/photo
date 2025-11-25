import { Router } from 'express';
import { wrapHandler } from './handlerWrapper';
import * as ordersList from '../../../functions/orders/list';
import * as ordersListAll from '../../../functions/orders/listAll';
import * as ordersGet from '../../../functions/orders/get';
import * as ordersDownloadZip from '../../../functions/orders/downloadZip';
import * as ordersGenerateZip from '../../../functions/orders/generateZip';
import * as ordersPurchaseAddon from '../../../functions/orders/purchaseAddon';
import * as ordersMarkPaid from '../../../functions/orders/markPaid';
import * as ordersMarkPartiallyPaid from '../../../functions/orders/markPartiallyPaid';
import * as ordersMarkCanceled from '../../../functions/orders/markCanceled';
import * as ordersMarkRefunded from '../../../functions/orders/markRefunded';
import * as ordersRegenerateZip from '../../../functions/orders/regenerateZip';
import * as ordersApproveChangeRequest from '../../../functions/orders/approveChangeRequest';
import * as ordersListDelivered from '../../../functions/orders/listDelivered';
import * as ordersListFinalImages from '../../../functions/orders/listFinalImages';
import * as ordersUploadFinal from '../../../functions/orders/uploadFinal';
import * as ordersDownloadFinalZip from '../../../functions/orders/downloadFinalZip';
import * as ordersSendFinalLink from '../../../functions/orders/sendFinalLink';
import * as ordersUpdate from '../../../functions/orders/update';
import * as ordersUploadFinalComplete from '../../../functions/orders/uploadFinalComplete';
import * as ordersDeleteFinalImage from '../../../functions/orders/deleteFinalImage';

const router = Router();

// Gallery-scoped orders (mounted at root, so paths are relative to root)
router.get('/galleries/:id/orders', wrapHandler(ordersList.handler));
router.get('/galleries/:id/orders/delivered', wrapHandler(ordersListDelivered.handler));
router.get('/galleries/:id/orders/:orderId', wrapHandler(ordersGet.handler));
router.patch('/galleries/:id/orders/:orderId', wrapHandler(ordersUpdate.handler));
router.get('/galleries/:id/orders/:orderId/zip', wrapHandler(ordersDownloadZip.handler));
router.post('/galleries/:id/orders/:orderId/generate-zip', wrapHandler(ordersGenerateZip.handler));
router.post('/galleries/:id/orders/:orderId/regenerate-zip', wrapHandler(ordersRegenerateZip.handler));
router.post('/galleries/:id/purchase-addon', wrapHandler(ordersPurchaseAddon.handler));
router.post('/galleries/:id/orders/:orderId/mark-paid', wrapHandler(ordersMarkPaid.handler));
router.post('/galleries/:id/orders/:orderId/mark-partially-paid', wrapHandler(ordersMarkPartiallyPaid.handler));
router.post('/galleries/:id/orders/:orderId/mark-canceled', wrapHandler(ordersMarkCanceled.handler));
router.post('/galleries/:id/orders/:orderId/mark-refunded', wrapHandler(ordersMarkRefunded.handler));
router.post('/galleries/:id/orders/:orderId/approve-change', wrapHandler(ordersApproveChangeRequest.handler));
router.get('/galleries/:id/orders/:orderId/final/images', wrapHandler(ordersListFinalImages.handler));
router.delete('/galleries/:id/orders/:orderId/final/images/:filename', wrapHandler(ordersDeleteFinalImage.handler));
router.post('/galleries/:id/orders/:orderId/final/upload', wrapHandler(ordersUploadFinal.handler));
router.post('/galleries/:id/orders/:orderId/final/upload-complete', wrapHandler(ordersUploadFinalComplete.handler));
router.post('/galleries/:id/orders/:orderId/final/zip', wrapHandler(ordersDownloadFinalZip.handler));
router.post('/galleries/:id/orders/:orderId/send-final-link', wrapHandler(ordersSendFinalLink.handler));

// Global orders
router.get('/orders', wrapHandler(ordersListAll.handler));

export { router as ordersRoutes };

