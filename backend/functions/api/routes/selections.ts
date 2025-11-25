import { Router } from 'express';
import { wrapHandler } from './handlerWrapper';
import * as selectionsApprove from '../../../functions/selections/approveSelection';
import * as selectionsChangeRequest from '../../../functions/selections/changeRequest';
import * as selectionsGet from '../../../functions/selections/getSelection';

const router = Router();

// selections/approve route is registered as public route in index.ts (no requireAuth)
// router.post('/:id/selections/approve', wrapHandler(selectionsApprove.handler));
// selection-change-request route is registered as public route in index.ts (no requireAuth)
// router.post('/:id/selection-change-request', wrapHandler(selectionsChangeRequest.handler));
// selections GET route is registered as public route in index.ts (no requireAuth)
// router.get('/:id/selections', wrapHandler(selectionsGet.handler));

export { router as selectionsRoutes };

