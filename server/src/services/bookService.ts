import { bookRepository } from '../repositories/bookRepository.js';
import type { SaveBookInput } from '../models/book.js';
import { ValidationError } from '../utils/httpError.js';
import type { Pagination } from '../types/loan.js';

export class BookService {
  constructor(private readonly repository = bookRepository) {}
  list(pagination: Pagination) { return this.repository.list(pagination); }
  image(id: string) { return this.repository.image(id); }
  create(input: SaveBookInput) {
    if (!input.image) throw new ValidationError({ image: 'Upload a cover image for this book.' });
    return this.repository.save(null, input);
  }
  async update(id: string, input: SaveBookInput) {
    if (!input.image && !(await this.repository.hasImage(id))) {
      throw new ValidationError({ image: 'Upload a cover image for this book.' });
    }
    return this.repository.save(id, input);
  }
  archive(id: string) { return this.repository.archive(id); }
}
