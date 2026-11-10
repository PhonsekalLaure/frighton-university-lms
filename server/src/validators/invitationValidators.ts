import type { AcceptInvitationInput, CreateInvitationInput } from '../models/invitation.js';
import { HttpError, ValidationError } from '../utils/httpError.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateCreateInvitation(value: unknown): CreateInvitationInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'Enter the invitation details.');
  }

  const input = value as Record<string, unknown>;
  const fields: Record<string, string> = {};

  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (!email) {
    fields.email = 'Staff email address is required.';
  } else if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    fields.email = 'Enter a valid staff email address.';
  }

  let firstName: string | null = null;
  if (input.firstName !== undefined && input.firstName !== null) {
    if (typeof input.firstName !== 'string') {
      fields.firstName = 'First name must be text.';
    } else {
      const trimmed = input.firstName.trim();
      if (trimmed.length > 100) {
        fields.firstName = 'First name must be 100 characters or fewer.';
      } else {
        firstName = trimmed || null;
      }
    }
  }

  let middleName: string | null = null;
  if (input.middleName !== undefined && input.middleName !== null) {
    if (typeof input.middleName !== 'string') {
      fields.middleName = 'Middle name must be text.';
    } else {
      const trimmed = input.middleName.trim();
      if (trimmed.length > 100) {
        fields.middleName = 'Middle name must be 100 characters or fewer.';
      } else {
        middleName = trimmed || null;
      }
    }
  }

  let lastName: string | null = null;
  if (input.lastName !== undefined && input.lastName !== null) {
    if (typeof input.lastName !== 'string') {
      fields.lastName = 'Last name must be text.';
    } else {
      const trimmed = input.lastName.trim();
      if (trimmed.length > 100) {
        fields.lastName = 'Last name must be 100 characters or fewer.';
      } else {
        lastName = trimmed || null;
      }
    }
  }

  if (Object.keys(fields).length > 0) {
    throw new ValidationError(fields);
  }

  return { email, firstName, middleName, lastName };
}

export function validateAcceptInvitation(value: unknown): AcceptInvitationInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'Enter your account details to complete registration.');
  }

  const input = value as Record<string, unknown>;
  const fields: Record<string, string> = {};

  const token = typeof input.token === 'string' ? input.token.trim() : '';
  if (!token) {
    throw new HttpError(400, 'Invitation token is missing.');
  }

  const firstName = typeof input.firstName === 'string' ? input.firstName.trim() : '';
  if (!firstName) {
    fields.firstName = 'First name is required.';
  } else if (firstName.length > 100) {
    fields.firstName = 'First name must be 100 characters or fewer.';
  }

  let middleName: string | null = null;
  if (input.middleName !== undefined && input.middleName !== null) {
    if (typeof input.middleName !== 'string') {
      fields.middleName = 'Middle name must be text.';
    } else {
      const trimmed = input.middleName.trim();
      if (trimmed.length > 100) {
        fields.middleName = 'Middle name must be 100 characters or fewer.';
      } else {
        middleName = trimmed || null;
      }
    }
  }

  const lastName = typeof input.lastName === 'string' ? input.lastName.trim() : '';
  if (!lastName) {
    fields.lastName = 'Last name is required.';
  } else if (lastName.length > 100) {
    fields.lastName = 'Last name must be 100 characters or fewer.';
  }

  const password = typeof input.password === 'string' ? input.password : '';
  if (!password) {
    fields.password = 'Password is required.';
  } else if (password.length < 8) {
    fields.password = 'Password must be at least 8 characters long.';
  } else if (password.length > 1024) {
    fields.password = 'Password must be 1024 characters or fewer.';
  }

  if (Object.keys(fields).length > 0) {
    throw new ValidationError(fields);
  }

  const email = typeof input.email === 'string' && input.email.trim() ? input.email.trim().toLowerCase() : undefined;

  return { token, email, password, firstName, middleName, lastName };
}

