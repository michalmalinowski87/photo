import { Router } from 'express';
import { wrapHandler } from './handlerWrapper';
import * as galleriesGet from '../../../functions/galleries/get';
import * as galleriesList from '../../../functions/galleries/list';
import * as galleriesCreate from '../../../functions/galleries/create';
import * as galleriesUpdate from '../../../functions/galleries/update';
import * as galleriesDelete from '../../../functions/galleries/delete';
import * as galleriesListImages from '../../../functions/galleries/listImages';
import * as galleriesPay from '../../../functions/galleries/pay';
import * as galleriesCancelTransaction from '../../../functions/galleries/cancelTransaction';
import * as galleriesSetSelectionMode from '../../../functions/galleries/setSelectionMode';
import * as galleriesUpdatePricing from '../../../functions/galleries/updatePricingPackage';
import * as galleriesSetClientPassword from '../../../functions/galleries/setClientPassword';
import * as galleriesDeletePhoto from '../../../functions/galleries/deletePhoto';
import * as galleriesRecalculateBytesUsed from '../../../functions/galleries/recalculateBytesUsed';
import * as galleriesCalculatePlan from '../../../functions/galleries/calculatePlan';
import * as galleriesValidateUploadLimits from '../../../functions/galleries/validateUploadLimits';
import * as galleriesUpgradePlan from '../../../functions/galleries/upgradePlan';
import * as galleriesClientLogin from '../../../functions/galleries/clientLogin';
import * as galleriesSendToClient from '../../../functions/galleries/sendGalleryToClient';
import * as galleriesExport from '../../../functions/galleries/export';

const router = Router();

// Gallery CRUD routes
router.get('/', wrapHandler(galleriesList.handler));
router.post('/', wrapHandler(galleriesCreate.handler));
router.get('/:id', wrapHandler(galleriesGet.handler));
router.put('/:id', wrapHandler(galleriesUpdate.handler));
router.delete('/:id', wrapHandler(galleriesDelete.handler));

// Gallery sub-routes
// images route is registered as public route in index.ts (no requireAuth)
// router.get('/:id/images', wrapHandler(galleriesListImages.handler));
router.post('/:id/pay', wrapHandler(galleriesPay.handler));
router.post('/:id/cancel-transaction', wrapHandler(galleriesCancelTransaction.handler));
router.patch('/:id/selection-mode', wrapHandler(galleriesSetSelectionMode.handler));
router.patch('/:id/pricing-package', wrapHandler(galleriesUpdatePricing.handler));
router.patch('/:id/client-password', wrapHandler(galleriesSetClientPassword.handler));
router.delete('/:id/photos/:filename', wrapHandler(galleriesDeletePhoto.handler));
router.post('/:id/recalculate-bytes-used', wrapHandler(galleriesRecalculateBytesUsed.handler));
router.get('/:id/calculate-plan', wrapHandler(galleriesCalculatePlan.handler));
router.post('/:id/validate-upload-limits', wrapHandler(galleriesValidateUploadLimits.handler));
router.post('/:id/upgrade-plan', wrapHandler(galleriesUpgradePlan.handler));
// client-login is registered as a public route in index.ts (before requireAuth middleware)
// router.post('/:id/client-login', wrapHandler(galleriesClientLogin.handler));
router.post('/:id/send-to-client', wrapHandler(galleriesSendToClient.handler));
router.post('/:id/export', wrapHandler(galleriesExport.handler));

export { router as galleriesRoutes };

