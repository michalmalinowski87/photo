import { Router } from 'express';
import { wrapHandler } from './handlerWrapper';
import * as packagesCreate from '../../../functions/packages/create';
import * as packagesList from '../../../functions/packages/list';
import * as packagesGet from '../../../functions/packages/get';
import * as packagesUpdate from '../../../functions/packages/update';
import * as packagesDelete from '../../../functions/packages/delete';

const router = Router();

router.get('/', wrapHandler(packagesList.handler));
router.post('/', wrapHandler(packagesCreate.handler));
router.get('/:id', wrapHandler(packagesGet.handler));
router.put('/:id', wrapHandler(packagesUpdate.handler));
router.delete('/:id', wrapHandler(packagesDelete.handler));

export { router as packagesRoutes };

