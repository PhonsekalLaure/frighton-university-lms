import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SaveBookInput } from '../models/book.js';
import { HttpError, ValidationError } from '../utils/httpError.js';

export const BOOK_COVER_BUCKET = 'book-covers';
interface StorageFailure { message: string; statusCode?: string | number }
function storageFailure(error: StorageFailure, action: 'upload' | 'download'): HttpError {
  if (/bucket.*not found|not found.*bucket/i.test(error.message)) {
    return new HttpError(503, 'Book image storage is not set up. Create the private book-covers bucket in Supabase.', { cause: error });
  }
  if (Number(error.statusCode) === 413) {
    return new ValidationError({ image: 'Choose an image up to 10 MB. The book-covers bucket must also allow files up to 10 MB.' });
  }
  if (action === 'download' && Number(error.statusCode) === 404) {
    return new HttpError(404, 'The book cover file was not found. Upload a replacement image.');
  }
  return new HttpError(503, action === 'upload'
    ? 'The book cover could not be uploaded. Please try again.'
    : 'The book cover is temporarily unavailable. Please try again.', { cause: error });
}

export function createBookCoverStorage(client: () => SupabaseClient) {
  return {
    async upload(bookId: string, image: NonNullable<SaveBookInput['image']>): Promise<string> {
      const extension = image.contentType === 'image/jpeg' ? 'jpg' : image.contentType === 'image/png' ? 'png' : 'webp';
      const path = bookId + '/' + randomUUID() + '.' + extension;
      const { error } = await client().storage.from(BOOK_COVER_BUCKET).upload(path, Buffer.from(image.data, 'base64'), {
        contentType: image.contentType, upsert: false,
      });
      if (error) throw storageFailure(error, 'upload');
      return path;
    },
    async download(path: string) {
      const { data, error } = await client().storage.from(BOOK_COVER_BUCKET).download(path);
      if (error) throw storageFailure(error, 'download');
      return { bytes: Buffer.from(await data.arrayBuffer()), contentType: data.type };
    },
    // Cleanup must not turn a successful book save into an apparent failure.
    async remove(path: string): Promise<void> {
      try {
        const { error } = await client().storage.from(BOOK_COVER_BUCKET).remove([path]);
        if (error) throw error;
      } catch {
        console.error('A superseded or unused book cover could not be removed from Storage.');
      }
    },
  };
}
