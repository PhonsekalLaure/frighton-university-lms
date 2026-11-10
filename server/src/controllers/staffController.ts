import { asyncHandler } from '../middlewares/asyncHandler.js';
import {
  acceptInvitation,
  createInvitation,
  getInvitationByToken,
  listInvitations,
  resendInvitation,
  revokeInvitation,
} from '../repositories/invitationRepository.js';
import {
  createStaff,
  deleteStaff,
  getStaffById,
  listStaff,
  updateStaff,
} from '../repositories/staffRepository.js';
import { HttpError } from '../utils/httpError.js';
import {
  validateAcceptInvitation,
  validateCreateInvitation,
} from '../validators/invitationValidators.js';
import {
  validateCreateStaff,
  validateStaffFilters,
  validateStaffId,
  validateUpdateStaff,
} from '../validators/staffValidators.js';

function requireAdmin(role: string | undefined): void {
  if (role !== 'admin') {
    throw new HttpError(403, 'Administrator access is required.');
  }
}

export const listStaffController = asyncHandler(async (req, res) => {
  requireAdmin(res.locals.librarian?.role);
  const filters = validateStaffFilters(req.query as Record<string, unknown>);
  res.json(await listStaff(filters));
});

export const getStaffController = asyncHandler(async (req, res) => {
  requireAdmin(res.locals.librarian?.role);
  const id = validateStaffId(req.params.id);
  const staff = await getStaffById(id);
  if (!staff) {
    throw new HttpError(404, 'Librarian account not found.');
  }
  res.json({ staff });
});

export const createStaffController = asyncHandler(async (req, res) => {
  requireAdmin(res.locals.librarian?.role);
  // If password is not provided, treat as an invitation request
  if (!req.body?.password) {
    const input = validateCreateInvitation(req.body);
    const invitation = await createInvitation(input, res.locals.librarian.id);
    res.status(201).json({
      invitation,
      message: 'Invitation sent. The link expires in 48 hours.',
    });
    return;
  }

  const input = validateCreateStaff(req.body);
  const staff = await createStaff(input);
  res.status(201).json({ staff });
});

export const updateStaffController = asyncHandler(async (req, res) => {
  requireAdmin(res.locals.librarian?.role);
  const id = validateStaffId(req.params.id);
  const input = validateUpdateStaff(req.body);
  const staff = await updateStaff(id, input, res.locals.librarian.id);
  res.json({ staff });
});

export const deleteStaffController = asyncHandler(async (req, res) => {
  requireAdmin(res.locals.librarian?.role);
  const id = validateStaffId(req.params.id);
  await deleteStaff(id, res.locals.librarian.id);
  res.sendStatus(204);
});

// Invitation controllers
export const inviteStaffController = asyncHandler(async (req, res) => {
  requireAdmin(res.locals.librarian?.role);
  const input = validateCreateInvitation(req.body);
  const invitation = await createInvitation(input, res.locals.librarian.id);
  res.status(201).json({
    invitation,
    message: 'Invitation sent. The link expires in 48 hours.',
  });
});

export const listInvitationsController = asyncHandler(async (_req, res) => {
  requireAdmin(res.locals.librarian?.role);
  const invitations = await listInvitations();
  res.json({ invitations });
});

export const resendInvitationController = asyncHandler(async (req, res) => {
  requireAdmin(res.locals.librarian?.role);
  const invitation = await resendInvitation(req.params.id, res.locals.librarian.id);
  res.json({
    invitation,
    message: 'Invitation resent with a fresh 48-hour expiration period.',
  });
});

export const revokeInvitationController = asyncHandler(async (req, res) => {
  requireAdmin(res.locals.librarian?.role);
  await revokeInvitation(req.params.id);
  res.sendStatus(204);
});
