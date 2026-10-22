import { Router } from 'express';
import { createLoanController } from '../controllers/loanController.js';

export function createLoanRouter(controller = createLoanController()) {
  const router = Router();
  router.get('/', controller.list);
  router.get('/policy', controller.policy);
  router.get('/available-books', controller.availableBooks);
  router.get('/verify-patron/:frightonId', controller.verifyPatron);
  router.get('/:id', controller.detail);
  router.post('/borrow', controller.borrow);
  router.post('/:id/return', controller.returnBook);
  router.post('/report-overdue', controller.reportOverdue);
  return router;
}

export const loanRouter = createLoanRouter();
