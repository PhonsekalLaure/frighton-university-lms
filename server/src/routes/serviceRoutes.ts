import { Router, type RequestHandler } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { config } from '../config/env.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { LibraryService } from '../services/libraryService.js';
import { HttpError } from '../utils/httpError.js';
import { parsePagination, parseStudentNumber, parseUuid } from '../validators/loanValidators.js';

export const requireService: RequestHandler = (req, res, next) => {
  const supplied = Buffer.from(req.get('x-sis-api-key') ?? '');
  const expected = Buffer.from(config.service.apiKey);
  if (
    !expected.length ||
    config.service.apiKey === config.sis.apiKey ||
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    res.status(401).json({ error: 'Invalid or missing service credential.', code: 'UNAUTHORIZED' });
    return;
  }
  if (req.get('origin')) {
    res.status(403).json({ error: 'Server-to-server access required.', code: 'FORBIDDEN' });
    return;
  }
  next();
};
export function createServiceRouter(service = new LibraryService()) {
  const r = Router();
  r.use(requireService);
  r.get(
    '/books',
    asyncHandler(async (req, res) => {
      const q = req.query.q ?? '';
      if (typeof q !== 'string' || q.length > 100 || /[,()"\x00-\x1f]/.test(q))
        throw new HttpError(
          400,
          'Search must contain up to 100 characters without commas, quotes, or parentheses.',
        );
      const { page, pageSize } = parsePagination(req.query);
      res.json(await service.books(q.trim(), page, pageSize));
    }),
  );
  r.get(
    '/books/:id/cover',
    asyncHandler(async (req, res) => {
      const result = await service.image(parseUuid(req.params.id, 'bookId'));
      res.type(result.contentType).send(result.bytes);
    }),
  );
  r.get(
    '/students/:number/account',
    asyncHandler(async (req, res) => {
      res.json(await service.account(parseStudentNumber(req.params.number)));
    }),
  );
  r.get(
    '/students/:number/debt',
    asyncHandler(async (req, res) => {
      res.json(await service.debt(parseStudentNumber(req.params.number)));
    }),
  );
  r.post(
    '/reservations',
    asyncHandler(async (req, res) => {
      if (!req.body || Object.keys(req.body).some((k) => !['studentNumber', 'bookId'].includes(k)))
        throw new HttpError(400, 'Only studentNumber and bookId are accepted.');
      res
        .status(201)
        .json(
          await service.reserve(
            parseStudentNumber(req.body.studentNumber),
            parseUuid(req.body.bookId, 'bookId'),
          ),
        );
    }),
  );
  r.delete(
    '/reservations/:id',
    asyncHandler(async (req, res) => {
      if (!req.body || Object.keys(req.body).some((k) => k !== 'studentNumber'))
        throw new HttpError(400, 'Only studentNumber is accepted.');
      await service.cancel(
        parseStudentNumber(req.body.studentNumber),
        parseUuid(req.params.id, 'reservationId'),
      );
      res.status(204).end();
    }),
  );
  return r;
}
