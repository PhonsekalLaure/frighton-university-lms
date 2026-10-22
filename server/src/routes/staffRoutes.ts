import { Router } from 'express';
import { listStaffController } from '../controllers/staffController.js';

export const staffRouter = Router();
staffRouter.get('/', listStaffController);
