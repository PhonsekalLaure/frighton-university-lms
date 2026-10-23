import { asyncHandler } from '../middlewares/asyncHandler.js';
import { ReservationService } from '../services/reservationService.js';
import { parseUuid } from '../validators/loanValidators.js';
import { parseCreateReservationBody, parseReservationFilters } from '../validators/reservationValidators.js';

export function createReservationController(service = new ReservationService()) {
  return {
    list: asyncHandler(async (req, res) => {
      res.json(await service.list(parseReservationFilters(req.query)));
    }),
    create: asyncHandler(async (req, res) => {
      const reservation = await service.create(parseCreateReservationBody(req.body), res.locals.librarian.id);
      res.status(201).json(reservation);
    }),
    cancel: asyncHandler(async (req, res) => {
      const reservation = await service.cancel(parseUuid(req.params.id, 'reservationId'), res.locals.librarian.id);
      res.json(reservation);
    }),
  };
}
