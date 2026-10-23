import { Router } from 'express';
import { createReservationController } from '../controllers/reservationController.js';

export function createReservationRouter(controller = createReservationController()) {
  const router = Router();
  router.get('/', controller.list);
  router.post('/', controller.create);
  router.post('/:id/cancel', controller.cancel);
  return router;
}

export const reservationRouter = createReservationRouter();
