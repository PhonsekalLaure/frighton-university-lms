import type { CreateStaffInput, StaffFilters, UpdateStaffInput } from '../models/staff.js';
import { HttpError, ValidationError } from '../utils/httpError.js';
import { parsePagination, parseUuid } from './loanValidators.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateStaffId(id: unknown): string {
  return parseUuid(id, 'Librarian ID');
}

export function validateCreateStaff(value: unknown): CreateStaffInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'Enter the librarian details before saving.');
  }

  const input = value as Record<string, unknown>;
  const fields: Record<string, string> = {};

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

  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (!email) {
    fields.email = 'Staff email address is required.';
  } else if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    fields.email = 'Enter a valid staff email address.';
  }

  const password = typeof input.password === 'string' ? input.password : '';
  if (!password) {
    fields.password = 'Initial password is required.';
  } else if (password.length < 8) {
    fields.password = 'Password must be at least 8 characters long.';
  } else if (password.length > 1024) {
    fields.password = 'Password must be 1024 characters or fewer.';
  }

  let active: boolean | undefined = undefined;
  if (input.active !== undefined) {
    if (typeof input.active !== 'boolean') {
      fields.active = 'Active status must be a boolean.';
    } else {
      active = input.active;
    }
  }

  if (Object.keys(fields).length > 0) {
    throw new ValidationError(fields);
  }

  return {
    firstName,
    middleName,
    lastName,
    email,
    password,
    active: active ?? true,
  };
}

export function validateUpdateStaff(value: unknown): UpdateStaffInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'Enter the librarian details to update.');
  }

  const input = value as Record<string, unknown>;
  const fields: Record<string, string> = {};
  const output: UpdateStaffInput = {};
  let hasUpdate = false;

  if (input.firstName !== undefined) {
    if (typeof input.firstName !== 'string' || !input.firstName.trim()) {
      fields.firstName = 'First name cannot be empty.';
    } else if (input.firstName.trim().length > 100) {
      fields.firstName = 'First name must be 100 characters or fewer.';
    } else {
      output.firstName = input.firstName.trim();
      hasUpdate = true;
    }
  }

  if (input.middleName !== undefined) {
    if (input.middleName === null || input.middleName === '') {
      output.middleName = null;
      hasUpdate = true;
    } else if (typeof input.middleName !== 'string') {
      fields.middleName = 'Middle name must be text.';
    } else if (input.middleName.trim().length > 100) {
      fields.middleName = 'Middle name must be 100 characters or fewer.';
    } else {
      output.middleName = input.middleName.trim();
      hasUpdate = true;
    }
  }

  if (input.lastName !== undefined) {
    if (typeof input.lastName !== 'string' || !input.lastName.trim()) {
      fields.lastName = 'Last name cannot be empty.';
    } else if (input.lastName.trim().length > 100) {
      fields.lastName = 'Last name must be 100 characters or fewer.';
    } else {
      output.lastName = input.lastName.trim();
      hasUpdate = true;
    }
  }

  if (input.email !== undefined) {
    if (typeof input.email !== 'string' || !input.email.trim()) {
      fields.email = 'Staff email address cannot be empty.';
    } else {
      const email = input.email.trim().toLowerCase();
      if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
        fields.email = 'Enter a valid staff email address.';
      } else {
        output.email = email;
        hasUpdate = true;
      }
    }
  }

  if (input.password !== undefined) {
    if (typeof input.password !== 'string' || input.password.length < 8) {
      fields.password = 'Password must be at least 8 characters long.';
    } else if (input.password.length > 1024) {
      fields.password = 'Password must be 1024 characters or fewer.';
    } else {
      output.password = input.password;
      hasUpdate = true;
    }
  }

  if (input.active !== undefined) {
    if (typeof input.active !== 'boolean') {
      fields.active = 'Active status must be a boolean.';
    } else {
      output.active = input.active;
      hasUpdate = true;
    }
  }

  if (Object.keys(fields).length > 0) {
    throw new ValidationError(fields);
  }

  if (!hasUpdate) {
    throw new HttpError(400, 'Provide at least one field to update.');
  }

  return output;
}

export function validateStaffFilters(query: Record<string, unknown>): StaffFilters {
  const { page, pageSize } = parsePagination(query);
  let status: string | undefined = undefined;
  if (typeof query.status === 'string') {
    const s = query.status.trim().toLowerCase();
    if (s && s !== 'all') {
      if (s !== 'active' && s !== 'deactivated') {
        throw new HttpError(400, 'Status filter must be all, active, or deactivated.');
      }
      status = s;
    }
  }

  let search: string | undefined = undefined;
  if (typeof query.query === 'string' && query.query.trim()) {
    search = query.query.trim().slice(0, 100);
  }

  return { page, pageSize, query: search, status };
}

