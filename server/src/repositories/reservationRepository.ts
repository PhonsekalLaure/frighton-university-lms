import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '../config/supabase.js';
import type { ReservationRepository } from '../interfaces/reservationRepository.js';
import type { ReservationRecord } from '../models/reservation.js';
import { databaseError } from '../utils/databaseError.js';
import { HttpError } from '../utils/httpError.js';

const columns = 'id,status,reserved_at,expires_at,student_number,student_name,book_id,book_title,book_author,available_copies';

export function createReservationRepository(getClient: () => SupabaseClient = getSupabaseAdmin): ReservationRepository {
  const find = async (id: string): Promise<ReservationRecord> => {
    const { data, error } = await getClient().from('circulation_reservations')
      .select(columns).eq('id', id).maybeSingle<ReservationRecord>();
    if (error) throw databaseError(error);
    if (!data) throw new HttpError(503, 'The reservation result is unavailable. Refresh reservations before retrying.');
    return data;
  };

  return {
    async list({ status, page, pageSize }) {
      const { error: expiryError } = await getClient().rpc('expire_reservations');
      if (expiryError) throw databaseError(expiryError);
      let query = getClient().from('circulation_reservations').select(columns, { count: 'exact' });
      if (status !== 'all') query = query.eq('status', status);
      const { data, error, count } = await query.order('reserved_at', { ascending: false }).order('id')
        .range((page - 1) * pageSize, page * pageSize - 1).returns<ReservationRecord[]>();
      if (error) throw databaseError(error);
      return { data: data ?? [], total: count ?? 0, page, pageSize };
    },

    async create(input, reservedBy) {
      const { data, error } = await getClient().rpc('create_reservation', {
        p_student_number: input.frightonId, p_book_id: input.bookId, p_reserved_by: reservedBy,
      }).single<{ id: string }>();
      if (error) throw databaseError(error);
      if (!data) throw new HttpError(503, 'The reservation result is unavailable. Refresh reservations before retrying.');
      return find(data.id);
    },

    async cancel(id, cancelledBy) {
      const { data, error } = await getClient().rpc('cancel_reservation', {
        p_reservation_id: id, p_cancelled_by: cancelledBy,
      }).single<{ id: string }>();
      if (error) throw databaseError(error);
      if (!data) throw new HttpError(503, 'The cancellation result is unavailable. Refresh reservations before retrying.');
      return find(data.id);
    },
  };
}

export const reservationRepository = createReservationRepository();
