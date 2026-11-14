import type { ChangePasswordInput, UpdateProfileInput } from '../models/profile.js';
import { HttpError } from '../utils/httpError.js';

function confirmedBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Request body must be an object.');
  }
  const input = body as Record<string, unknown>;
  if (input.confirmed !== true) {
    throw new HttpError(400, 'Confirm your changes before submitting.');
  }
  return input;
}

export function validateUpdateProfile(body: unknown): UpdateProfileInput {
  const { firstName, middleName, lastName } = confirmedBody(body);
  if (typeof firstName !== 'string' || !firstName.trim() || firstName.trim().length > 100) {
    throw new HttpError(400, 'Enter a first name up to 100 characters.');
  }
  if (middleName !== undefined && middleName !== null && typeof middleName !== 'string') {
    throw new HttpError(400, 'Middle name must be text.');
  }
  if (typeof middleName === 'string' && middleName.trim().length > 100) {
    throw new HttpError(400, 'Middle name must be 100 characters or fewer.');
  }
  if (typeof lastName !== 'string' || !lastName.trim() || lastName.trim().length > 100) {
    throw new HttpError(400, 'Enter a last name up to 100 characters.');
  }
  return {
    firstName: firstName.trim(),
    middleName: typeof middleName === 'string' ? middleName.trim() || null : null,
    lastName: lastName.trim(),
  };
}

export function validateChangePassword(body: unknown): ChangePasswordInput {
  const { currentPassword, newPassword, confirmPassword } = confirmedBody(body);
  if (typeof currentPassword !== 'string' || !currentPassword || currentPassword.length > 1024) {
    throw new HttpError(400, 'Enter your current password.');
  }
  if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 1024) {
    throw new HttpError(400, 'The new password must be between 8 and 1024 characters.');
  }
  if (newPassword !== confirmPassword) {
    throw new HttpError(400, 'The new passwords do not match.');
  }
  if (newPassword === currentPassword) {
    throw new HttpError(400, 'Choose a new password different from your current password.');
  }
  return { currentPassword, newPassword };
}
