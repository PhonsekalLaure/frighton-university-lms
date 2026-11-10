import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STANDARD_INVITATION_EXPIRY_HOURS } from '../src/repositories/invitationRepository.js';
import { HttpError, ValidationError } from '../src/utils/httpError.js';
import {
  validateAcceptInvitation,
  validateCreateInvitation,
} from '../src/validators/invitationValidators.js';

test('STANDARD_INVITATION_EXPIRY_HOURS is set to 48 hours', () => {
  assert.equal(STANDARD_INVITATION_EXPIRY_HOURS, 48);
});

test('validateCreateInvitation requires valid email and accepts optional names without password', () => {
  // Empty
  assert.throws(() => validateCreateInvitation(null), (err: unknown) => err instanceof HttpError && err.status === 400);

  // Missing email
  assert.throws(() => validateCreateInvitation({}), (err: unknown) => {
    assert(err instanceof ValidationError);
    assert(err.fields.email);
    return true;
  });

  // Invalid email
  assert.throws(() => validateCreateInvitation({ email: 'bad-email' }), (err: unknown) => {
    assert(err instanceof ValidationError);
    assert.match(err.fields.email, /valid staff email/);
    return true;
  });

  // Valid invite with only email
  const onlyEmail = validateCreateInvitation({ email: '  LIBRARIAN@FRIGHTON.EDU  ' });
  assert.equal(onlyEmail.email, 'librarian@frighton.edu');
  assert.equal(onlyEmail.firstName, null);
  assert.equal(onlyEmail.lastName, null);

  // Valid invite with optional names
  const withNames = validateCreateInvitation({
    email: 'm.blackwood@frighton.edu',
    firstName: 'Marcus',
    lastName: 'Blackwood',
  });
  assert.equal(withNames.email, 'm.blackwood@frighton.edu');
  assert.equal(withNames.firstName, 'Marcus');
  assert.equal(withNames.lastName, 'Blackwood');
});

test('validateAcceptInvitation requires token, valid names, and min 8 char password', () => {
  // Missing token
  assert.throws(
    () => validateAcceptInvitation({ firstName: 'Marcus', lastName: 'Blackwood', password: 'password123' }),
    (err: unknown) => err instanceof HttpError && err.status === 400
  );

  // Short password
  assert.throws(
    () => validateAcceptInvitation({ token: 'test-token', firstName: 'Marcus', lastName: 'Blackwood', password: 'short' }),
    (err: unknown) => {
      assert(err instanceof ValidationError);
      assert.match(err.fields.password, /at least 8 characters/);
      return true;
    }
  );

  // Missing names
  assert.throws(
    () => validateAcceptInvitation({ token: 'test-token', password: 'validPassword123' }),
    (err: unknown) => {
      assert(err instanceof ValidationError);
      assert(err.fields.firstName);
      assert(err.fields.lastName);
      return true;
    }
  );

  // Valid
  const accepted = validateAcceptInvitation({
    token: '  valid-invite-token  ',
    firstName: '  Marcus  ',
    middleName: '  A.  ',
    lastName: '  Blackwood  ',
    password: 'secretPassword123!',
  });
  assert.equal(accepted.token, 'valid-invite-token');
  assert.equal(accepted.firstName, 'Marcus');
  assert.equal(accepted.middleName, 'A.');
  assert.equal(accepted.lastName, 'Blackwood');
  assert.equal(accepted.password, 'secretPassword123!');
});

