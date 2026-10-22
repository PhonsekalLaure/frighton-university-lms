import { bookRepository } from '../repositories/bookRepository.js';
import type { SaveBookInput } from '../models/book.js';
import type { Pagination } from '../types/loan.js';

export class BookService {
  constructor(private readonly repository = bookRepository) {}
  list(pagination: Pagination) { return this.repository.list(pagination); }
  create(input: SaveBookInput) { return this.repository.save(null, input); }
  update(id: string, input: SaveBookInput) { return this.repository.save(id, input); }
  archive(id: string) { return this.repository.archive(id); }
}
