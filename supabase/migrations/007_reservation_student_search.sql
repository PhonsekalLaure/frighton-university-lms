BEGIN;

CREATE OR REPLACE FUNCTION public.search_reservation_students(
    p_query TEXT,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    student_number TEXT,
    student_name TEXT,
    program TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT profile.student_number,
           concat_ws(' ', student.first_name, student.middle_name, student.last_name),
           profile.program::text
    FROM public.profiles profile
    JOIN public.users student ON student.users_id = profile.id
    WHERE student.role = 'Students'
      AND student.is_active
      AND profile.role::text = 'student'
      AND profile.academic_status::text = 'active'
      AND (
          profile.student_number ILIKE '%' || trim(p_query) || '%'
          OR concat_ws(' ', student.first_name, student.middle_name, student.last_name)
             ILIKE '%' || trim(p_query) || '%'
      )
    ORDER BY CASE WHEN upper(profile.student_number) = upper(trim(p_query)) THEN 0 ELSE 1 END,
             student.last_name, student.first_name, profile.student_number
    LIMIT LEAST(GREATEST(p_limit, 1), 10);
$$;

REVOKE ALL ON FUNCTION public.search_reservation_students(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_reservation_students(TEXT, INTEGER) TO service_role;

COMMIT;
