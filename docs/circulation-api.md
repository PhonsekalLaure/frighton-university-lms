# Borrowing and returning API

Implemented in the existing Express server under `server/src`. Controllers handle HTTP,
validators parse untrusted input, services coordinate eligibility, repositories query
Supabase, and SQL functions enforce atomic lending and return rules. Existing
authentication, origin protection, and error middleware apply to every loan endpoint.
No additional dependencies or background jobs are needed.

## Setup

Use the production tables in `schema.md`, including the SIS `profiles` table,
then apply `supabase/migrations/003_reservations.sql`,
`supabase/migrations/004_circulation.sql`, `supabase/migrations/005_catalog.sql`,
`supabase/migrations/006_reservation_api.sql`,
`supabase/migrations/007_reservation_student_search.sql`, and
`supabase/migrations/008_single_active_loan.sql` in that order on PostgreSQL 15+.
The historical migrations 001/002 use a different schema and cannot bootstrap this
production schema. Migration 004 does not modify existing loan or student data.
It replaces the legacy `return_book(uuid, uuid, text)` function with
`return_book(uuid, uuid, boolean)`; update any external callers accordingly.

Student IDs are resolved exclusively from `profiles.student_number`, with
`profiles.id = users.users_id`. Existing students must have linked profiles;
the old `seed_students.sql` only populates `users.student_number` and is not
sufficient for circulation. Staff must have active Librarian or Admin user records.

Copy missing settings from `server/.env.example` into the existing `server/.env`.
Use actual project credentials locally. Never expose the service role or SIS key
in client variables. Checkout uses the shared student profile and LMS loan records;
it does not require the separate SIS API. Students must have an active account and
zero unreturned loans. Returned loan history does not block checkout. SIS API
credentials are needed only for explicit integrations such as reporting overdue holds.

## Endpoints

All paths below are relative to `/api/v1/loans`. Authenticate using the existing
staff session cookie or a verified bearer token. Cookie mutations require the
configured client Origin. Staff identity comes from authentication, never the body.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | /policy | Manila date, due date, loan period, maximum loans, and fine rate |
| GET | /verify-patron/:frightonId | Student card, loan counts, and borrowing eligibility |
| GET | /available-books?page=1&pageSize=25 | Active titles with stock, using database UUIDs |
| GET | /?status=active&page=1&pageSize=25 | Active loans, return history, or all loans |
| GET | /:id | Loan details, current fine, and completed receipt information |
| POST | /borrow | Check out a book |
| POST | /:id/return | Return a book and record any collected fine |

Loan lists accept optional `frightonId` and `bookId` filters. Status is
`active` (default), `returned`, or `all`. Page size defaults to 25 and is capped
at 100. Lists return `{ data, total, page, pageSize }`.
The existing `POST /report-overdue` SIS integration endpoint remains available.

Borrow body:

```json
{ "frightonId": "STU-2026-0001", "bookId": "11111111-1111-4111-8111-111111111111" }
```

The response is HTTP 201 with `{ message, loan }`. The loan has `id`, `studentId`
(the database UUID), `bookId`, `issuedBy`, `borrowedAt`, `dueDate`, `returnedAt`,
`returnedTo`, `dailyPenaltyRate`, `overdueDays`, `fineAmount`, `finePaidAt`,
and `receiptNumber`. GET loan endpoints additionally include `studentNumber`,
`studentName`, `bookTitle`, and `bookAuthor`.

Return body for an on-time item is `{}`. For a late item, refresh its details,
collect the displayed fine at the desk, then submit:

```json
{ "fineCollected": true }
```

This flag records the staff member's confirmation of collection. It does not
charge a payment method. The database calculates the fine from the loan's saved
rate and Manila calendar days, records payment, restores stock once, and generates
`RCP-YYYYMMDD-XXXXXXXX`. A repeated return responds with 409.
Clients cannot set dates, fines, receipts, or staff IDs through these endpoints.

Checkout blocks inactive students and students with any unreturned loan,
archived titles, unavailable stock, and titles reserved for another student.
Successful checkout fulfills the student's first matching unexpired reservation.
Student and book row locks protect simultaneous checkout requests. Policy
constants are defined in `circulation_policy()`; migration 008 sets the active-loan limit to one.

## Errors and validation

Errors use `{ "error": "message" }`: 400 invalid input, 401 unauthenticated,
403 access or eligibility denied, 404 missing resource, 409 circulation conflict,
502 SIS verification unavailable, 503 database unavailable. Unknown database
details are not returned to clients. UUIDs are required for books and loans;
the numeric IDs and LN-prefixed IDs in the demo UI are not database identifiers.

## Verification and scope

Run `npm test -w server` for HTTP, validation, and service tests and
`npm run build:server` for the TypeScript build.
Run `supabase/tests/circulation.sql` against an isolated database with the
production schema and migrations applied. It creates fixtures within a transaction
and rolls them back. It must be executed by a database owner, never by a browser.

The Circulation Desk and dashboard load catalog, loans, eligibility, policies, and
receipts from the backend. Sign-in uses the staff session APIs. Failed or empty
backend responses never fall back to sample records.

The Library Operations Reservations page uses the authenticated backend API and
the production catalog. Reservation creation verifies the shared student account and requires zero active loans without the separate SIS API. Listing releases expired holds, cancellation is
recorded in reservation history, and Borrow Now opens the real Circulation Desk
with the student and title pre-filled. The Active Borrowers page displays saved loans and return history from the same backend; its return action opens the Circulation Desk for fine review and confirmation. Successful checkout opens a modal using the saved loan response. Loan list/detail endpoints remain for the Circulation Desk.
See [file-change-guide.md](file-change-guide.md) for the file-by-file explanation.

Migration 005 adds shelf locations and catalog read/write functions. Copy totals are derived
from available copies plus active loans; edits lock the stock row and reject totals
below the number checked out. Archive retains loan history.

The catalog API uses paginated `GET /api/v1/books`, `POST /api/v1/books`,
`PUT /api/v1/books/:id`, and `POST /api/v1/books/:id/archive`.
Create and update bodies contain `title`, `author`, `category`, `year` (number or
null), `total` (nonnegative integer), and `shelf`. Book responses use database UUIDs
and contain those fields plus `available` and `active`.

Admin staff directories use `GET /api/v1/staff`; this directory is read-only.
Account creation and access changes are not implemented in this scope.
