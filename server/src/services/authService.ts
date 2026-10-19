import type { User } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '../config/supabase.js';

export interface Librarian {
  id: string;
  email: string;
  fullName: string;
  role: 'librarian';
}

export class AuthError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function findLibrarian(user: User): Promise<Librarian> {
  if (!user.email || !user.email_confirmed_at) {
    throw new AuthError(403, 'Please verify your staff email before signing in.');
  }

  // The deployed schema uses users_id and a verified email, not auth_user_id.
  // Never select or compare the legacy public.users.password column.
  const email = user.email.replace(/[\\%_]/g, '\\$&');
  const { data: profile, error } = await getSupabaseAdmin()
    .from('users')
    .select('users_id,email,first_name,middle_name,last_name,role,is_active')
    .ilike('email', email)
    .maybeSingle();

  if (error) {
    throw new AuthError(503, 'Staff verification is temporarily unavailable. Please try again.');
  }
  if (!profile || typeof profile.role !== 'string' || profile.role.toLowerCase() !== 'librarian') {
    throw new AuthError(403, 'This portal is restricted to active librarians.');
  }
  if (profile.is_active !== true) {
    throw new AuthError(403, 'Your staff account has been deactivated. Please contact the Library Administrator.');
  }

  return {
    id: profile.users_id,
    email: profile.email,
    fullName: [profile.first_name, profile.middle_name, profile.last_name].filter(Boolean).join(' '),
    role: 'librarian',
  };
}

export async function verifyLibrarian(token: string): Promise<Librarian> {
  // getUser verifies the signed JWT with Supabase; decoding claims alone is insufficient.
  const { data, error } = await getSupabaseAdmin().auth.getUser(token);
  if (error || !data.user) {
    if (error && (!error.status || error.status >= 500)) {
      throw new AuthError(503, 'Authentication is temporarily unavailable. Please try again.');
    }
    throw new AuthError(401, 'Your session has expired. Please sign in again.');
  }
  return findLibrarian(data.user);
}
