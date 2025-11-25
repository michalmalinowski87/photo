import { Router } from 'express';
import { wrapHandler } from './handlerWrapper';
import * as uploadsPresign from '../../../functions/uploads/presign';

const router = Router();

router.post('/presign', wrapHandler(uploadsPresign.handler));

export { router as uploadsRoutes };

