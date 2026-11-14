export interface UpdateProfileInput {
  firstName: string;
  middleName: string | null;
  lastName: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}
