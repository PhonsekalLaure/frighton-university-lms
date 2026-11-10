import { apiRequest, type PageResult } from './api';
export const auditActionLabels: Record<string, string> = {
  'book.created': 'Book added', 'book.updated': 'Book updated', 'book.stock_adjusted': 'Book stock adjusted', 'book.archived': 'Book archived',
  'loan.borrowed': 'Book checked out', 'loan.returned': 'Book returned', 'fine.collected': 'Fine collected',
  'reservation.created': 'Reservation created', 'reservation.cancelled': 'Reservation cancelled', 'reservation.fulfilled': 'Reservation fulfilled', 'reservation.expired': 'Reservation expired',
  'replacement.assessed': 'Replacement charge assessed', 'replacement.settled': 'Replacement charge settled',
};
export interface AuditEvent {
  id: number; occurredAt: string; action: string; actorId: string | null; actorName: string; actorRole: string;
  entityType: string; entityId: string | null; entityLabel: string; studentNumber: string | null; details: Record<string, unknown>;
}
export interface AuditFilterValues { q: string; action: string; from: string; to: string; }
export function getAuditEvents(filters: AuditFilterValues, page: number, pageSize: number, signal?: AbortSignal) {
  const query = new URLSearchParams({ ...filters, page: String(page), pageSize: String(pageSize) });
  return apiRequest<PageResult<AuditEvent>>('/v1/audit-trail?' + query, { signal });
}

