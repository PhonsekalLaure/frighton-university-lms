import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '../config/supabase.js';
import type { CatalogBook, SaveBookInput } from '../models/book.js';
import type { Pagination } from '../types/loan.js';
import { databaseError } from '../utils/databaseError.js';
import { HttpError, ValidationError } from '../utils/httpError.js';
import { createBookCoverStorage } from './bookCoverStorage.js';

type CatalogRow = Omit<CatalogBook, 'hasImage'> & { physical_available?: number };
type BookRow = Omit<CatalogRow, 'total'> & { cover_image_path: string | null };
const catalogFields = 'id,title,author,category,year,available,total,shelf,active,physical_available';
const bookFields =
  'id:books_id,title,author,category,year:publication_year,available:copies,shelf:shelf_location,active:is_active,cover_image_path';
const toBook = ({ cover_image_path, ...book }: BookRow, total: number): CatalogBook => ({
  ...book,
  category: book.category ?? '',
  shelf: book.shelf ?? '',
  total,
  hasImage: Boolean(cover_image_path),
});
function definiteWriteFailure(error: unknown): boolean {
  if (error instanceof HttpError && error.status < 500) return true;
  const cause = error instanceof Error ? (error.cause as { code?: string } | undefined) : undefined;
  return (
    typeof cause?.code === 'string' &&
    (/^(22|23|42)/.test(cause.code) || ['40001', '40P01', 'PGRST202', 'PGRST205'].includes(cause.code))
  );
}

export function createBookRepository(client: () => SupabaseClient = getSupabaseAdmin) {
  const covers = createBookCoverStorage(client);
  async function find(id: string): Promise<CatalogRow> {
    const { data, error } = await client()
      .from('catalog_books')
      .select(catalogFields)
      .eq('id', id)
      .maybeSingle<CatalogRow>();
    if (error) throw databaseError(error);
    if (!data) throw new HttpError(404, 'Book was not found.');
    return data;
  }
  async function coverPath(id: string): Promise<string | null> {
    const { data, error } = await client()
      .from('books')
      .select('cover_image_path')
      .eq('books_id', id)
      .maybeSingle<{ cover_image_path: string | null }>();
    if (error) throw databaseError(error);
    if (!data) throw new HttpError(404, 'Book was not found.');
    return data.cover_image_path;
  }
  return {
    async list({ page, pageSize }: Pagination) {
      const { data, error, count } = await client()
        .from('catalog_books')
        .select(catalogFields, { count: 'exact' })
        .order('title')
        .order('id')
        .range((page - 1) * pageSize, page * pageSize - 1)
        .returns<CatalogRow[]>();
      if (error) throw databaseError(error);
      const rows = data ?? [];
      const images = new Set<string>();
      if (rows.length) {
        const result = await client()
          .from('books')
          .select('books_id,cover_image_path')
          .in(
            'books_id',
            rows.map((book) => book.id),
          )
          .returns<Array<{ books_id: string; cover_image_path: string | null }>>();
        if (result.error) throw databaseError(result.error);
        for (const book of result.data ?? []) if (book.cover_image_path) images.add(book.books_id);
      }
      return {
        data: rows.map((book) => ({ ...book, hasImage: images.has(book.id) })),
        total: count ?? 0,
        page,
        pageSize,
      };
    },
    async hasImage(id: string): Promise<boolean> {
      return Boolean(await coverPath(id));
    },
    async image(id: string) {
      const path = await coverPath(id);
      if (!path) throw new HttpError(404, 'This book does not have a cover image.');
      return covers.download(path);
    },
    async save(id: string | null, input: SaveBookInput, actorId?: string): Promise<CatalogBook> {
      const current = id ? await find(id) : null;
      const checkedOut = current ? current.total - (current.physical_available ?? current.available) : 0;
      if (current && input.total < current.total - current.available) {
        throw new ValidationError({
          total: 'Total copies cannot be less than copies checked out or reserved.',
        });
      }
      const previousPath = id ? await coverPath(id) : null;
      if (!input.image && !previousPath)
        throw new ValidationError({ image: 'Upload a cover image for this book.' });
      const bookId = id ?? randomUUID();
      const uploadedPath = input.image ? await covers.upload(bookId, input.image) : null;
      const values = {
        title: input.title,
        author: input.author,
        category: input.category,
        publication_year: input.year,
        shelf_location: input.shelf,
        copies: input.total - checkedOut,
        ...(uploadedPath && { cover_image_path: uploadedPath }),
      };
      let saved: CatalogBook;
      try {
        if (!current) {
          const request = client().from('books').insert({ ...values, books_id: bookId }).retry(false);
          if (actorId) request.setHeader('x-lms-actor-id', actorId);
          const { data, error } = await request.select(bookFields).single<BookRow>();
          if (error) throw databaseError(error);
          saved = toBook(data, input.total);
        } else {
          // Reject a changed stock snapshot or simultaneous cover replacement.
          let query = client()
            .from('books')
            .update(values)
            .retry(false)
            .eq('books_id', bookId)
            .eq('copies', current.physical_available ?? current.available);
          if (uploadedPath)
            query = previousPath
              ? query.eq('cover_image_path', previousPath)
              : query.is('cover_image_path', null);
          if (actorId) query.setHeader('x-lms-actor-id', actorId);
          const { data, error } = await query.select(bookFields).maybeSingle<BookRow>();
          if (error) throw databaseError(error);
          if (!data)
            throw new HttpError(409, 'The book changed while saving. Refresh the catalog and try again.');
          const allocated = (current.physical_available ?? current.available) - current.available;
          saved = { ...toBook(data, input.total), available: data.available - allocated };
        }
      } catch (error) {
        if (!definiteWriteFailure(error)) {
          // A lost response is not proof of rollback. The uploaded object may
          // already be the committed cover, so retain it for reconciliation.
          console.error('Book save outcome requires review', { bookId });
          throw new HttpError(
            503,
            'The book save could not be confirmed. Reload the catalog before trying again.',
            { cause: error },
          );
        }
        if (uploadedPath) await covers.remove(uploadedPath);
        throw error;
      }
      if (current) {
        // A failed display refresh cannot delete a cover already committed to the book.
        try {
          saved = { ...saved, available: (await find(bookId)).available };
        } catch {
          /* Return the confirmed save. */
        }
      }
      if (uploadedPath && previousPath) await covers.remove(previousPath);
      return saved;
    },
    async archive(id: string, actorId?: string): Promise<CatalogBook> {
      const request = client().from('books').update({ is_active: false }).eq('books_id', id);
      if (actorId) request.setHeader('x-lms-actor-id', actorId);
      const { data, error } = await request.select(bookFields).maybeSingle<BookRow>();
      if (error) throw databaseError(error);
      if (!data) throw new HttpError(404, 'Book was not found.');
      return toBook(data, (await find(id)).total);
    },
  };
}

export const bookRepository = createBookRepository();
