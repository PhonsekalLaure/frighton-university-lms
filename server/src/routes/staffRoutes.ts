import { Router } from 'express';
import {
  createStaffController,
  deleteStaffController,
  getStaffController,
  inviteStaffController,
  listInvitationsController,
  listStaffController,
  resendInvitationController,
  revokeInvitationController,
  updateStaffController,
} from '../controllers/staffController.js';

export const staffRouter = Router();

staffRouter.get('/', listStaffController);
staffRouter.post('/', createStaffController);
staffRouter.post('/invite', inviteStaffController);
staffRouter.get('/invitations', listInvitationsController);
staffRouter.post('/invitations/:id/resend', resendInvitationController);
staffRouter.delete('/invitations/:id', revokeInvitationController);
staffRouter.get('/:id', getStaffController);
staffRouter.patch('/:id', updateStaffController);
staffRouter.delete('/:id', deleteStaffController);
