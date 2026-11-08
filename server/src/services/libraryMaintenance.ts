import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { sisService } from './sisService.js';
import { isDebtSnapshot, type DebtSnapshot } from './libraryService.js';
import { databaseError } from '../utils/databaseError.js';
export async function runLibraryMaintenance(
  client: SupabaseClient = getSupabaseAdmin(),
  send = (d: DebtSnapshot) => sisService.syncDebt(d),
) {
  const expired = await client.rpc('expire_reservations');
  if (expired.error) throw databaseError(expired.error);
  let after = '00000000-0000-0000-0000-000000000000';
  for (;;) {
    const students = await client
      .from('profiles')
      .select('id')
      .eq('role', 'student')
      .not('student_number', 'is', null)
      .gt('id', after)
      .order('id')
      .limit(200);
    if (students.error) throw databaseError(students.error);
    for (const s of students.data ?? []) {
      const r = await client.rpc('refresh_library_debt', { p_student_id: s.id });
      if (r.error) throw databaseError(r.error);
    }
    if (!students.data?.length || students.data.length < 200) break;
    after = students.data[students.data.length - 1].id;
  }
  const claimed = await client.rpc('claim_library_debt', { p_limit: 10 }).retry(false);
  if (claimed.error) throw databaseError(claimed.error);
  let delivered = 0;
  await Promise.all(
    (claimed.data ?? []).map(async (row: any) => {
      const snapshot = { ...row.payload, version: Number(row.version) };
      let success = false;
      try {
        if (!isDebtSnapshot(snapshot, snapshot.studentNumber)) throw new Error('Invalid debt snapshot');
        await send(snapshot);
        success = true;
        delivered++;
      } catch {
        console.error('Library debt delivery deferred', { studentId: row.student_id, version: row.version });
      }
      const result = await client.rpc('finish_library_debt', {
        p_student_id: row.student_id,
        p_version: row.version,
        p_token: row.claim_token,
        p_success: success,
      });
      if (result.error) throw databaseError(result.error);
    }),
  );
  return { delivered };
}
