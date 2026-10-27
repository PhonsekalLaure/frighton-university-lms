import { asyncHandler } from '../middlewares/asyncHandler.js';
import { BookService } from '../services/bookService.js';
import { parseBookBody } from '../validators/bookValidators.js';
import { parsePagination, parseUuid } from '../validators/loanValidators.js';

export function createBookController(service = new BookService()) {
  return {
    list: asyncHandler(async (req, res) => { res.json(await service.list(parsePagination(req.query))); }),
    image: asyncHandler(async (req, res) => {
      const image = await service.image(parseUuid(req.params.id, 'Book ID'));
      res.set('Cache-Control', 'no-store').type(image.contentType).send(image.bytes);
    }),
    create: asyncHandler(async (req, res) => { res.status(201).json(await service.create(parseBookBody(req.body))); }),
    update: asyncHandler(async (req, res) => { res.json(await service.update(parseUuid(req.params.id, 'bookId'), parseBookBody(req.body, false))); }),
    archive: asyncHandler(async (req, res) => { res.json(await service.archive(parseUuid(req.params.id, 'bookId'))); }),
  };
}
