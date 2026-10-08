import { config } from '../config/env.js';

export interface SISStudentStatus {
  frightonId: string;
  name: string;
  email: string;
  role: string;
  academicStatus: string;
  department: string;
  canBorrow: boolean;
  activeHolds: any[];
}

export const sisService = {
  /**
   * Queries the Frighton University SIS to verify if student is active & eligible to borrow
   */
  async checkStudentStatus(frightonId: string): Promise<SISStudentStatus> {
    const url = `${config.sis.apiUrl}/api/v1/integration/students/${frightonId}/status`;
    const response = await fetch(url, {
      headers: {
        'x-lms-api-key': config.sis.apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'SIS Service Request Failed' }));
      throw new Error(err.error || `SIS returned status ${response.status}`);
    }

    return response.json() as Promise<SISStudentStatus>;
  },

  /**
   * Places an academic hold in SIS when student materials are overdue or damaged
   */
  async placeHold(frightonId: string, reason: string, amount?: number) {
    const url = `${config.sis.apiUrl}/api/v1/integration/holds`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-lms-api-key': config.sis.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ frightonId, reason, amount }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Failed to place hold in SIS' }));
      throw new Error(err.error || 'Failed to place hold in SIS');
    }

    return response.json();
  },

  /**
   * Resolves a previously placed academic hold in SIS
   */
  async resolveHold(holdId: string) {
    const url = `${config.sis.apiUrl}/api/v1/integration/holds/${holdId}/resolve`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-lms-api-key': config.sis.apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Failed to resolve hold in SIS' }));
      throw new Error(err.error || 'Failed to resolve hold in SIS');
    }

    return response.json();
  },
};
