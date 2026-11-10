import { apiRequest } from './api';
import type { Staff, StaffInvitation } from '../types/library';

export interface CreateStaffInput {
  firstName: string;
  middleName?: string | null;
  lastName: string;
  email: string;
  password?: string;
  active?: boolean;
}

export interface InviteLibrarianInput {
  email: string;
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
}

export interface UpdateStaffInput {
  firstName?: string;
  middleName?: string | null;
  lastName?: string;
  email?: string;
  active?: boolean;
  password?: string;
}

export interface AcceptInvitationInput {
  token: string;
  email?: string;
  password: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
}

export async function createStaff(input: CreateStaffInput): Promise<Staff> {
  const result = await apiRequest<{ staff: Staff }>('/v1/staff', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return result.staff;
}

export async function inviteLibrarian(
  input: InviteLibrarianInput
): Promise<{ invitation: StaffInvitation; message: string }> {
  return apiRequest<{ invitation: StaffInvitation; message: string }>('/v1/staff/invite', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getInvitations(): Promise<StaffInvitation[]> {
  const result = await apiRequest<{ invitations: StaffInvitation[] }>('/v1/staff/invitations');
  return result.invitations ?? [];
}

export async function resendInvitation(
  id: string
): Promise<{ invitation: StaffInvitation; message: string }> {
  return apiRequest<{ invitation: StaffInvitation; message: string }>(
    `/v1/staff/invitations/${encodeURIComponent(id)}/resend`,
    { method: 'POST' }
  );
}

export async function revokeInvitation(id: string): Promise<void> {
  await apiRequest<void>(`/v1/staff/invitations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function verifyInvitation(token?: string, email?: string): Promise<StaffInvitation> {
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  if (email) params.set('email', email);
  const result = await apiRequest<{ invitation: StaffInvitation }>(
    `/auth/invitation?${params.toString()}`
  );
  return result.invitation;
}

export async function acceptInvitation(
  input: AcceptInvitationInput
): Promise<{ message: string; email: string; name: string }> {
  return apiRequest<{ message: string; email: string; name: string }>('/auth/accept-invite', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateStaff(id: string, input: UpdateStaffInput): Promise<Staff> {
  const result = await apiRequest<{ staff: Staff }>(`/v1/staff/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return result.staff;
}

export async function deleteStaff(id: string): Promise<void> {
  await apiRequest<void>(`/v1/staff/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function getStaffMember(id: string): Promise<Staff> {
  const result = await apiRequest<{ staff: Staff }>(`/v1/staff/${encodeURIComponent(id)}`);
  return result.staff;
}
