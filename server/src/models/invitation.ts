export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface StaffInvitation {
  id: string;
  email: string;
  token: string;
  role: 'Librarian' | 'Admin';
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  invitedBy?: string | null;
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string | null;
  status: InvitationStatus;
  inviteLink?: string;
}

export interface CreateInvitationInput {
  email: string;
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
}

export interface AcceptInvitationInput {
  token: string;
  email?: string;
  password: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
}

