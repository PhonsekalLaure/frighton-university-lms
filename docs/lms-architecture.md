# Frighton University LMS — Page Architecture & Blueprint

## 1. Executive Summary & Design Scope

The Frighton University Library Management System (LMS) is a staff-only circulation console. It is deliberately focused: fast desk workflows for borrowing, returning and reserving books, without an over-engineered enterprise footprint.

- **Primary persona:** Librarian, working the circulation desk (speed and minimal clicks).
- **Secondary persona:** Admin, with every librarian feature plus librarian account management.
- **Students do not log in.** They are served in person. A librarian identifies a student by their ID and performs the action for them.
- **Visual direction:** the same gothic-modern dark academia look as the SIS, for a consistent university brand.
- **Integration:** the LMS is the source of truth for library holds. Unpaid or unreturned-overdue items can be pushed to the SIS as `library_debt` holds.

### Core business rules

| Rule | Value |
|---|---|
| Loan period | 14 days from borrow date |
| Late penalty | ₱5.00 per day overdue (`daily_penalty_rate`) |
| Fine payment | Collected at the desk during return; a receipt number is issued |
| Reservation hold | 3 days, then status becomes `expired` |
| Borrow identifier | Student ID only (e.g. `STU-2026-0001`) |
| Timezone | Asia/Manila for all due-date and overdue calculations |

---

## 2. Roles & Access Matrix

| Feature | Librarian | Admin |
|---|:---:|:---:|
| Sign in | ✅ | ✅ |
| Dashboard | ✅ | ✅ |
| Add / edit / archive books | ✅ | ✅ |
| Borrow a book (by student ID) | ✅ | ✅ |
| Return a book and collect fine | ✅ | ✅ |
| Reserve a book for a student | ✅ | ✅ |
| View students with active loans | ✅ | ✅ |
| View all reservations | ✅ | ✅ |
| Add a librarian account | ❌ | ✅ |
| Deactivate a librarian account | ❌ | ✅ |

Students have no access. Users with the `Students` role are blocked at login and exist only as records to borrow against.

---

## 3. Page & Route Map

| # | Page | Route | Access |
|---|---|---|---|
| 1 | Login | `/login` | Public |
| 2 | Dashboard | `/dashboard` | Librarian, Admin |
| 3 | Book Catalog & Management | `/books` | Librarian, Admin |
| 4 | Circulation Desk (Borrow / Return) | `/circulation` | Librarian, Admin |
| 5 | Active Borrowers | `/borrowed` | Librarian, Admin |
| 6 | Reservations | `/reservations` | Librarian, Admin |
| 7 | Librarian Management | `/admin/librarians` | **Admin only** |

All routes except `/login` sit inside a persistent AppShell (sidebar and top bar). `/admin/librarians` is hidden from the sidebar for librarians and also guarded by a route check and by RLS.

---

## 4. Detailed Page Specifications

### Page 1: Login (`/login`)

- **Access:** Public / unauthenticated.
- **Purpose:** Authenticate library staff.
- **Key UI elements:**
  - Gothic-modern crest and a branded login card.
  - Email and password sign-in (Supabase Auth, `signInWithPassword`).
  - Role check after sign-in: if `public.users.role` is `Students` or `is_active = false`, sign out and show "Access restricted to library staff."
  - Development-only quick-login presets: Librarian and Admin.
  - No public registration. Accounts are created by an Admin on `/admin/librarians`.

### Page 2: Dashboard (`/dashboard`)

- **Access:** Librarian, Admin.
- **Purpose:** At-a-glance state of the library and a launchpad into daily tasks.
- **Key UI elements:**
  - **Metric stat cards:**
    - Total Titles and Total Copies Available.
    - Books Currently Borrowed.
    - Overdue Loans (highlighted red).
    - Active Reservations.
    - Fines Collected Today (₱).
  - **Overdue alert banner:** "⚠️ 7 loans are overdue. Estimated fines accrued: ₱315." Links to `/borrowed?filter=overdue`.
  - **Due-today list:** loans due today, so the librarian can anticipate returns.
  - **Reservations expiring soon:** active reservations within 24 hours of `expires_at`.
  - **Quick actions:** Borrow a Book, Return a Book, Add a Book, New Reservation.

### Page 3: Book Catalog & Management (`/books`)

- **Access:** Librarian, Admin.
- **Purpose:** Browse the collection and add or maintain book records.
- **Key UI elements:**
  - Search by title, author or category, plus category and availability filters.
  - **Book table/cards:** title, author, category, publisher, year, copies available, and a status badge (`Available`, `Out of Stock`, `Archived`).
  - **"Add Book" button** opening a form modal:
    - Required: title, author, number of copies.
    - Optional: category, publisher, publication year, description.
    - Validation: copies must be 0 or more and year must be a valid number.
  - **Row actions:** Edit, Adjust Copies, Archive (sets `is_active = false`; books are never hard-deleted because loan history references them), Reserve.
  - Out-of-stock rows show a **Reserve** shortcut in place of Borrow.

### Page 4: Circulation Desk (`/circulation`)

The heart of the system, with two tabs: **Borrow** and **Return**.

- **Access:** Librarian, Admin.
- **Purpose:** Process lending and returns in as few steps as possible.

**Borrow tab**

1. **Enter Student ID** (scan or type). The system looks up the student and shows a profile card with name, ID, active loan count, and any overdue items.
2. **Pick the book** with a search-as-you-type field. Only books with `copies > 0` are selectable.
3. **Confirm.** The due date (today + 14 days, Manila time) is shown before confirming. On confirm:
   - A `borrow_records` row is created with `issued_by` set to the librarian.
   - `books.copies` is decremented atomically.
   - If the student has an active reservation for this book, it is marked `fulfilled`.

