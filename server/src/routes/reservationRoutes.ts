import { NextFunction, Request, Response, Router } from 'express';
import { getSupabaseAdmin } from '../config/supabase.js';
import { sisService } from '../services/sisService.js';

export const reservationRouter = Router();

function databaseErrorStatus(message: string, code?: string): number {
  if (code === '23505') return 409;
  if (/not found/i.test(message)) return 404;
  if (/reserved for another|maximum of/i.test(message)) return 409;
  return 400;
}

reservationRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const supabase = getSupabaseAdmin();
    const { error: expiryError } = await supabase.rpc('expire_reservations');
    if (expiryError) throw expiryError;
    let query = supabase
      .from('reservations')
      .select('id,status,reserved_at,expires_at,student:users!reservations_student_id_fkey(student_number,first_name,middle_name,last_name),book:books!reservations_book_id_fkey(books_id,title,author,copies)')
      .order('reserved_at', { ascending: false });
    if (status && status !== 'all') query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw error;
    res.json((data ?? []).map((reservation: any) => ({
      id: reservation.id,
      status: reservation.status,
      reservedAt: reservation.reserved_at,
      expiresAt: reservation.expires_at,
      studentNumber: reservation.student?.student_number,
      studentName: [reservation.student?.first_name, reservation.student?.middle_name, reservation.student?.last_name].filter(Boolean).join(' '),
      book: reservation.book && {
        id: reservation.book.books_id,
        title: reservation.book.title,
        author: reservation.book.author,
        availableCopies: reservation.book.copies,
      },
    })));
  } catch (error) {
    next(error);
  }
});

reservationRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { frightonId, bookId } = req.body as { frightonId?: string; bookId?: string };
    if (!frightonId?.trim() || !bookId) {
      res.status(400).json({ error: 'Student ID and book are required.' });
      return;
    }

    const student = await sisService.checkStudentStatus(frightonId.trim());
    if (!student.canBorrow) {
      res.status(403).json({ error: 'This student cannot reserve books due to their SIS standing.', student });
      return;
    }

    const { data, error } = await getSupabaseAdmin().rpc('create_reservation', {
      p_student_number: student.frightonId,
      p_book_id: bookId,
      p_reserved_by: res.locals.librarian.id,
    });
    if (error) {
      res.status(databaseErrorStatus(error.message, error.code)).json({ error: error.message });
      return;
    }
    res.status(201).json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to verify the student with SIS.';
    res.status(/not found/i.test(message) ? 404 : 502).json({ error: message });
  }
});

reservationRouter.post('/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('reservations')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('status', 'active')
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      res.status(404).json({ error: 'Active reservation not found.' });
      return;
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

reservationRouter.post('/:id/borrow', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const supabase = getSupabaseAdmin();
    const { error: expiryError } = await supabase.rpc('expire_reservations');
    if (expiryError) throw expiryError;
    const { data: reservation, error: reservationError } = await supabase
      .from('reservations')
      .select('id,book_id,status,student:users!reservations_student_id_fkey(student_number)')
      .eq('id', req.params.id)
      .eq('status', 'active')
      .maybeSingle();
    if (reservationError) throw reservationError;
    if (!reservation) {
      res.status(404).json({ error: 'Active reservation not found.' });
      return;
    }
    const studentRecord = (Array.isArray(reservation.student) ? reservation.student[0] : reservation.student) as { student_number?: string } | undefined;
    if (!studentRecord?.student_number) {
      res.status(400).json({ error: 'This reservation has no linked student number.' });
      return;
    }
    const student = await sisService.checkStudentStatus(studentRecord.student_number);
    if (!student.canBorrow) {
      res.status(403).json({ error: 'This student cannot borrow books due to their SIS standing.' });
      return;
    }
    const { data: loan, error } = await supabase.rpc('borrow_book', {
      p_student_number: studentRecord.student_number,
      p_book_id: reservation.book_id,
      p_issued_by: res.locals.librarian.id,
    });
    if (error) {
      res.status(databaseErrorStatus(error.message, error.code)).json({ error: error.message });
      return;
    }
    res.status(201).json(loan);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to complete the reservation checkout.';
    res.status(/not found/i.test(message) ? 404 : 502).json({ error: message });
  }
});
