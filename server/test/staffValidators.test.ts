import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HttpError, ValidationError } from '../src/utils/httpError.js';
import {
  validateCreateStaff,
  validateStaffFilters,
  validateStaffId,
  validateUpdateStaff,
} from '../src/validators/staffValidators.js';

test('validateStaffId requires a valid UUID format', () => {
  const validUuid = '12345678-1234-4234-8234-123456789abc';
  assert.equal(validateStaffId(validUuid), validUuid);

  assert.throws(() => validateStaffId('invalid-uuid'), (err: unknown) => {
    assert(err instanceof HttpError);
    assert.equal(err.status, 400);
    return true;
  });
});

test('validateCreateStaff requires required fields and validates formats', () => {
  // Empty body
  assert.throws(() => validateCreateStaff(null), (err: unknown) => err instanceof HttpError && err.status === 400);

  // Missing fields
  assert.throws(() => validateCreateStaff({}), (err: unknown) => {
    assert(err instanceof ValidationError);
    assert(err.fields.firstName);
    assert(err.fields.lastName);
    assert(err.fields.email);
    assert(err.fields.password);
    return true;
  });

  // Short password
  assert.throws(
    () =>
      validateCreateStaff({
        firstName: 'Arthur',
        lastName: 'Pendleton',
        email: 'arthur@frighton.edu',
        password: 'short',
      }),
    (err: unknown) => {
      assert(err instanceof ValidationError);
      assert.match(err.fields.password, /at least 8 characters/);
      return true;
    }
  );

  // Invalid email
  assert.throws(
    () =>
      validateCreateStaff({
        firstName: 'Arthur',
        lastName: 'Pendleton',
        email: 'not-an-email',
        password: 'validPassword123',
      }),
    (err: unknown) => {
      assert(err instanceof ValidationError);
      assert.match(err.fields.email, /valid staff email/);
      return true;
    }
  );

  // Valid input
  const valid = validateCreateStaff({
    firstName: '  Arthur  ',
    middleName: '  Conan  ',
    lastName: '  Doyle  ',
    email: '  ARTHUR.DOYLE@FRIGHTON.EDU  ',
    password: 'securePassword123!',
    active: true,
  });

  assert.equal(valid.firstName, 'Arthur');
  assert.equal(valid.middleName, 'Conan');
  assert.equal(valid.lastName, 'Doyle');
  assert.equal(valid.email, 'arthur.doyle@frighton.edu');
  assert.equal(valid.password, 'securePassword123!');
  assert.equal(valid.active, true);
});

test('validateUpdateStaff checks fields and requires at least one update', () => {
  assert.throws(() => validateUpdateStaff({}), (err: unknown) => {
    assert(err instanceof HttpError);
    assert.match(err.message, /at least one field/i);
    return true;
  });

  assert.throws(
    () => validateUpdateStaff({ email: 'bad-email' }),
    (err: unknown) => {
      assert(err instanceof ValidationError);
      assert(err.fields.email);
      return true;
    }
  );

  const updated = validateUpdateStaff({
    firstName: 'Jane',
    middleName: null,
    active: false,
    password: 'newPassword123!',
  });

  assert.equal(updated.firstName, 'Jane');
  assert.equal(updated.middleName, null);
  assert.equal(updated.active, false);
  assert.equal(updated.password, 'newPassword123!');
});

test('validateStaffFilters handles pagination, search, and status filter', () => {
  const filters = validateStaffFilters({
    page: '2',
    pageSize: '50',
    query: '  doyle  ',
    status: 'active',
  });

  assert.equal(filters.page, 2);
  assert.equal(filters.pageSize, 50);
  assert.equal(filters.query, 'doyle');
  assert.equal(filters.status, 'active');

  assert.throws(
    () => validateStaffFilters({ status: 'unknown' }),
    (err: unknown) => err instanceof HttpError && err.status === 400
  );
});

