import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { auditActions, type AuditFilters } from '../models/audit.js';
import { listAuditEvents } from '../repositories/auditRepository.js';
import { HttpError } from '../utils/httpError.js';
import { parsePagination } from '../validators/loanValidators.js';

export function parseAuditFilters(query: Record<string, unknown>): AuditFilters {
  const filters: AuditFilters = parsePagination(query);
  if (query.action !== undefined && query.action !== '') {
    if (typeof query.action !== 'string' || !(auditActions as readonly string[]).includes(query.action)) throw new HttpError(400, 'Choose a valid audit action.');
    filters.action = query.action;
  }
  if (query.q !== undefined) {
    if (typeof query.q !== 'string' || query.q.length > 100) throw new HttpError(400, 'Search must be at most 100 characters.');
    if (query.q.trim()) filters.query = query.q.trim();
  }
  for (const name of ['from', 'to'] as const) {
    const value = query[name];
    if (value === undefined || value === '') continue;
    if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)
      || !Number.isFinite(Date.parse(value + 'T00:00:00Z')) || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) {
      throw new HttpError(400, 'Choose a valid date range.');
    }
    filters[name] = value;
  }
  if (filters.from && filters.to && filters.from > filters.to) throw new HttpError(400, 'The start date must be before the end date.');
  return filters;
}

export function createAuditRouter(list = listAuditEvents) {
  const router = Router();
  router.use((_req, res, next) => {
    if (!res.locals.librarian) return next(new HttpError(401, 'Please sign in with your librarian account.'));
    if (res.locals.librarian.role !== 'admin') return next(new HttpError(403, 'Administrator access is required.'));
    next();
  });
  router.get('/', asyncHandler(async (req, res) => { res.json(await list(parseAuditFilters(req.query))); }));
  return router;
}