- **Guards:**
  - Student ID not found or account inactive: blocked.
  - Student has overdue unreturned books: blocked with an explanation.
  - Maximum of 3 active loans per student (configurable constant).
  - No copies available: offer "Reserve instead."

**Return tab**

1. **Enter Student ID** to list that student's active loans, or search by book.
2. **Select the loan** to return. The system computes the overdue days and fine live (₱5 × days late).
3. **Fine collection panel** (appears only if late):
   - Shows days overdue, rate, and total due.
   - "Collect ₱X and Return" records `fine_paid_at`.
4. **Confirm return** via the `return_book` database function:
   - Sets `return_date` and `returned_to`.
   - Restores book stock.
   - Generates a receipt number (`RCP-YYYYMMDD-XXXXXXXX`) for fined returns.
5. **Receipt view** (printable) after a fined return.

### Page 5: Active Borrowers (`/borrowed`)

- **Access:** Librarian, Admin.
- **Purpose:** See every student who currently has books out.
- **Key UI elements:**
  - Table of unreturned loans: student name, student ID, book title, borrow date, due date, days left or days overdue, and accrued fine.
  - Status badges: `On Time`, `Due Today`, `OVERDUE` (red).
  - Filters: All, Due Today, Overdue. Search by student name, ID or book title.
  - Group-by-student toggle to show each borrower with their book count.
  - **Row action:** "Process Return" jumps to `/circulation` with the loan pre-selected.
  - **Return history tab:** completed loans with return date, fine paid and receipt number.
  - CSV export of the current view.

### Page 6: Reservations (`/reservations`)

- **Access:** Librarian, Admin.
- **Purpose:** Create and manage book reservations made on behalf of students.
- **Key UI elements:**
  - **"New Reservation"** flow: enter Student ID, choose a book, confirm. `reserved_by` records the librarian and `expires_at` is set to 3 days out.
  - Table of reservations: student, book, reserved on, expires on, status badge (`active`, `fulfilled`, `cancelled`, `expired`).
  - Filters by status; search by student or book.
  - **Row actions:** Cancel, and **Borrow Now** (shown for active reservations when a copy is available), which jumps to the Borrow tab pre-filled.
  - Expired reservations are flipped to `expired` automatically, via a scheduled job (`pg_cron`) or when the page loads.
  - Guards: a student cannot hold two active reservations for the same title.

### Page 7: Librarian Management (`/admin/librarians`)

- **Access:** Admin only.
- **Purpose:** The single feature that separates Admin from Librarian: adding and managing library staff.
- **Key UI elements:**
  - Librarian directory: name, email, status (`Active` / `Deactivated`), created date.
  - **"Add Librarian" button** opening a form modal:
    - First name, middle name (optional), last name, email, temporary password.
    - Calls a server-side function (an Edge Function or the `create_account` SQL function) that creates the Supabase Auth user and a profile with `role = 'Librarian'`.
  - Row actions: Deactivate / Reactivate (toggles `is_active`) and Reset Password.
  - Account creation must run server-side only. Never expose the service-role key in the browser.

---

## 5. UI Shell & Navigation System

- **Persistent sidebar:** always visible on desktop, collapsible drawer on mobile. Icons from `lucide-react`:
  - Dashboard: `LayoutDashboard`
  - Books: `Library`
  - Circulation: `ArrowLeftRight`
  - Active Borrowers: `Users`
  - Reservations: `BookmarkCheck`
  - Librarian Management: `UserCog` (Admin only)
- **Overdue indicator:** the Active Borrowers item shows a red badge with the overdue count.
- **Top utility bar:** current date, a global **Student ID quick-lookup** field, the signed-in staff pill (name and role), and Sign Out.
- **Route guard:** an `<RequireRole roles={['Librarian','Admin']}>` wrapper on the shell, and a stricter `<RequireRole roles={['Admin']}>` on `/admin/*`.

---

## 6. Data Layer Notes (Aligned to the Existing Schema)

| Need | Change |
|---|---|
| Borrow by student ID | Add `student_number TEXT UNIQUE` to `public.users` (e.g. `STU-2026-0001`), indexed. Librarians type this, not the UUID. |
| Atomic borrowing | Add a `borrow_book(p_student_number, p_book_id, p_issued_by)` function that locks the book row, checks stock, creates the loan, decrements copies, and fulfills any matching reservation. |
| Returns and fines | Use the existing `return_book` function. |
| Reservation expiry | Scheduled job: `UPDATE reservations SET status='expired' WHERE status='active' AND expires_at < now()`. |
| Role enforcement | The existing RLS policies already limit writes to Librarian and Admin. Add an admin-only policy for inserting or updating users with the Librarian role. |
| SIS bridge (optional) | A view or endpoint exposing students with unreturned overdue loans or unpaid fines as `library_debt` holds. |

---

## 7. Implementation Sequence

1. **Auth and router setup:** configure React Router with the 7 routes inside a responsive AppShell, plus the role guards and the staff-only login check.
2. **Database additions:** add `student_number`, the `borrow_book` function and the reservation-expiry job. Seed demo students, books, and a few overdue loans.
3. **Book Catalog:** build `/books` with search, the add-book modal, and edit and archive actions.
4. **Circulation Desk:** build Borrow and Return flows with the student lookup, live fine calculator and receipt view.
5. **Monitoring pages:** build Active Borrowers and Reservations, with their filters and cross-links to Circulation.
6. **Dashboard:** wire up the stat cards, the overdue banner, and the due-today and expiring lists.
7. **Admin feature:** build Librarian Management with server-side account creation, and verify that librarians cannot reach it.
8. **Polish:** the dark academia theme, empty states, error toasts and print-friendly receipts.