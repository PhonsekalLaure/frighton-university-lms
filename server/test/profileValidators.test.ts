import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateChangePassword, validateUpdateProfile } from '../src/validators/profileValidators.js';

const profile = { firstName: '  Jane ', middleName: '  A. ', lastName: ' Doe  ', confirmed: true };
const password = { currentPassword: 'old-password', newPassword: 'new-password', confirmPassword: 'new-password', confirmed: true };

test('profile and password changes require explicit confirmation', () => {
  for (const confirmed of [undefined, null, false, 'true', 1]) {
    assert.throws(() => validateUpdateProfile({ ...profile, confirmed }), { status: 400 });
    assert.throws(() => validateChangePassword({ ...password, confirmed }), { status: 400 });
  }
  for (const body of [null, undefined, [], 'invalid', 1]) {
    assert.throws(() => validateUpdateProfile(body), { status: 400 });
    assert.throws(() => validateChangePassword(body), { status: 400 });
  }
});

test('profile validation trims names, permits clearing a middle name, and rejects invalid names', () => {
  assert.deepEqual(validateUpdateProfile(profile), { firstName: 'Jane', middleName: 'A.', lastName: 'Doe' });
  for (const middleName of [undefined, null, '', '   ']) {
    assert.equal(validateUpdateProfile({ ...profile, middleName }).middleName, null);
  }
  for (const fields of [
    { firstName: '' }, { firstName: '  ' }, { lastName: ' ' }, { firstName: 123 },
    { lastName: null }, { middleName: [] }, { firstName: 'a'.repeat(101) },
    { middleName: 'a'.repeat(101) }, { lastName: 'a'.repeat(101) },
  ]) {
    assert.throws(() => validateUpdateProfile({ ...profile, ...fields }), { status: 400 });
  }
});

test('password validation checks current password, confirmation, length, and password reuse', () => {
  assert.deepEqual(validateChangePassword(password), { currentPassword: 'old-password', newPassword: 'new-password' });
  for (const fields of [
    { currentPassword: '' }, { currentPassword: 42 }, { currentPassword: 'x'.repeat(1025) },
    { newPassword: 'short', confirmPassword: 'short' }, { newPassword: 123 },
    { newPassword: 'x'.repeat(1025), confirmPassword: 'x'.repeat(1025) },
    { confirmPassword: undefined }, { confirmPassword: 'different' },
    { newPassword: password.currentPassword, confirmPassword: password.currentPassword },
  ]) {
    assert.throws(() => validateChangePassword({ ...password, ...fields }), { status: 400 });
  }
  // Password bytes are preserved, including leading and trailing spaces.
  assert.equal(validateChangePassword({ ...password, newPassword: ' spaces matter ', confirmPassword: ' spaces matter ' }).newPassword, ' spaces matter ');
});
