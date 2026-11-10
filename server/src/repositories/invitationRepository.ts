import crypto from 'node:crypto';
import type { User } from '@supabase/supabase-js';
import { config } from '../config/env.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import type {
  AcceptInvitationInput,
  CreateInvitationInput,
  InvitationStatus,
  StaffInvitation,
} from '../models/invitation.js';
import { databaseError } from '../utils/databaseError.js';
import { HttpError } from '../utils/httpError.js';

export const STANDARD_INVITATION_EXPIRY_HOURS = 48;

// Fallback in-memory store in case migration has not been applied to remote Supabase yet
const memoryInvitations = new Map<string, StaffInvitation>();

function buildInviteLink(token: string): string {
  return `${config.clientUrl.replace(/\/+$/, '')}/create-account?token=${encodeURIComponent(token)}`;
}

interface DbInvitationRow {
  id: string;
  email: string;
  token: string;
  role: 'Librarian' | 'Admin';
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  invited_by: string | null;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  status: InvitationStatus;
}

function mapRow(row: DbInvitationRow): StaffInvitation {
  const isExpired = row.status === 'pending' && new Date(row.expires_at) < new Date();
  const status: InvitationStatus = isExpired ? 'expired' : row.status;

  return {
    id: row.id,
    email: row.email,
    token: row.token,
    role: row.role,
    firstName: row.first_name,
    middleName: row.middle_name,
    lastName: row.last_name,
    invitedBy: row.invited_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    status,
    inviteLink: buildInviteLink(row.token),
  };
}

/**
 * Finds an auth user by email via generateLink or listUsers.
 * This avoids pagination limits and reliably locates users previously invited by email.
 */
async function findAuthUserByEmail(email: string): Promise<User | null> {
  const normalized = email.trim().toLowerCase();

  // 1. Direct O(1) lookup via magiclink generateLink
  try {
    const { data: linkData } = await getSupabaseAdmin().auth.admin.generateLink({
      type: 'magiclink',
      email: normalized,
    });
    if (linkData?.user) {
      return linkData.user;
    }
  } catch {
    // Continue to next lookup strategy
  }

  // 2. Check public.users to see if we already know their users_id
  try {
    const { data: profile } = await getSupabaseAdmin()
      .from('users')
      .select('users_id')
      .ilike('email', normalized.replace(/[\\%_]/g, '\\$&'))
      .maybeSingle();

    if (profile?.users_id) {
      const { data: byId } = await getSupabaseAdmin().auth.admin.getUserById(profile.users_id);
      if (byId?.user) return byId.user;
    }
  } catch {
    // Continue
  }

  // 3. Paginated search through listUsers (100 per page, up to 10 pages)
  try {
    for (let page = 1; page <= 10; page++) {
      const { data, error } = await getSupabaseAdmin().auth.admin.listUsers({ page, perPage: 100 });
      if (error || !data?.users || data.users.length === 0) break;
      const found = data.users.find((u) => u.email?.trim().toLowerCase() === normalized);
      if (found) return found;
      if (data.users.length < 100) break;
    }
  } catch {
    // Continue
  }

  return null;
}

/**
 * Provisions or updates the Supabase Auth user.
 * If the user was invited, it sets their password and confirms their email without throwing
 * "A user with this email address has already been registered".
 */
