import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '../config/supabase.js';
import type { CatalogBook, SaveBookInput } from '../models/book.js';
import type { Pagination } from '../types/loan.js';
import { databaseError } from '../utils/databaseError.js';
import { HttpError, ValidationError } from '../utils/httpError.js';
import { createBookCoverStorage } from './bookCoverStorage.js';

type CatalogRow = Omit<CatalogBook, 'hasImage'>;
type BookRow = Omit<CatalogRow, 'total'> & { cover_image_path: string | null };
const catalogFields = 'id,title,author,category,year,available,total,shelf,active';
const bookFields = 'id:books_id,title,author,category,year:publication_year,available:copies,shelf:shelf_location,active:is_active,cover_image_path';
const toBook = ({ cover_image_path, ...book }: BookRow, total: number): CatalogBook => ({
  ...book, category: book.category ?? '', shelf: book.shelf ?? '', total, hasImage: Boolean(cover_image_path),
});

export function createBookRepository(client: () => SupabaseClient = getSupabaseAdmin) {
  const covers = createBookCoverStorage(client);
  async function find(id: string): Promise<CatalogRow> {
    const { data, error } = await client().from('catalog_books').select(catalogFields).eq('id', id).maybeSingle<CatalogRow>();
    if (error) throw databaseError(error);
    if (!data) throw new HttpError(404, 'Book was not found.');
    return data;
  }
  async function coverPath(id: string): Promise<string | null> {
    const { data, error } = await client().from('books').select('cover_image_path').eq('books_id', id)
      .maybeSingle<{ cover_image_path: string | null }>();
    if (error) throw databaseError(error);
    if (!data) throw new HttpError(404, 'Book was not found.');
    return data.cover_image_path;
  }
  return {
    async list({ page, pageSize }: Pagination) {
      const { data, error, count } = await client().from('catalog_books')
        .select(catalogFields, { count: 'exact' })
        .order('title').order('id').range((page - 1) * pageSize, page * pageSize - 1)
        .returns<CatalogRow[]>();
      if (error) throw databaseError(error);
      const rows = data ?? [];
      const images = new Set<string>();
      if (rows.length) {
        const result = await client().from('books').select('books_id,cover_image_path').in('books_id', rows.map(book => book.id))
          .returns<Array<{ books_id: string; cover_image_path: string | null }>>();
        if (result.error) throw databaseError(result.error);
        for (const book of result.data ?? []) if (book.cover_image_path) images.add(book.books_id);
      }
      return { data: rows.map(book => ({ ...book, hasImage: images.has(book.id) })), total: count ?? 0, page, pageSize };
    },
    async hasImage(id: string): Promise<boolean> { return Boolean(await coverPath(id)); },
    async image(id: string) {
      const path = await coverPath(id);
      if (!path) throw new HttpError(404, 'This book does not have a cover image.');
      return covers.download(path);
    },
    async save(id: string | null, input: SaveBookInput): Promise<CatalogBook> {
      const current = id ? await find(id) : null;
      const checkedOut = current ? current.total - current.available : 0;
      if (input.total < checkedOut) {
        throw new ValidationError({ total: 'Total copies cannot be less than the ' + checkedOut + ' copies currently checked out.' });
      }
      const previousPath = id ? await coverPath(id) : null;
      if (!input.image && !previousPath) throw new ValidationError({ image: 'Upload a cover image for this book.' });
      const bookId = id ?? randomUUID();
      const uploadedPath = input.image ? await covers.upload(bookId, input.image) : null;
      const values = {
        title: input.title, author: input.author, category: input.category,
        publication_year: input.year, shelf_location: input.shelf,
        copies: input.total - checkedOut,
        ...(uploadedPath && { cover_image_path: uploadedPath }),
      };
      let saved: CatalogBook;
      try {
        if (!current) {
          const { data, error } = await client().from('books').insert({ ...values, books_id: bookId }).select(bookFields).single<BookRow>();
          if (error) throw databaseError(error);
          saved = toBook(data, input.total);
        } else {
          // Reject a changed stock snapshot or simultaneous cover replacement.
          let query = client().from('books').update(values).eq('books_id', bookId).eq('copies', current.available);
          if (uploadedPath) query = previousPath ? query.eq('cover_image_path', previousPath) : query.is('cover_image_path', null);
          const { data, error } = await query.select(bookFields).maybeSingle<BookRow>();
          if (error) throw databaseError(error);
          if (!data) throw new HttpError(409, 'The book changed while saving. Refresh the catalog and try again.');
          saved = toBook(data, input.total);
        }
      } catch (error) {
        if (uploadedPath) await covers.remove(uploadedPath);
        throw error;
      }
      if (uploadedPath && previousPath) await covers.remove(previousPath);
      return saved;
    },
    async archive(id: string): Promise<CatalogBook> {
      const { data, error } = await client().from('books').update({ is_active: false }).eq('books_id', id)
        .select(bookFields).maybeSingle<BookRow>();
      if (error) throw databaseError(error);
      if (!data) throw new HttpError(404, 'Book was not found.');
      return toBook(data, (await find(id)).total);
    },
  };
}

export const bookRepository = createBookRepository();
