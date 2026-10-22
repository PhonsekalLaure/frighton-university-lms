import { getSupabaseAdmin } from '../config/supabase.js';
import type { Pagination } from '../types/loan.js';
import { databaseError } from '../utils/databaseError.js';

export async function listStaff({ page, pageSize }: Pagination) {
  const { data, error, count } = await getSupabaseAdmin().from('users')
    .select('users_id,first_name,middle_name,last_name,email,is_active,created_at', { count: 'exact' })
    .eq('role', 'Librarian').order('last_name').order('users_id')
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw databaseError(error);
  return {
    data: (data ?? []).map((person) => ({
      name: [person.first_name, person.middle_name, person.last_name].filter(Boolean).join(' '),
      email: person.email, active: person.is_active, since: person.created_at,
    })), total: count ?? 0, page, pageSize,
  };
}
