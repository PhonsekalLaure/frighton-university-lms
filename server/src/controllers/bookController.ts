import { asyncHandler } from '../middlewares/asyncHandler.js';
import { BookService } from '../services/bookService.js';
import { parseBookBody } from '../validators/bookValidators.js';
import { parsePagination, parseUuid } from '../validators/loanValidators.js';

export function createBookController(service = new BookService()) {
  return {
    list: asyncHandler(async (req, res) => { res.json(await service.list(parsePagination(req.query))); }),
    create: asyncHandler(async (req, res) => { res.status(201).json(await service.create(parseBookBody(req.body))); }),
    update: asyncHandler(async (req, res) => { res.json(await service.update(parseUuid(req.params.id, 'bookId'), parseBookBody(req.body))); }),
    archive: asyncHandler(async (req, res) => { res.json(await service.archive(parseUuid(req.params.id, 'bookId'))); }),
  };
}
