import { getSupabaseAdmin } from '../config/supabase.js';
import type { CatalogBook, SaveBookInput } from '../models/book.js';
import type { Pagination } from '../types/loan.js';
import { databaseError } from '../utils/databaseError.js';

export const bookRepository = {
  async list({ page, pageSize }: Pagination) {
    const { data, error, count } = await getSupabaseAdmin().from('catalog_books')
      .select('id,title,author,category,year,available,total,shelf,active', { count: 'exact' })
      .order('title').order('id').range((page - 1) * pageSize, page * pageSize - 1)
      .returns<CatalogBook[]>();
    if (error) throw databaseError(error);
    return { data: data ?? [], total: count ?? 0, page, pageSize };
  },
  async save(id: string | null, input: SaveBookInput): Promise<CatalogBook> {
    const { data, error } = await getSupabaseAdmin().rpc('save_catalog_book', {
      p_book_id: id, p_title: input.title, p_author: input.author, p_category: input.category,
      p_publication_year: input.year, p_total_copies: input.total, p_shelf_location: input.shelf,
    }).single<CatalogBook>();
    if (error) throw databaseError(error);
    return data;
  },
  async archive(id: string): Promise<CatalogBook> {
    const { data, error } = await getSupabaseAdmin().rpc('archive_catalog_book', { p_book_id: id }).single<CatalogBook>();
    if (error) throw databaseError(error);
    return data;
  },
};
