import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { LibraryService } from '../services/libraryService.js';
import { parseStudentNumber, parseUuid } from '../validators/loanValidators.js';
import { HttpError } from '../utils/httpError.js';
function text(value: unknown, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new HttpError(400, 'A valid reason or payment reference is required.');
  return value.trim();
}
export function createChargeRouter(service = new LibraryService()) {
  const r = Router();
  r.get(
    '/',
    asyncHandler(async (req, res) => {
      res.json(await service.charges(parseStudentNumber(req.query.studentNumber)));
    }),
  );
  r.post(
    '/',
    asyncHandler(async (req, res) => {
      const b = req.body;
      if (
        !b ||
        typeof b.amount !== 'number' ||
        !Number.isFinite(b.amount) ||
        b.amount <= 0 ||
        b.amount > 9999999999.99 ||
        Math.abs(b.amount * 100 - Math.round(b.amount * 100)) > 0.0001
      )
        throw new HttpError(400, 'Enter a positive PHP amount with at most two decimal places.');
      res
        .status(201)
        .json(
          await service.assess(
            parseStudentNumber(b.studentNumber),
            text(b.reason, 500),
            b.amount,
            b.loanId ? parseUuid(b.loanId, 'loanId') : null,
            res.locals.librarian.id,
          ),
        );
    }),
  );
  r.post(
    '/:id/settle',
    asyncHandler(async (req, res) => {
      res.json(
        await service.settle(
          parseUuid(req.params.id, 'chargeId'),
          text(req.body?.reference, 200),
          res.locals.librarian.id,
        ),
      );
    }),
  );
  return r;
}
