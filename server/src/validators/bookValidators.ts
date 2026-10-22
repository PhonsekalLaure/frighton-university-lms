import type { SaveBookInput } from '../models/book.js';
import { HttpError } from '../utils/httpError.js';

function text(value: unknown, name: string, limit: number, required = false): string {
  if (typeof value !== 'string' || value.trim().length > limit || (required && !value.trim())) {
    throw new HttpError(400, `${name} must be ${required ? 'a non-empty string' : 'a string'} of up to ${limit} characters.`);
  }
  return value.trim();
}

export function parseBookBody(value: unknown): SaveBookInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'A book object is required.');
  const input = value as Record<string, unknown>;
  if (typeof input.total !== 'number' || !Number.isSafeInteger(input.total) || input.total < 0 || input.total > 1000000) {
    throw new HttpError(400, 'Total copies must be an integer between 0 and 1000000.');
  }
  const year = input.year ?? null;
  if (year !== null && (typeof year !== 'number' || !Number.isInteger(year) || year < 1 || year > 9999)) {
    throw new HttpError(400, 'Publication year must be between 1 and 9999, or empty.');
  }
  return {
    title: text(input.title, 'Title', 500, true),
    author: text(input.author, 'Author', 500, true),
    category: text(input.category ?? '', 'Category', 200),
    year, total: input.total, shelf: text(input.shelf ?? '', 'Shelf location', 200),
  };
}
