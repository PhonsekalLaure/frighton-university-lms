import type { SaveBookInput } from '../models/book.js';
import { HttpError, ValidationError } from '../utils/httpError.js';

export const MAX_COVER_BYTES = 10 * 1024 * 1024;
export function parseBookImage(value: unknown): { data: string; contentType: string } {
  const invalid = () => new ValidationError({ image: 'Choose a valid JPEG, PNG, or WebP image, up to 10 MB.' });
  if (typeof value !== 'string' || value.length > Math.ceil(MAX_COVER_BYTES / 3) * 4 + 40) throw invalid();
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw invalid();
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > MAX_COVER_BYTES || bytes.toString('base64') !== match[2]) throw invalid();
  const valid = match[1] === 'image/png'
    ? bytes.length >= 45 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) && bytes.toString('ascii', 12, 16) === 'IHDR' && bytes.subarray(-12).equals(Buffer.from('0000000049454e44ae426082', 'hex'))
    : match[1] === 'image/jpeg'
      ? bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217
      : bytes.length >= 20 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' && bytes.readUInt32LE(4) === bytes.length - 8 && ['VP8 ', 'VP8L', 'VP8X'].includes(bytes.toString('ascii', 12, 16));
  if (!valid) throw invalid();
  return { data: match[2], contentType: match[1] };
}

export function parseBookBody(value: unknown, requireImage = true): SaveBookInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'Enter the book details before saving.');
  const input = value as Record<string, unknown>;
  const fields: Record<string, string> = {};
  function text(key: string, label: string, limit: number, required = false): string {
    const value = input[key] ?? (required ? undefined : '');
    if (typeof value !== 'string') { fields[key] = 'Enter ' + label.toLowerCase() + ' as text.'; return ''; }
    const trimmed = value.trim();
    if (required && !trimmed) fields[key] = 'Enter the ' + label.toLowerCase() + '.';
    else if (trimmed.length > limit) fields[key] = label + ' must be ' + limit + ' characters or fewer.';
    return trimmed;
  }
  const title = text('title', 'Book title', 500, true);
  const author = text('author', 'Author', 500, true);
  const category = text('category', 'Category', 200, true);
  const shelf = text('shelf', 'Shelf location', 200, true);
  if (typeof input.total !== 'number' || !Number.isSafeInteger(input.total) || input.total < 0 || input.total > 1000000) fields.total = 'Enter total copies as a whole number from 0 to 1,000,000.';
  const year = input.year;
  if (typeof year !== 'number' || !Number.isInteger(year) || year < 1 || year > 9999) fields.year = 'Enter a publication year as a whole number from 1 to 9999.';
  let image: SaveBookInput['image'];
  if (input.image === null || (requireImage && input.image === undefined)) {
    fields.image = 'Upload a cover image for this book.';
  } else if (input.image !== undefined) {
    try { image = parseBookImage(input.image); }
    catch (error) { if (!(error instanceof ValidationError)) throw error; Object.assign(fields, error.fields); }
  }
  if (Object.keys(fields).length) throw new ValidationError(fields);
  return { title, author, category, shelf, year: year as number, total: input.total as number,
    ...(image !== undefined && { image }) };
}
