import { Router } from 'express';
import { wrapHandler } from './handlerWrapper';
import * as downloadsZip from '../../../functions/downloads/createZip';

const router = Router();

router.post('/zip', wrapHandler(downloadsZip.handler));

export { router as downloadsRoutes };

