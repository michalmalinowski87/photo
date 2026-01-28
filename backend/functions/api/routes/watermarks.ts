import { Router } from 'express';
import { wrapHandler } from './handlerWrapper';
import * as watermarksList from '../../../functions/watermarks/list';
import * as watermarksDelete from '../../../functions/watermarks/delete';
import * as watermarksAdd from '../../../functions/watermarks/add';

const router = Router();

router.get('/list', wrapHandler(watermarksList.handler));
router.post('/add', wrapHandler(watermarksAdd.handler));
router.delete('/delete', wrapHandler(watermarksDelete.handler));

export { router as watermarksRoutes };
