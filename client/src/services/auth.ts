import { ApiError, apiRequest } from './api';
export { ApiError } from './api';

export interface Librarian {
  id: string;
  email: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  fullName: string;
  role: 'librarian' | 'admin';
}
interface AuthResponse { librarian: Librarian }
let refreshRequest: Promise<AuthResponse> | null = null;

export async function signIn(email: string, password: string, remember: boolean): Promise<Librarian> {
  const data = await apiRequest<AuthResponse>('/auth/login', {
    method: 'POST', body: JSON.stringify({ email, password, remember }),
  });
  return data.librarian;
}
export async function getSession(): Promise<Librarian> {
  try {
    return (await apiRequest<AuthResponse>('/auth/me')).librarian;
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    if (!refreshRequest) {
      refreshRequest = apiRequest<AuthResponse>('/auth/refresh', { method: 'POST', body: '{}' })
        .finally(() => { refreshRequest = null; });
    }
    return (await refreshRequest).librarian;
  }
}
export async function signOut(): Promise<void> {
  await apiRequest<void>('/auth/logout', { method: 'POST', body: '{}' });
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiRequest<void>('/auth/change-password', {
    method: 'POST', body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export async function updateMyProfile(firstName: string, middleName: string, lastName: string): Promise<Librarian> {
  const data = await apiRequest<{ librarian: Librarian }>('/auth/profile', {
    method: 'PATCH',
    body: JSON.stringify({ firstName, middleName: middleName || null, lastName }),
  });
  return data.librarian;
}
