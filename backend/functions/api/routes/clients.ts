import { Router } from 'express';
import { wrapHandler } from './handlerWrapper';
import * as clientsCreate from '../../../functions/clients/create';
import * as clientsList from '../../../functions/clients/list';
import * as clientsGet from '../../../functions/clients/get';
import * as clientsUpdate from '../../../functions/clients/update';
import * as clientsDelete from '../../../functions/clients/delete';

const router = Router();

router.get('/', wrapHandler(clientsList.handler));
router.post('/', wrapHandler(clientsCreate.handler));
router.get('/:id', wrapHandler(clientsGet.handler));
router.put('/:id', wrapHandler(clientsUpdate.handler));
router.delete('/:id', wrapHandler(clientsDelete.handler));

export { router as clientsRoutes };

