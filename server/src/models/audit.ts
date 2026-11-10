export const auditActions = ['book.created', 'book.updated', 'book.stock_adjusted', 'book.archived',
  'loan.borrowed', 'loan.returned', 'fine.collected', 'reservation.created', 'reservation.cancelled',
  'reservation.fulfilled', 'reservation.expired', 'replacement.assessed', 'replacement.settled'] as const;
export interface AuditFilters { page: number; pageSize: number; action?: string; query?: string; from?: string; to?: string; }
export interface AuditEvent {
  id: number; occurredAt: string; action: string; actorId: string | null; actorName: string; actorRole: string;
  entityType: string; entityId: string | null; entityLabel: string; studentNumber: string | null;
  details: Record<string, unknown>;
}
