-- Demo student profiles for the LMS reservation and circulation flows.
-- Run after 003_reservations.sql, which adds public.users.student_number.
-- Students do not sign in to the LMS; the password value only satisfies the
-- legacy NOT NULL column in the current schema.

INSERT INTO public.users (
    first_name,
    middle_name,
    last_name,
    email,
    password,
    role,
    is_active,
    student_number
)
VALUES
    ('Victor', 'F.', 'Frankenstein', 'victor.frankenstein@student.frighton.edu', 'student-profile-only', 'Students', true, 'STU-2026-0001'),
    ('Mina', 'L.', 'Harker', 'mina.harker@student.frighton.edu', 'student-profile-only', 'Students', true, 'STU-2026-0002'),
    ('Elias', 'R.', 'Northwood', 'elias.northwood@student.frighton.edu', 'student-profile-only', 'Students', true, 'STU-2026-0003'),
    ('Clara', 'J.', 'Bellamy', 'clara.bellamy@student.frighton.edu', 'student-profile-only', 'Students', true, 'STU-2026-0004'),
    ('Noah', 'P.', 'Ashford', 'noah.ashford@student.frighton.edu', 'student-profile-only', 'Students', true, 'STU-2026-0005'),
    ('Iris', 'M.', 'Blackwood', 'iris.blackwood@student.frighton.edu', 'student-profile-only', 'Students', true, 'STU-2026-0006'),
    ('Theo', 'A.', 'Whitlock', 'theo.whitlock@student.frighton.edu', 'student-profile-only', 'Students', true, 'STU-2026-0007'),
    ('Maeve', 'C.', 'Fairchild', 'maeve.fairchild@student.frighton.edu', 'student-profile-only', 'Students', true, 'STU-2026-0008')
ON CONFLICT (email) DO UPDATE
SET student_number = EXCLUDED.student_number,
    role = 'Students',
    is_active = true,
    updated_at = now();
