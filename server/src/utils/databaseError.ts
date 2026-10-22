import { HttpError } from './httpError.js';

interface DatabaseError {
  code?: string;
  message: string;
}

export function databaseError(error: DatabaseError): HttpError {
  const status = /^PT(400|403|404|409)$/.exec(error.code ?? '');
  if (status) return new HttpError(Number(status[1]), error.message);
  if (error.code === '23505') return new HttpError(409, 'This operation conflicts with an existing record.');
  if (error.code === '40P01' || error.code === '40001') {
    return new HttpError(409, 'Another desk operation is in progress. Please retry.');
  }
  if (['PGRST202', 'PGRST205', '42P01', '42703', '42883'].includes(error.code ?? '')) {
    return new HttpError(503, 'Library database setup is incomplete. An administrator must apply the library migrations.', { cause: error });
  }
  return new HttpError(503, 'Circulation data is temporarily unavailable. Please try again.', { cause: error });
}
