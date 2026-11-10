import { getSupabaseAdmin } from '../config/supabase.js';
import type { CreateStaffInput, StaffFilters, StaffRecord, UpdateStaffInput } from '../models/staff.js';
import { databaseError } from '../utils/databaseError.js';
import { HttpError } from '../utils/httpError.js';

interface DbUserRow {
  users_id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  email: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

function formatStaffRecord(person: DbUserRow): StaffRecord {
  return {
    id: person.users_id,
    firstName: person.first_name,
    middleName: person.middle_name ?? null,
    lastName: person.last_name,
    name: [person.first_name, person.middle_name, person.last_name].filter(Boolean).join(' '),
    email: person.email,
    active: person.is_active,
    since: person.created_at,
    updatedAt: person.updated_at,
  };
}

export async function listStaff({ page, pageSize, query, status }: StaffFilters) {
  let dbQuery = getSupabaseAdmin()
    .from('users')
    .select('users_id,first_name,middle_name,last_name,email,is_active,created_at,updated_at', { count: 'exact' })
    .eq('role', 'Librarian');

  if (status === 'active') {
    dbQuery = dbQuery.eq('is_active', true);
  } else if (status === 'deactivated') {
    dbQuery = dbQuery.eq('is_active', false);
  }

  if (query && query.trim()) {
    const q = query.trim().replace(/[\\%_]/g, '\\$&');
    dbQuery = dbQuery.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`);
  }

  const { data, error, count } = await dbQuery
    .order('last_name')
    .order('users_id')
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (error) throw databaseError(error);

  return {
    data: ((data ?? []) as DbUserRow[]).map(formatStaffRecord),
    total: count ?? 0,
    page,
    pageSize,
  };
}

export async function getStaffById(id: string): Promise<StaffRecord | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('users')
    .select('users_id,first_name,middle_name,last_name,email,is_active,created_at,updated_at')
    .eq('users_id', id)
    .eq('role', 'Librarian')
    .maybeSingle();

  if (error) throw databaseError(error);
  if (!data) return null;
  return formatStaffRecord(data as DbUserRow);
}

export async function createStaff(input: CreateStaffInput): Promise<StaffRecord> {
  const normalizedEmail = input.email.trim().toLowerCase();

  // 1. Check if an account with this email already exists in public.users
  const { data: existingUser, error: checkError } = await getSupabaseAdmin()
    .from('users')
    .select('users_id')
    .ilike('email', normalizedEmail.replace(/[\\%_]/g, '\\$&'))
    .maybeSingle();

  if (checkError) throw databaseError(checkError);
  if (existingUser) {
    throw new HttpError(409, 'An account with this email address already exists.');
  }

  // 2. Create the Supabase Auth user
  let authUserId: string;
  let createdAuthUser = false;

  const { data: authData, error: authError } = await getSupabaseAdmin().auth.admin.createUser({
    email: normalizedEmail,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      first_name: input.firstName,
      middle_name: input.middleName ?? null,
      last_name: input.lastName,
      role: 'Librarian',
    },
  });

  if (authError) {
    const isAlreadyRegistered =
      authError.message.toLowerCase().includes('already') ||
      authError.message.toLowerCase().includes('registered') ||
      authError.status === 422;

    if (isAlreadyRegistered) {
      // User exists in auth.users, check if they don't have a public.users row
      const { data: list } = await getSupabaseAdmin().auth.admin.listUsers();
      const existingAuth = list?.users.find((u) => u.email?.toLowerCase() === normalizedEmail);
      if (existingAuth) {
        authUserId = existingAuth.id;
        await getSupabaseAdmin().auth.admin.updateUserById(authUserId, {
          password: input.password,
          email_confirm: true,
          user_metadata: {
            first_name: input.firstName,
            middle_name: input.middleName ?? null,
            last_name: input.lastName,
            role: 'Librarian',
          },
        });
      } else {
        throw new HttpError(409, 'An authentication account with this email address already exists.');
      }
    } else {
      throw new HttpError(400, authError.message || 'Unable to create staff authentication account.');
    }
  } else {
    authUserId = authData.user.id;
    createdAuthUser = true;
  }

  // 3. Insert into public.users
  const { data: inserted, error: insertError } = await getSupabaseAdmin()
    .from('users')
    .insert({
      users_id: authUserId,
      first_name: input.firstName,
      middle_name: input.middleName ?? null,
      last_name: input.lastName,
      email: normalizedEmail,
      password: 'managed-by-supabase-auth',
      role: 'Librarian',
      is_active: input.active ?? true,
    })
    .select('users_id,first_name,middle_name,last_name,email,is_active,created_at,updated_at')
    .single();

  if (insertError) {
    if (createdAuthUser) {
      try {
        await getSupabaseAdmin().auth.admin.deleteUser(authUserId);
      } catch {
        // Rollback attempt
      }
    }
    throw databaseError(insertError);
  }

  return formatStaffRecord(inserted as DbUserRow);
}

export async function updateStaff(id: string, input: UpdateStaffInput, currentAdminId: string): Promise<StaffRecord> {
  if (id === currentAdminId && input.active === false) {
    throw new HttpError(400, 'You cannot deactivate your own administrator account.');
  }

  // 1. Verify existence of librarian
  const { data: existing, error: findError } = await getSupabaseAdmin()
    .from('users')
    .select('users_id,first_name,middle_name,last_name,email,is_active,role')
    .eq('users_id', id)
    .eq('role', 'Librarian')
    .maybeSingle();

  if (findError) throw databaseError(findError);
  if (!existing) {
    throw new HttpError(404, 'Librarian account not found.');
  }

  // 2. Check for email uniqueness if changing email
  let normalizedEmail: string | undefined;
  if (input.email !== undefined) {
    normalizedEmail = input.email.trim().toLowerCase();
    if (normalizedEmail !== existing.email.toLowerCase()) {
      const { data: emailConflict, error: conflictErr } = await getSupabaseAdmin()
        .from('users')
        .select('users_id')
        .ilike('email', normalizedEmail.replace(/[\\%_]/g, '\\$&'))
        .neq('users_id', id)
        .maybeSingle();

      if (conflictErr) throw databaseError(conflictErr);
      if (emailConflict) {
        throw new HttpError(409, 'An account with this email address already exists.');
      }
    }
  }

  // 3. Update Supabase Auth user if needed
  let authUser = (await getSupabaseAdmin().auth.admin.getUserById(id))?.data?.user;
  if (!authUser) {
    const { data: list } = await getSupabaseAdmin().auth.admin.listUsers();
    authUser = list?.users.find((u) => u.email?.toLowerCase() === existing.email.toLowerCase()) ?? null;
  }

  if (authUser) {
    const authUpdates: { email?: string; password?: string; email_confirm?: boolean; user_metadata?: Record<string, unknown> } = {};
    if (normalizedEmail && normalizedEmail !== existing.email.toLowerCase()) {
      authUpdates.email = normalizedEmail;
      authUpdates.email_confirm = true;
    }
    if (input.password) {
      authUpdates.password = input.password;
    }
    const meta: Record<string, unknown> = { ...authUser.user_metadata };
    if (input.firstName !== undefined) meta.first_name = input.firstName;
    if (input.middleName !== undefined) meta.middle_name = input.middleName;
    if (input.lastName !== undefined) meta.last_name = input.lastName;
    authUpdates.user_metadata = meta;

    const { error: authErr } = await getSupabaseAdmin().auth.admin.updateUserById(authUser.id, authUpdates);
    if (authErr) throw new HttpError(400, authErr.message);

    if (input.active === false && existing.is_active === true) {
      try {
        await getSupabaseAdmin().auth.admin.signOut(authUser.id, 'global');
      } catch {
        // Ignore session revoke errors
      }
    }
  } else if (input.password) {
    await getSupabaseAdmin().auth.admin.createUser({
      email: normalizedEmail || existing.email,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        first_name: input.firstName || existing.first_name,
        middle_name: input.middleName !== undefined ? input.middleName : existing.middle_name,
        last_name: input.lastName || existing.last_name,
        role: 'Librarian',
      },
    });
  }

  // 4. Update public.users
  const dbUpdates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.firstName !== undefined) dbUpdates.first_name = input.firstName;
  if (input.middleName !== undefined) dbUpdates.middle_name = input.middleName;
  if (input.lastName !== undefined) dbUpdates.last_name = input.lastName;
  if (normalizedEmail !== undefined) dbUpdates.email = normalizedEmail;
  if (input.active !== undefined) dbUpdates.is_active = input.active;

  const { data: updated, error: updateError } = await getSupabaseAdmin()
    .from('users')
    .update(dbUpdates)
    .eq('users_id', id)
    .select('users_id,first_name,middle_name,last_name,email,is_active,created_at,updated_at')
    .single();

  if (updateError) throw databaseError(updateError);
  return formatStaffRecord(updated as DbUserRow);
}

export async function deleteStaff(id: string, currentAdminId: string): Promise<void> {
  if (id === currentAdminId) {
    throw new HttpError(400, 'You cannot delete your own administrator account.');
  }

  // 1. Verify librarian exists
  const { data: existing, error: findError } = await getSupabaseAdmin()
    .from('users')
    .select('users_id,first_name,last_name,email,role')
    .eq('users_id', id)
    .eq('role', 'Librarian')
    .maybeSingle();

  if (findError) throw databaseError(findError);
  if (!existing) {
    throw new HttpError(404, 'Librarian account not found.');
  }

  // 2. Check for reference history before attempting hard delete
  const { count: borrowCount, error: borrowErr } = await getSupabaseAdmin()
    .from('borrow_records')
    .select('id', { count: 'exact', head: true })
    .or(`issued_by.eq.${id},returned_to.eq.${id}`);

  if (!borrowErr && borrowCount && borrowCount > 0) {
    throw new HttpError(
      409,
      'This librarian account cannot be deleted because it is recorded in book circulation history. Deactivate the account instead to disable access.'
    );
  }

  const { count: resCount, error: resErr } = await getSupabaseAdmin()
    .from('reservations')
    .select('id', { count: 'exact', head: true })
    .eq('reserved_by', id);

  if (!resErr && resCount && resCount > 0) {
    throw new HttpError(
      409,
      'This librarian account cannot be deleted because it is recorded in reservation records. Deactivate the account instead to disable access.'
    );
  }

  const { count: chargeCount, error: chargeErr } = await getSupabaseAdmin()
    .from('library_replacement_charges')
    .select('id', { count: 'exact', head: true })
    .or(`assessed_by.eq.${id},settled_by.eq.${id}`);

  if (!chargeErr && chargeCount && chargeCount > 0) {
    throw new HttpError(
      409,
      'This librarian account cannot be deleted because it is recorded in replacement charges. Deactivate the account instead to disable access.'
    );
  }

  // 3. Delete from public.users
  const { error: deleteDbError } = await getSupabaseAdmin()
    .from('users')
    .delete()
    .eq('users_id', id);

  if (deleteDbError) {
    if (deleteDbError.code === '23503') {
      throw new HttpError(
        409,
        'This librarian account cannot be deleted because it is referenced in library records. Deactivate the account instead.'
      );
    }
    throw databaseError(deleteDbError);
  }

  // 4. Delete from Supabase Auth
  try {
    let authUser = (await getSupabaseAdmin().auth.admin.getUserById(id))?.data?.user;
    if (!authUser) {
      const { data: list } = await getSupabaseAdmin().auth.admin.listUsers();
      authUser = list?.users.find((u) => u.email?.toLowerCase() === existing.email.toLowerCase()) ?? null;
    }
    if (authUser) {
      await getSupabaseAdmin().auth.admin.deleteUser(authUser.id);
    }
  } catch {
    // Auth cleanup best effort
  }
}
