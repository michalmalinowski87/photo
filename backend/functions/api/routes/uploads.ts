import { Router } from 'express';
import { wrapHandler } from './handlerWrapper';
import * as uploadsPresign from '../../../functions/uploads/presign';
import * as uploadsPresignBatch from '../../../functions/uploads/presignBatch';

const router = Router();

router.post('/presign', wrapHandler(uploadsPresign.handler));
router.post('/presign-batch', wrapHandler(uploadsPresignBatch.handler));

export { router as uploadsRoutes };