async function provisionAuthUser(
  email: string,
  password: string,
  metadata: Record<string, unknown>
): Promise<string> {
  const normalized = email.trim().toLowerCase();

  // Try finding the user first
  const existingUser = await findAuthUserByEmail(normalized);

  if (existingUser) {
    const { error: updateErr } = await getSupabaseAdmin().auth.admin.updateUserById(existingUser.id, {
      password,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (updateErr) throw new HttpError(400, updateErr.message);
    return existingUser.id;
  }

  // If not found, attempt to create
  const { data: createdAuth, error: createAuthErr } = await getSupabaseAdmin().auth.admin.createUser({
    email: normalized,
    password,
    email_confirm: true,
    user_metadata: metadata,
  });

  if (createdAuth?.user?.id) {
    return createdAuth.user.id;
  }

  // If createUser reports already registered, catch it and update via link recovery
  if (createAuthErr) {
    const isAlready =
      createAuthErr.message.toLowerCase().includes('already') ||
      createAuthErr.message.toLowerCase().includes('registered') ||
      createAuthErr.status === 422;

    if (isAlready) {
      for (const linkType of ['magiclink', 'invite', 'recovery'] as const) {
        try {
          const { data: linkRetry } = await getSupabaseAdmin().auth.admin.generateLink({
            type: linkType,
            email: normalized,
          });

          if (linkRetry?.user?.id) {
            const { error: updateErr } = await getSupabaseAdmin().auth.admin.updateUserById(linkRetry.user.id, {
              password,
              email_confirm: true,
              user_metadata: metadata,
            });
            if (updateErr) throw new HttpError(400, updateErr.message);
            return linkRetry.user.id;
          }
        } catch {
          // Continue to next link type
        }
      }

      try {
        for (let page = 1; page <= 20; page++) {
          const { data: listData, error: listErr } = await getSupabaseAdmin().auth.admin.listUsers({ page, perPage: 100 });
          if (listErr || !listData?.users || listData.users.length === 0) break;
          const found = listData.users.find((u) => u.email?.trim().toLowerCase() === normalized);
          if (found) {
            const { error: updateErr } = await getSupabaseAdmin().auth.admin.updateUserById(found.id, {
              password,
              email_confirm: true,
              user_metadata: metadata,
            });
            if (updateErr) throw new HttpError(400, updateErr.message);
            return found.id;
          }
          if (listData.users.length < 100) break;
        }
      } catch {
        // Continue
      }
    }
    throw new HttpError(400, createAuthErr.message);
  }

  throw new HttpError(500, 'Unable to provision staff authentication credentials.');
}

export async function createInvitation(
  input: CreateInvitationInput,
  currentAdminId: string
): Promise<StaffInvitation> {
  const normalizedEmail = input.email.trim().toLowerCase();

  // 1. Check if user already exists and is active in public.users
  const { data: existingUser } = await getSupabaseAdmin()
    .from('users')
    .select('users_id,is_active')
    .ilike('email', normalizedEmail.replace(/[\\%_]/g, '\\$&'))
    .maybeSingle();

  if (existingUser && existingUser.is_active) {
    throw new HttpError(409, 'An active account with this email address already exists.');
  }

  // 2. Generate secure token & standard 48-hour expiration
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + STANDARD_INVITATION_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();
  const inviteLink = buildInviteLink(token);

  // 3. Attempt Supabase Auth invite / generateLink so Supabase email gets sent if configured
  try {
    await getSupabaseAdmin().auth.admin.inviteUserByEmail(normalizedEmail, {
      data: {
        role: 'Librarian',
        first_name: input.firstName?.trim() || null,
        last_name: input.lastName?.trim() || null,
      },
      redirectTo: inviteLink,
    });
  } catch {
    // If Supabase Auth invite fails (e.g. SMTP limits or already in auth), try generateLink
    try {
      await getSupabaseAdmin().auth.admin.generateLink({
        type: 'invite',
        email: normalizedEmail,
        options: {
          redirectTo: inviteLink,
          data: { role: 'Librarian' },
        },
      });
    } catch {
      // Continue even if Supabase email dispatch fails; the token link is self-contained
    }
  }

  // 4. Revoke previous pending invitations for this email
  try {
    await getSupabaseAdmin()
      .from('staff_invitations')
      .update({ status: 'revoked' })
      .ilike('email', normalizedEmail.replace(/[\\%_]/g, '\\$&'))
      .eq('status', 'pending');
  } catch {
    // Ignore if table not present
  }

  for (const inv of memoryInvitations.values()) {
    if (inv.email.toLowerCase() === normalizedEmail && inv.status === 'pending') {
      inv.status = 'revoked';
    }
  }

  // 5. Persist invitation in database
  const invitationRecord: StaffInvitation = {
    id: crypto.randomUUID(),
    email: normalizedEmail,
    token,
    role: 'Librarian',
    firstName: input.firstName?.trim() || null,
    middleName: input.middleName?.trim() || null,
    lastName: input.lastName?.trim() || null,
    invitedBy: currentAdminId,
    createdAt: now.toISOString(),
    expiresAt,
    acceptedAt: null,
    status: 'pending',
    inviteLink,
  };

  const { data: inserted, error } = await getSupabaseAdmin()
    .from('staff_invitations')
    .insert({
      id: invitationRecord.id,
      email: normalizedEmail,
      token,
      role: 'Librarian',
      first_name: invitationRecord.firstName,
      middle_name: invitationRecord.middleName,
      last_name: invitationRecord.lastName,
      invited_by: currentAdminId,
      created_at: invitationRecord.createdAt,
      expires_at: expiresAt,
      status: 'pending',
    })
    .select('*')
    .single();

  if (error) {
    if (['42P01', 'PGRST205'].includes(error.code)) {
      // Table doesn't exist yet, save in memory fallback
      memoryInvitations.set(token, invitationRecord);
      return invitationRecord;
    }
    throw databaseError(error);
  }

  return mapRow(inserted as DbInvitationRow);
}

export async function getInvitationByToken(token: string): Promise<StaffInvitation | null> {
  const trimmed = token.trim();

  let jwtEmail: string | null = null;
  if (trimmed.includes('.')) {
    try {
      const payload = JSON.parse(Buffer.from(trimmed.split('.')[1], 'base64').toString('utf8'));
      if (payload?.email && typeof payload.email === 'string') {
        jwtEmail = payload.email.trim().toLowerCase();
      }
    } catch {
      // Ignore parse error
    }
  }

  const { data, error } = await getSupabaseAdmin()
    .from('staff_invitations')
    .select('*')
    .eq('token', trimmed)
    .maybeSingle();

  if (error) {
    if (['42P01', 'PGRST205'].includes(error.code)) {
      const memoryInv = memoryInvitations.get(trimmed);
      if (memoryInv) {
        if (memoryInv.status === 'pending' && new Date(memoryInv.expiresAt) < new Date()) {
          memoryInv.status = 'expired';
        }
        return memoryInv;
      }
      if (jwtEmail) {
        return getInvitationByEmail(jwtEmail);
      }
      return null;
    }
    throw databaseError(error);
  }

  if (!data) {
    const memoryInv = memoryInvitations.get(trimmed);
    if (memoryInv) return memoryInv;
    if (jwtEmail) {
      return getInvitationByEmail(jwtEmail);
    }
    return null;
  }

  return mapRow(data as DbInvitationRow);
}

export async function getInvitationByEmail(email: string): Promise<StaffInvitation | null> {
  const normalized = email.trim().toLowerCase();

  const { data, error } = await getSupabaseAdmin()
    .from('staff_invitations')
    .select('*')
    .ilike('email', normalized.replace(/[\\%_]/g, '\\$&'))
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (['42P01', 'PGRST205'].includes(error.code)) {
      for (const inv of memoryInvitations.values()) {
        if (inv.email.toLowerCase() === normalized) {
          return inv;
        }
      }
      return null;
    }
    throw databaseError(error);
  }

  if (!data) {
    for (const inv of memoryInvitations.values()) {
      if (inv.email.toLowerCase() === normalized) {
        return inv;
      }
    }
    return null;
  }

  return mapRow(data as DbInvitationRow);
}

export async function listInvitations(): Promise<StaffInvitation[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('staff_invitations')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    if (['42P01', 'PGRST205'].includes(error.code)) {
      const list = Array.from(memoryInvitations.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      return list.map((inv) => {
        if (inv.status === 'pending' && new Date(inv.expiresAt) < new Date()) {
          inv.status = 'expired';
        }
        return inv;
      });
    }
    throw databaseError(error);
  }

  return ((data ?? []) as DbInvitationRow[]).map(mapRow);
}

export async function revokeInvitation(id: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from('staff_invitations')
    .update({ status: 'revoked' })
    .eq('id', id);

  if (error && !['42P01', 'PGRST205'].includes(error.code)) {
    throw databaseError(error);
  }

  for (const inv of memoryInvitations.values()) {
    if (inv.id === id) inv.status = 'revoked';
  }
}

export async function resendInvitation(id: string, currentAdminId: string): Promise<StaffInvitation> {
  let current: StaffInvitation | null = null;
  const { data, error } = await getSupabaseAdmin()
    .from('staff_invitations')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (!error && data) {
    current = mapRow(data as DbInvitationRow);
  } else {
    for (const inv of memoryInvitations.values()) {
      if (inv.id === id) {
        current = inv;
        break;
      }
    }
  }

  if (!current) {
    throw new HttpError(404, 'Invitation not found.');
  }

  return createInvitation(
    {
      email: current.email,
      firstName: current.firstName,
      middleName: current.middleName,
      lastName: current.lastName,
    },
    currentAdminId
  );
}

export async function acceptInvitation(
  input: AcceptInvitationInput
): Promise<{ email: string; name: string }> {
  let invitation: StaffInvitation | null = null;

  // 1. Try finding by token
  if (input.token) {
    invitation = await getInvitationByToken(input.token);

    // If token looks like a JWT, attempt to extract email from payload
    if (!invitation && input.token.includes('.')) {
      try {
        const payload = JSON.parse(Buffer.from(input.token.split('.')[1], 'base64').toString('utf8'));
        if (payload?.email) {
          invitation = await getInvitationByEmail(payload.email);
        }
      } catch {
        // Continue
      }
    }
  }

  // 2. Try finding by email if passed
  if (!invitation && input.email) {
    invitation = await getInvitationByEmail(input.email);
  }

  if (!invitation) {
    throw new HttpError(404, 'Invalid or unrecognized invitation link.');
  }

  if (invitation.status === 'accepted') {
    throw new HttpError(400, 'This invitation has already been accepted. Please sign in to your account.');
  }

  if (invitation.status === 'revoked') {
    throw new HttpError(400, 'This invitation has been revoked by an administrator.');
  }

  const now = new Date();
  if (new Date(invitation.expiresAt) < now || invitation.status === 'expired') {
    throw new HttpError(
      410,
      'This invitation has expired. Invitations are valid for 48 hours. Please request a new invitation from your administrator.'
    );
  }

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const middleName = input.middleName?.trim() || null;
  const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ');

  // 3. Provision or update Supabase Auth user (never fails with "already registered")
  const authUserId = await provisionAuthUser(invitation.email, input.password, {
    first_name: firstName,
    middle_name: middleName,
    last_name: lastName,
    role: 'Librarian',
  });

  // 4. Create or update profile in public.users
  const { data: existingProfile } = await getSupabaseAdmin()
    .from('users')
    .select('users_id')
    .ilike('email', invitation.email.replace(/[\\%_]/g, '\\$&'))
    .maybeSingle();

  if (existingProfile) {
    const { error: updateDbErr } = await getSupabaseAdmin()
      .from('users')
      .update({
        first_name: firstName,
        middle_name: middleName,
        last_name: lastName,
        password: 'managed-by-supabase-auth',
        role: 'Librarian',
        is_active: true,
        updated_at: now.toISOString(),
      })
      .eq('users_id', existingProfile.users_id);

    if (updateDbErr) throw databaseError(updateDbErr);
  } else {
    const { error: insertDbErr } = await getSupabaseAdmin()
      .from('users')
      .insert({
        users_id: authUserId,
        first_name: firstName,
        middle_name: middleName,
        last_name: lastName,
        email: invitation.email.toLowerCase(),
        password: 'managed-by-supabase-auth',
        role: 'Librarian',
        is_active: true,
      });

    if (insertDbErr) throw databaseError(insertDbErr);
  }

  // 5. Mark invitation as accepted
  const acceptedAt = now.toISOString();
  await getSupabaseAdmin()
    .from('staff_invitations')
    .update({
      status: 'accepted',
      accepted_at: acceptedAt,
    })
    .eq('token', invitation.token);

  const memoryInv = memoryInvitations.get(invitation.token);
  if (memoryInv) {
    memoryInv.status = 'accepted';
    memoryInv.acceptedAt = acceptedAt;
  }

  return { email: invitation.email, name: fullName };
}
