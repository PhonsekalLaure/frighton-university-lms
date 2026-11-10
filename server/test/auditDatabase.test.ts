import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

let db: PGlite;
const staff = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const admin = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const student = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const book = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const reservation = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const loan = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
before(async () => {
  db = new PGlite();
  await db.exec([
    'CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;',
    'CREATE TABLE public.users(users_id uuid PRIMARY KEY,first_name text,middle_name text,last_name text,role text,is_active boolean);',
    'CREATE TABLE public.profiles(id uuid PRIMARY KEY,student_number text);',
    'CREATE TABLE public.books(books_id uuid PRIMARY KEY,title text,author text,category text,publication_year int,shelf_location text,copies int,is_active boolean,cover_image_path text);',
    'CREATE TABLE public.borrow_records(id uuid PRIMARY KEY,student_id uuid,book_id uuid,issued_by uuid,borrow_date timestamptz DEFAULT now(),due_date date,return_date timestamptz,returned_to uuid,fine_amount numeric,fine_paid_at timestamptz,receipt_number text);',
    "CREATE TABLE public.reservations(id uuid PRIMARY KEY,student_id uuid,book_id uuid,reserved_by uuid,reserved_at timestamptz DEFAULT now(),expires_at timestamptz,status text DEFAULT 'active',cancelled_at timestamptz,fulfilled_at timestamptz);",
    'CREATE TABLE public.library_replacement_charges(id uuid PRIMARY KEY,student_id uuid,loan_id uuid,reason text,amount numeric,assessed_by uuid,settled_by uuid,settled_at timestamptz,settlement_reference text);',
  ].join('\n'));
  await db.query("INSERT INTO public.users VALUES($1,'Test',NULL,'Librarian','Librarian',true),($2,'Test',NULL,'Admin','Admin',true),($3,'Test',NULL,'Student','Students',true)", [staff,admin,student]);
  await db.query("INSERT INTO public.profiles VALUES($1,'TEST-1')",[student]);
  await db.query("INSERT INTO public.books VALUES($1,'Dracula','Bram Stoker','Literature',1897,'A-1',3,true,'private/cover.png')",[book]);
  await db.exec(await readFile(new URL('../../supabase/migrations/006_reservation_api.sql', import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../../supabase/migrations/010_audit_trail.sql', import.meta.url),'utf8'));
});
after(async () => { await db.close(); });
async function staffContext(actor: string | null, role = 'service_role') {
  await db.query("SELECT set_config('request.jwt.claims',$1,true),set_config('request.headers',$2,true)",
    [JSON.stringify({role}),JSON.stringify(actor ? {'x-lms-actor-id':actor} : {})]);
}
async function transaction(run: () => Promise<void>) {
  await db.exec('BEGIN');
  try { await staffContext(null); await run(); } finally { await db.exec('ROLLBACK'); }
}
async function events() { return (await db.query<any>('SELECT * FROM public.lms_audit_events ORDER BY occurred_at,id')).rows; }
async function makeReservation() {
  await db.query("INSERT INTO public.reservations(id,student_id,book_id,reserved_by,expires_at) VALUES($1,$2,$3,$4,now()+interval '3 days')",[reservation,student,book,staff]);
}

test('audit migration preserves data and leaves existing cancellation functions unchanged', async () => {
  assert.equal((await events()).length,0);
  assert.equal((await db.query<any>('SELECT count(*)::int AS count FROM public.books')).rows[0].count,1);
  const columns = await db.query<any>("SELECT column_name FROM information_schema.columns WHERE table_name='books'");
  assert.equal(columns.rows.some(row=>row.column_name.startsWith('audit_')),false);
});

test('catalog changes capture staff and before/after details without saving private cover paths', async () => transaction(async () => {
  await staffContext(staff);
  await db.query('UPDATE public.books SET copies=4 WHERE books_id=$1',[book]);
  let rows=await events(); assert.equal(rows[0].action,'book.stock_adjusted'); assert.equal(rows[0].actor_id,staff);
  assert.deepEqual(rows[0].details.changes.copies,{before:3,after:4});
  await staffContext(admin);
  await db.query("UPDATE public.books SET title='Updated title',cover_image_path='private/new.png' WHERE books_id=$1",[book]);
  rows=await events(); assert.equal(rows[1].actor_name,'Test Admin'); assert.equal(rows[1].details.coverChanged,true);
  assert.equal(JSON.stringify(rows).includes('private/'),false);
  await db.query('UPDATE public.books SET title=title WHERE books_id=$1',[book]);
  assert.equal((await events()).length,2);
  await staffContext(student);
  await assert.rejects(db.query("UPDATE public.books SET title='Spoofed' WHERE books_id=$1",[book]),/active staff/);
}));

test('untrusted request headers cannot impersonate a staff actor', async () => transaction(async () => {
  await staffContext(admin,'authenticated');
  await db.query("UPDATE public.books SET title='External change' WHERE books_id=$1",[book]);
  assert.equal((await events())[0].actor_id,null);
}));

test('checkouts, fulfillment, returns and fines preserve actors without duplicate stock entries', async () => transaction(async () => {
  await db.query("INSERT INTO public.reservations(id,student_id,book_id,expires_at) VALUES($1,$2,$3,now()+interval '3 days')",[reservation,student,book]);
  await db.query('INSERT INTO public.borrow_records(id,student_id,book_id,issued_by,due_date) VALUES($1,$2,$3,$4,current_date+14)',[loan,student,book,staff]);
  await db.query("UPDATE public.reservations SET status='fulfilled',fulfilled_at=now() WHERE id=$1",[reservation]);
  await db.query('UPDATE public.books SET copies=copies-1 WHERE books_id=$1',[book]);
  await db.query("UPDATE public.borrow_records SET return_date=now(),returned_to=$1,fine_amount=20,fine_paid_at=now(),receipt_number='TEST-RECEIPT' WHERE id=$2",[admin,loan]);
  await db.query('UPDATE public.books SET copies=copies+1 WHERE books_id=$1',[book]);
  const rows=await events();
  assert.deepEqual(rows.map(row=>row.action),['reservation.created','loan.borrowed','reservation.fulfilled','loan.returned','fine.collected']);
  assert.equal(rows[0].actor_id,student); assert.equal(rows[2].actor_id,staff); assert.equal(rows[4].actor_id,admin);
  assert.equal(rows[4].details.amount,20); assert.equal(rows[4].student_number,'TEST-1');
}));

test('staff cancellation and automatic expiry are attributed correctly', async () => transaction(async () => {
  await makeReservation(); await staffContext(admin);
  await db.query('SELECT public.cancel_reservation($1,$2)',[reservation,admin]);
  assert.equal((await events())[1].actor_id,admin);
  await staffContext(null);
  await db.query("INSERT INTO public.reservations(id,student_id,book_id,reserved_by,expires_at) VALUES(gen_random_uuid(),$1,$2,$3,now()-interval '1 day')",[student,book,staff]);
  await db.query('SELECT public.expire_reservations()');
  const last=(await events()).at(-1); assert.equal(last.action,'reservation.expired'); assert.equal(last.actor_id,null);
}));

test('student cancellation identifies the student rather than the original librarian', async () => transaction(async () => {
  await makeReservation();
  await db.query("UPDATE public.reservations SET status='cancelled',cancelled_at=now() WHERE id=$1",[reservation]);
  assert.equal((await events())[1].actor_id,student);
}));

test('replacement charges and settlements are audited', async () => transaction(async () => {
  await db.query("INSERT INTO public.library_replacement_charges(id,student_id,reason,amount,assessed_by) VALUES($1,$2,'Lost book',500,$3)",[loan,student,staff]);
  await db.query("UPDATE public.library_replacement_charges SET settled_at=now(),settled_by=$1,settlement_reference='TEST-PAYMENT' WHERE id=$2",[admin,loan]);
  const rows=await events(); assert.deepEqual(rows.map(row=>row.action),['replacement.assessed','replacement.settled']);
  assert.equal(rows[1].details.reference,'TEST-PAYMENT');
}));

test('new books and archival create separate staff-attributed entries', async () => transaction(async () => {
  const created='11111111-1111-4111-8111-111111111111';
  await staffContext(staff);
  await db.query("INSERT INTO public.books(books_id,title,author,copies,is_active) VALUES($1,'New title','Author',2,true)",[created]);
  await staffContext(admin); await db.query('UPDATE public.books SET is_active=false WHERE books_id=$1',[created]);
  const rows=await events(); assert.deepEqual(rows.map(row=>row.action),['book.created','book.archived']);
  assert.equal(rows[0].actor_id,staff); assert.equal(rows[1].actor_id,admin);
}));

test('rolled-back changes leave no audit entries', async () => {
  await transaction(async()=>{await staffContext(staff);await db.query("UPDATE public.books SET title='Rolled back' WHERE books_id=$1",[book]);assert.equal((await events()).length,1);});
  assert.equal((await events()).length,0);
  assert.equal((await db.query<any>('SELECT title FROM public.books WHERE books_id=$1',[book])).rows[0].title,'Dracula');
});

test('only server credentials may read events, and application roles cannot insert or rewrite history', async () => {
  for(const role of ['anon','authenticated','service_role']){
    await db.exec('SET ROLE '+role);
    try{
      if(role==='service_role'){
        await db.query('SELECT * FROM public.lms_audit_events');
      }else{
        await assert.rejects(db.query('SELECT * FROM public.lms_audit_events'),/permission denied/);
      }
      await assert.rejects(db.exec('INSERT INTO public.lms_audit_events DEFAULT VALUES'),/permission denied/);
      for(const statement of ['UPDATE public.lms_audit_events SET actor_name=actor_name','DELETE FROM public.lms_audit_events','TRUNCATE public.lms_audit_events'])await assert.rejects(db.exec(statement),/permission denied/);
      await assert.rejects(db.query("SELECT public.lms_append_audit('book.created','book',gen_random_uuid(),'Forged',NULL,NULL,'{}')"),/permission denied/);
    }finally{await db.exec('RESET ROLE');}
  }
});
