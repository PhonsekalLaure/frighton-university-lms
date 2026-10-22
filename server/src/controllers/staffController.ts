import { asyncHandler } from '../middlewares/asyncHandler.js';
import { listStaff } from '../repositories/staffRepository.js';
import { HttpError } from '../utils/httpError.js';
import { parsePagination } from '../validators/loanValidators.js';

export const listStaffController = asyncHandler(async (req, res) => {
  if (res.locals.librarian.role !== 'admin') throw new HttpError(403, 'Administrator access is required.');
  res.json(await listStaff(parsePagination(req.query)));
});
