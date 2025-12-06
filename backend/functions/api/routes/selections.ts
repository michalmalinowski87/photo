import { Router } from 'express';
import { wrapHandler } from './handlerWrapper';
import * as selectionsApprove from '../../../functions/selections/approveSelection';
import * as selectionsChangeRequest from '../../../functions/selections/changeRequest';
import * as selectionsGet from '../../../functions/selections/getSelection';

const router = Router();

// All selection routes are registered as public routes in index.ts (no requireAuth)

export { router as selectionsRoutes };

