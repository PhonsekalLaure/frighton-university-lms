import type { BookRecord } from '../types/library';
import { books as bookCatalog } from './books';

export const initialBooks: BookRecord[] = bookCatalog.map((book) => ({
  id: book.id,
  title: book.title,
  author: book.author,
  category: book.category,
  year: book.year,
  available: book.copies,
  total: book.totalCopies,
  shelf: book.shelf,
  active: true,
}));
