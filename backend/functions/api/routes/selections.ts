import { Router } from 'express';
import { wrapHandler } from './handlerWrapper';
import * as selectionsApprove from '../../../functions/selections/approveSelection';
import * as selectionsChangeRequest from '../../../functions/selections/changeRequest';
import * as selectionsGet from '../../../functions/selections/getSelection';

const router = Router();

router.post('/:id/selections/approve', wrapHandler(selectionsApprove.handler));
router.post('/:id/selection-change-request', wrapHandler(selectionsChangeRequest.handler));
router.get('/:id/selections/:clientId', wrapHandler(selectionsGet.handler));

export { router as selectionsRoutes };

