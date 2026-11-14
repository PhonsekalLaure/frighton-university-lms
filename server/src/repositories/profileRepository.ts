import { getSupabaseAdmin } from '../config/supabase.js';
import type { UpdateProfileInput } from '../models/profile.js';
import { HttpError } from '../utils/httpError.js';

export async function updateProfileNames(id: string, input: UpdateProfileInput): Promise<UpdateProfileInput> {
  // The authenticated staff ID is supplied by the controller, never by the request body.
  const { data, error } = await getSupabaseAdmin()
    .from('users')
    .update({
      first_name: input.firstName,
      middle_name: input.middleName,
      last_name: input.lastName,
      updated_at: new Date().toISOString(),
    })
    .eq('users_id', id)
    .eq('is_active', true)
    .select('first_name,middle_name,last_name')
    .single();

  if (error || !data) {
    throw new HttpError(503, 'Your profile could not be saved. Please try again.');
  }
  return { firstName: data.first_name, middleName: data.middle_name, lastName: data.last_name };
}
