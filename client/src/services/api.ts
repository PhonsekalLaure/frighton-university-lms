export class ApiError extends Error {
  readonly status: number;
  readonly fields: Record<string, string>;
  constructor(status: number, message: string, fields: Record<string, string> = {}) { super(message); this.status = status; this.fields = fields; }
}

export const apiBase = (import.meta.env?.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
let refreshing: Promise<void> | null = null;

async function send(path: string, options: RequestInit): Promise<Response> {
  return fetch(apiBase + path, {
    credentials: 'include', cache: 'no-store', ...options,
    headers: { ...(options.body !== undefined && { 'Content-Type': 'application/json' }), ...options.headers },
  });
}

async function failure(response: Response): Promise<ApiError> {
  const body = await response.json().catch(() => ({}));
  return new ApiError(response.status, typeof body.error === 'string' ? body.error : 'Unable to complete the request.', body.fields && typeof body.fields === 'object' ? body.fields : {});
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response = await send(path, options);
  if (response.status === 401 && !path.startsWith('/auth/')) {
    if (!refreshing) {
      refreshing = send('/auth/refresh', { method: 'POST', body: '{}' }).then(async (result) => {
        if (!result.ok) {
          if ((result.status === 401 || result.status === 403) && typeof window !== 'undefined') {
            window.dispatchEvent(new Event('lms:session-expired'));
          }
          throw await failure(result);
        }
      }).finally(() => { refreshing = null; });
    }
    await refreshing;
    if (options.signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
    response = await send(path, options);
  }
  if (!response.ok) throw await failure(response);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export interface PageResult<T> { data: T[]; total: number; page: number; pageSize: number }

export async function getAllPages<T>(path: string, signal?: AbortSignal): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 1; ; page++) {
    const separator = path.includes('?') ? '&' : '?';
    const result = await apiRequest<PageResult<T>>(`${path}${separator}page=${page}&pageSize=100`, { signal });
    rows.push(...result.data);
    if (rows.length >= result.total) return rows;
    if (result.data.length === 0) throw new ApiError(503, 'Records changed while loading. Please refresh.');
  }
}
