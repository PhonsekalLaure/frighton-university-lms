import { config } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';
import type { DebtSnapshot } from './libraryService.js';
export interface SISStudentStatus {
  studentNumber: string;
  name: string;
  email: string;
  role: string;
  academicStatus: string;
  department: string;
  canBorrow: boolean;
  activeHolds: unknown[];
}
async function request(path: string, method = 'GET', body?: unknown) {
  if (!config.sis.apiKey) throw new HttpError(503, 'SIS integration is not configured.');
  try {
    const response = await fetch(config.sis.apiUrl + path, {
      method,
      signal: AbortSignal.timeout(5000),
      headers: { 'x-lms-api-key': config.sis.apiKey, 'Content-Type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error('SIS request failed.');
    return await response.json();
  } catch {
    throw new HttpError(503, 'SIS is temporarily unavailable. Please try again.');
  }
}
export const sisService = {
  async checkStudentStatus(number: string): Promise<SISStudentStatus> {
    const result = await request('/api/v1/integration/students/' + encodeURIComponent(number) + '/status');
    if (
      !result ||
      result.studentNumber !== number ||
      typeof result.canBorrow !== 'boolean' ||
      !Array.isArray(result.activeHolds)
    )
      throw new HttpError(503, 'SIS returned an invalid eligibility response.');
    return result;
  },
  placeHold(number: string, _reason: string, _amount?: number) {
    return request('/api/v1/integration/holds', 'POST', { studentNumber: number });
  },
  resolveHold(id: string) {
    return request('/api/v1/integration/holds/' + encodeURIComponent(id) + '/resolve', 'POST', {});
  },
  async syncDebt(snapshot: DebtSnapshot) {
    const result = await request(
      '/api/v1/integration/library-debt/' + encodeURIComponent(snapshot.studentNumber),
      'PUT',
      snapshot,
    );
    if (
      !result ||
      typeof result.applied !== 'boolean' ||
      !Number.isSafeInteger(result.version) ||
      result.version < snapshot.version
    )
      throw new HttpError(503, 'SIS did not confirm library debt synchronization.');
    return result;
  },
};
