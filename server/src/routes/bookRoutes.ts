import { Router, Request, Response, NextFunction } from 'express';
import { getSupabaseAdmin } from '../config/supabase.js';

export const bookRouter = Router();

// Mock books fallback when DB is not yet connected
const mockBooks = [
  { id: '1', isbn: '978-0143105954', title: 'Frankenstein; or, The Modern Prometheus', author: 'Mary Shelley', category: 'Gothic Literature', availableCopies: 4, totalCopies: 5 },
  { id: '2', isbn: '978-0486272788', title: 'Dracula (Unabridged)', author: 'Bram Stoker', category: 'Classic Horror', availableCopies: 2, totalCopies: 4 },
  { id: '3', isbn: '978-0262033848', title: 'Introduction to Algorithms (4th Ed.)', author: 'Cormen, Leiserson, Rivest, Stein', category: 'Computer Science', availableCopies: 6, totalCopies: 8 },
  { id: '4', isbn: '978-0062059888', title: 'Grimoire of Frighton Valley (Restricted Archive)', author: 'Archivist M. Blackwood', category: 'Rare Manuscripts', availableCopies: 1, totalCopies: 1 },
];

bookRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const supabase = getSupabaseAdmin();
    const { data: books, error } = await supabase.from('books').select('*');
    if (error || !books || books.length === 0) {
      // Fallback to mock catalog
      res.json(mockBooks);
      return;
    }
    res.json(books);
  } catch (err) {
    next(err);
  }
});
