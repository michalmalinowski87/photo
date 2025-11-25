import { Router } from 'express';
import { wrapHandler } from './handlerWrapper';
import * as processedComplete from '../../../functions/processed/complete';

const router = Router();

router.post('/:id/processed/complete', wrapHandler(processedComplete.handler));

export { router as processedRoutes };

