export interface Librarian {
  id: string;
  email: string;
  fullName: string;
  role: 'librarian';
}

interface AuthResponse {
  librarian: Librarian;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const apiBase = (import.meta.env?.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
let refreshRequest: Promise<AuthResponse> | null = null;

async function request(path: string, body?: unknown): Promise<AuthResponse | undefined> {
  const response = await fetch(apiBase + '/auth' + path, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'include',
    cache: 'no-store',
    ...(body !== undefined && {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  });
  if (response.status === 204) return undefined;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(response.status, data.error || 'Unable to complete the request. Please try again.');
  }
  return data as AuthResponse;
}

export async function signIn(email: string, password: string, remember: boolean): Promise<Librarian> {
  const data = await request('/login', { email, password, remember });
  return data!.librarian;
}

export async function getSession(): Promise<Librarian> {
  try {
    const data = await request('/me');
    return data!.librarian;
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    // Share refreshes across simultaneous checks, including React StrictMode.
    if (!refreshRequest) {
      refreshRequest = request('/refresh', {}).then((data) => data!).finally(() => { refreshRequest = null; });
    }
    return (await refreshRequest).librarian;
  }
}

export async function signOut(): Promise<void> {
  await request('/logout', {});
}
