import { asyncHandler } from '../middlewares/asyncHandler.js';
import { LoanService } from '../services/loanService.js';
import { parseBorrowBody, parseLoanFilters, parsePagination, parseReportOverdueBody, parseReturnBody, parseStudentNumber, parseUuid } from '../validators/loanValidators.js';

export function createLoanController(service = new LoanService()) {
  return {
    policy: asyncHandler(async (_req, res) => {
      res.json(await service.getPolicy());
    }),
    verifyPatron: asyncHandler(async (req, res) => {
      res.json(await service.verifyPatron(parseStudentNumber(req.params.frightonId)));
    }),
    availableBooks: asyncHandler(async (req, res) => {
      res.json(await service.listAvailableBooks(parsePagination(req.query)));
    }),
    list: asyncHandler(async (req, res) => {
      res.json(await service.listLoans(parseLoanFilters(req.query)));
    }),
    detail: asyncHandler(async (req, res) => {
      res.json(await service.getLoan(parseUuid(req.params.id, 'loanId')));
    }),
    borrow: asyncHandler(async (req, res) => {
      const loan = await service.borrow(parseBorrowBody(req.body), res.locals.librarian.id);
      res.status(201).json({ message: 'Book loan approved and registered', loan });
    }),
    returnBook: asyncHandler(async (req, res) => {
      const id = parseUuid(req.params.id, 'loanId');
      const { fineCollected } = parseReturnBody(req.body);
      const loan = await service.returnBook(id, res.locals.librarian.id, fineCollected);
      res.json({ message: 'Book returned successfully', loan });
    }),
    reportOverdue: asyncHandler(async (req, res) => {
      const holdResult = await service.reportOverdue(parseReportOverdueBody(req.body));
      res.json({ message: 'Overdue hold successfully registered with SIS', holdResult });
    }),
  };
}
