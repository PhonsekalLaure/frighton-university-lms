import { asyncHandler } from '../middlewares/asyncHandler.js';
import { changeMyPassword, updateMyProfile } from '../services/profileService.js';
import { validateChangePassword, validateUpdateProfile } from '../validators/profileValidators.js';

export const updateMyProfileController = asyncHandler(async (req, res) => {
  const input = validateUpdateProfile(req.body);
  const librarian = await updateMyProfile(res.locals.librarian, input);
  res.json({ librarian });
});

export const changeMyPasswordController = asyncHandler(async (req, res) => {
  const input = validateChangePassword(req.body);
  await changeMyPassword(res.locals.librarian, input);
  res.sendStatus(204);
});
