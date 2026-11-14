import { createSupabaseAuthClient, getSupabaseAdmin } from '../config/supabase.js';
import type { ChangePasswordInput, UpdateProfileInput } from '../models/profile.js';
import { updateProfileNames } from '../repositories/profileRepository.js';
import { findLibrarian, type Librarian } from './authService.js';
import { HttpError } from '../utils/httpError.js';

export async function updateMyProfile(librarian: Librarian, input: UpdateProfileInput): Promise<Librarian> {
  const names = await updateProfileNames(librarian.id, input);
  return {
    ...librarian,
    ...names,
    fullName: [names.firstName, names.middleName, names.lastName].filter(Boolean).join(' '),
  };
}

export async function changeMyPassword(librarian: Librarian, input: ChangePasswordInput): Promise<void> {
  const client = createSupabaseAuthClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: librarian.email,
    password: input.currentPassword,
  });
  if (error || !data.session || !data.user) {
    if (error && (!error.status || error.status >= 500)) {
      throw new HttpError(503, 'Password service is temporarily unavailable. Please try again.');
    }
    throw new HttpError(400, 'Your current password is incorrect.');
  }

  try {
    // Recheck staff eligibility and identity after reauthentication.
    const verified = await findLibrarian(data.user);
    if (verified.id !== librarian.id) {
      throw new HttpError(403, 'The verified account does not match your staff account.');
    }
    const { error: updateError } = await getSupabaseAdmin().auth.admin.updateUserById(
      data.user.id, { password: input.newPassword },
    );
    if (updateError) {
      if (!updateError.status || updateError.status >= 500) {
        throw new HttpError(503, 'Password service is temporarily unavailable. Please try again.');
      }
      throw new HttpError(400, 'The new password could not be saved. Check it and try again.');
    }
  } finally {
    // End only the temporary verification session, including when an update fails.
    // Cleanup must not turn an already completed password change into a failed response.
    await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
  }
}
