import { Router } from 'express';
import { createBookController } from '../controllers/bookController.js';

export function createBookRouter(controller = createBookController()) {
  const router = Router();
  router.get('/', controller.list);
  router.post('/', controller.create);
  router.put('/:id', controller.update);
  router.post('/:id/archive', controller.archive);
  return router;
}

export const bookRouter = createBookRouter();
