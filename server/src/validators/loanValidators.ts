import type { BorrowInput, LoanFilters, Pagination, ReportOverdueInput, ReturnInput } from '../types/loan.js';
import { HttpError } from '../utils/httpError.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'Request body must be a JSON object.');
  }
  return value as Record<string, unknown>;
}

export function parseStudentNumber(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{0,49}$/i.test(value.trim())) {
    throw new HttpError(400, 'Enter a valid student ID of up to 50 letters, digits, or hyphens.');
  }
  return value.trim().toUpperCase();
}

export function parseUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !uuidPattern.test(value)) {
    throw new HttpError(400, `${field} must be a valid UUID.`);
  }
  return value.toLowerCase();
}

function positiveInteger(value: unknown, fallback: number, maximum: number, field: string): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) {
    throw new HttpError(400, `${field} must be a positive integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    throw new HttpError(400, `${field} must be at most ${maximum}.`);
  }
  return parsed;
}

export function parsePagination(query: Record<string, unknown>): Pagination {
  return {
    page: positiveInteger(query.page, 1, 100000, 'page'),
    pageSize: positiveInteger(query.pageSize, 25, 100, 'pageSize'),
  };
}

export function parseLoanFilters(query: Record<string, unknown>): LoanFilters {
  const status = query.status ?? 'active';
  if (status !== 'active' && status !== 'returned' && status !== 'all') {
    throw new HttpError(400, 'status must be active, returned, or all.');
  }
  return {
    ...parsePagination(query),
    status,
    ...(query.frightonId !== undefined && { studentNumber: parseStudentNumber(query.frightonId) }),
    ...(query.bookId !== undefined && { bookId: parseUuid(query.bookId, 'bookId') }),
  };
}

export function parseBorrowBody(body: unknown): BorrowInput {
  const input = object(body);
  return {
    frightonId: parseStudentNumber(input.frightonId),
    bookId: parseUuid(input.bookId, 'bookId'),
  };
}

export function parseReturnBody(body: unknown): ReturnInput {
  const input = object(body);
  if (input.fineCollected !== undefined && typeof input.fineCollected !== 'boolean') {
    throw new HttpError(400, 'fineCollected must be a boolean.');
  }
  return { fineCollected: input.fineCollected === true };
}

export function parseReportOverdueBody(body: unknown): ReportOverdueInput {
  const input = object(body);
  if (typeof input.bookTitle !== 'string' || !input.bookTitle.trim() || input.bookTitle.length > 500) {
    throw new HttpError(400, 'A book title of up to 500 characters is required.');
  }
  const fineAmount = input.fineAmount ?? 25;
  if (typeof fineAmount !== 'number' || !Number.isFinite(fineAmount) || fineAmount < 0) {
    throw new HttpError(400, 'fineAmount must be a non-negative number.');
  }
  return { frightonId: parseStudentNumber(input.frightonId), bookTitle: input.bookTitle.trim(), fineAmount };
}
