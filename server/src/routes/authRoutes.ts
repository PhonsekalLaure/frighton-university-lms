import { Router } from 'express';
import { createSupabaseAuthClient, getSupabaseAdmin } from '../config/supabase.js';
import { createAuthRateLimit, requireLibrarian } from '../middlewares/auth.js';
import { acceptInvitation, getInvitationByEmail, getInvitationByToken } from '../repositories/invitationRepository.js';
import { AuthError, findLibrarian } from '../services/authService.js';
import { clearAuthCookies, readAccessToken, readCookie, setAuthCookies } from '../utils/authCookies.js';
import { HttpError } from '../utils/httpError.js';
import { validateAcceptInvitation } from '../validators/invitationValidators.js';

export const authRouter = Router();

authRouter.post('/login', createAuthRateLimit(20, 15 * 60 * 1000), async (req, res, next) => {
  try {
    const { email, password, remember = false } = req.body ?? {};
    if (
      typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      typeof password !== 'string' || !password || password.length > 1024 ||
      typeof remember !== 'boolean'
    ) {
      throw new AuthError(400, 'Enter a valid staff email and password.');
    }

    const client = createSupabaseAuthClient();
    const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.session || !data.user) {
      if (error && (!error.status || error.status >= 500)) {
        throw new AuthError(503, 'Authentication is temporarily unavailable. Please try again.');
      }
      throw new AuthError(401, 'Invalid email or password.');
    }

    try {
      const librarian = await findLibrarian(data.user);
      setAuthCookies(res, data.session, remember);
      res.json({ librarian });
    } catch (error) {
      await client.auth.signOut({ scope: 'local' });
      clearAuthCookies(res);
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

authRouter.get('/me', requireLibrarian, (_req, res) => {
  res.json({ librarian: res.locals.librarian });
});

authRouter.patch('/profile', requireLibrarian, async (req, res, next) => {
  try {
    const { firstName, middleName, lastName } = req.body ?? {};
    if (typeof firstName !== 'string' || !firstName.trim() || firstName.trim().length > 100) {
      throw new AuthError(400, 'Enter a first name up to 100 characters.');
    }
    if (middleName !== undefined && middleName !== null && typeof middleName !== 'string') {
      throw new AuthError(400, 'Middle name must be text.');
    }
    if (typeof middleName === 'string' && middleName.trim().length > 100) {
      throw new AuthError(400, 'Middle name must be 100 characters or fewer.');
    }
    if (typeof lastName !== 'string' || !lastName.trim() || lastName.trim().length > 100) {
      throw new AuthError(400, 'Enter a last name up to 100 characters.');
    }

    const first = firstName.trim();
    const middle = typeof middleName === 'string' ? middleName.trim() || null : null;
    const last = lastName.trim();
    const { data: profile, error } = await getSupabaseAdmin()
      .from('users')
      .update({ first_name: first, middle_name: middle, last_name: last, updated_at: new Date().toISOString() })
      .eq('users_id', res.locals.librarian.id)
      .select('first_name,middle_name,last_name')
      .single();
    if (error || !profile) {
      throw new AuthError(503, 'Your profile could not be saved. Please try again.');
    }

    res.json({ librarian: {
      ...res.locals.librarian,
      firstName: profile.first_name,
      middleName: profile.middle_name,
      lastName: profile.last_name,
      fullName: [profile.first_name, profile.middle_name, profile.last_name].filter(Boolean).join(' '),
    } });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/change-password', requireLibrarian, createAuthRateLimit(5, 15 * 60 * 1000), async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body ?? {};
    if (typeof currentPassword !== 'string' || !currentPassword || currentPassword.length > 1024) {
      throw new AuthError(400, 'Enter your current password.');
    }
    if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 1024) {
      throw new AuthError(400, 'The new password must be between 8 and 1024 characters.');
    }

    const client = createSupabaseAuthClient();
    const { data, error } = await client.auth.signInWithPassword({
      email: res.locals.librarian.email,
      password: currentPassword,
    });
    if (error || !data.session || !data.user) {
      if (error && (!error.status || error.status >= 500)) {
        throw new AuthError(503, 'Password service is temporarily unavailable. Please try again.');
      }
      throw new AuthError(400, 'Your current password is incorrect.');
    }

    const { error: updateError } = await getSupabaseAdmin().auth.admin.updateUserById(data.user.id, { password: newPassword });
    if (updateError) {
      if (!updateError.status || updateError.status >= 500) {
        throw new AuthError(503, 'Password service is temporarily unavailable. Please try again.');
      }
      throw new AuthError(400, 'The new password could not be saved. Check it and try again.');
    }
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

authRouter.post('/refresh', createAuthRateLimit(60, 15 * 60 * 1000), async (req, res, next) => {
  try {
    const refreshToken = readCookie(req, 'lms_refresh');
    if (!refreshToken) {
      throw new AuthError(401, 'Please sign in with your librarian account.');
    }
    const client = createSupabaseAuthClient();
    const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session || !data.user) {
      if (error && (!error.status || error.status >= 500)) {
        throw new AuthError(503, 'Authentication is temporarily unavailable. Please try again.');
      }
      throw new AuthError(401, 'Your session has expired. Please sign in again.');
    }

    try {
      const librarian = await findLibrarian(data.user);
      setAuthCookies(res, data.session, readCookie(req, 'lms_remember') === '1');
      res.json({ librarian });
    } catch (error) {
      await client.auth.signOut({ scope: 'local' });
      throw error;
    }
  } catch (error) {
    if (error instanceof AuthError && [401, 403].includes(error.status)) clearAuthCookies(res);
    next(error);
  }
});

authRouter.post('/logout', async (req, res, next) => {
  clearAuthCookies(res);
  try {
    let token = readAccessToken(req);
    // An expired access cookie may already be absent when the user signs out.
    if (!token) {
      const refreshToken = readCookie(req, 'lms_refresh');
      if (refreshToken) {
        const { data } = await createSupabaseAuthClient().auth.refreshSession({ refresh_token: refreshToken });
        token = data.session?.access_token;
      }
    }
    if (token) {
      const { error } = await getSupabaseAdmin().auth.admin.signOut(token, 'local');
      if (error && (!error.status || error.status >= 500)) {
        throw new AuthError(503, 'Your browser session was cleared, but sign out could not reach the authentication service.');
      }
    }
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

authRouter.get('/invitation', async (req, res, next) => {
  try {
    const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';
    const email = typeof req.query.email === 'string' ? req.query.email.trim() : '';

    if (!token && !email) {
      throw new HttpError(400, 'Invitation token or email is missing.');
    }

    let invitation = token ? await getInvitationByToken(token) : null;
    if (!invitation && email) {
      invitation = await getInvitationByEmail(email);
    }

    if (!invitation) {
      throw new HttpError(404, 'Invitation not found or link is invalid.');
    }

    res.json({ invitation });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/accept-invite', createAuthRateLimit(15, 15 * 60 * 1000), async (req, res, next) => {
  try {
    const input = validateAcceptInvitation(req.body);
    const result = await acceptInvitation(input);
    res.json({ message: 'Account created successfully.', ...result });
  } catch (error) {
    next(error);
  }
});
