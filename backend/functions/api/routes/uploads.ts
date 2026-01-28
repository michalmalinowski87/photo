import { Router } from 'express';
import { wrapHandler } from './handlerWrapper';
import * as uploadsPresign from '../../../functions/uploads/presign';
import * as uploadsPresignBatch from '../../../functions/uploads/presignBatch';
import * as uploadsPresignMultipart from '../../../functions/uploads/presignMultipart';
import * as uploadsCompleteMultipart from '../../../functions/uploads/completeMultipart';
import * as uploadsCompleteUpload from '../../../functions/uploads/completeUpload';
import * as uploadsListMultipartParts from '../../../functions/uploads/listMultipartParts';
import * as uploadsAbortMultipart from '../../../functions/uploads/abortMultipart';
import * as uploadsPresignUserWatermark from '../../../functions/uploads/presignUserWatermark';

const router = Router();

router.post('/presign', wrapHandler(uploadsPresign.handler));
router.post('/presign-batch', wrapHandler(uploadsPresignBatch.handler));
router.post('/presign-multipart', wrapHandler(uploadsPresignMultipart.handler));
router.post('/complete-multipart', wrapHandler(uploadsCompleteMultipart.handler));
router.post('/complete-upload', wrapHandler(uploadsCompleteUpload.handler));
router.post('/list-multipart-parts', wrapHandler(uploadsListMultipartParts.handler));
router.post('/abort-multipart', wrapHandler(uploadsAbortMultipart.handler));
router.post('/presign-user-watermark', wrapHandler(uploadsPresignUserWatermark.handler));

export { router as uploadsRoutes };

