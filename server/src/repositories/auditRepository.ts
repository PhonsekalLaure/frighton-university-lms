import { getSupabaseAdmin } from '../config/supabase.js';
import { auditActions, type AuditEvent, type AuditFilters } from '../models/audit.js';
import { databaseError } from '../utils/databaseError.js';
import { HttpError } from '../utils/httpError.js';

export async function listAuditEvents(filters: AuditFilters) {
  let query = getSupabaseAdmin().from('lms_audit_events').select(
    'id,occurredAt:occurred_at,action,actorId:actor_id,actorName:actor_name,actorRole:actor_role,entityType:entity_type,entityId:entity_id,entityLabel:entity_label,studentNumber:student_number,details',
    { count: 'exact' },
  ).in('action', [...auditActions]);
  if (filters.action) query = query.eq('action', filters.action);
  if (filters.query) query = query.ilike('search_text', '%' + filters.query.replace(/[\\%_]/g, '\\$&') + '%');
  if (filters.from) query = query.gte('occurred_at', new Date(filters.from + 'T00:00:00+08:00').toISOString());
  if (filters.to) query = query.lt('occurred_at', new Date(Date.parse(filters.to + 'T00:00:00+08:00') + 86400000).toISOString());
  const { data, error, count } = await query.order('occurred_at', { ascending: false }).order('id', { ascending: false })
    .range((filters.page - 1) * filters.pageSize, filters.page * filters.pageSize - 1).returns<AuditEvent[]>();
  if (error) {
    if (['42P01', 'PGRST205'].includes(error.code)) throw new HttpError(503, 'Audit trail is not enabled yet. Apply the audit trail database migration.');
    throw databaseError(error);
  }
  return { data: data ?? [], total: count ?? 0, page: filters.page, pageSize: filters.pageSize };
}
