import type { StudentRecord } from '../types/library';

export const students: Record<string, StudentRecord> = {
  'STU-2026-0001': { name: 'Maya Chen', major: 'BA Communication  -  Year 2', status: 'Good standing' },
  'STU-2026-0002': { name: 'Elias Navarro', major: 'BS Computer Science  -  Year 3', status: 'Good standing' },
  'STU-2026-0003': { name: 'Sofia Reyes', major: 'BA History  -  Year 1', status: 'Good standing' },
  'STU-2026-0004': { name: 'Noah Santiago', major: 'BS Environmental Science  -  Year 4', status: 'Review overdue items' },
};
