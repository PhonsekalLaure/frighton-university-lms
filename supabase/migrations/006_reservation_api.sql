BEGIN;

CREATE OR REPLACE FUNCTION public.expire_reservations()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_expired_count INTEGER;
BEGIN
    UPDATE public.reservations
    SET status = 'expired'
    WHERE status = 'active' AND expires_at <= now();
    GET DIAGNOSTICS v_expired_count = ROW_COUNT;
    RETURN v_expired_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_reservation(
    p_reservation_id UUID,
    p_cancelled_by UUID
)
RETURNS public.reservations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_result public.reservations;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.users
        WHERE users_id = p_cancelled_by AND is_active AND role IN ('Librarian', 'Admin')
    ) THEN
        RAISE SQLSTATE 'PT403' USING MESSAGE = 'An active staff account is required.';
    END IF;

    PERFORM public.expire_reservations();

    UPDATE public.reservations
    SET status = 'cancelled', cancelled_at = now()
    WHERE id = p_reservation_id AND status = 'active' AND expires_at > now()
    RETURNING * INTO v_result;

    IF NOT FOUND THEN
        RAISE SQLSTATE 'PT404' USING MESSAGE = 'Active reservation was not found.';
    END IF;
    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_reservations() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_reservation(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_reservations() TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_reservation(UUID, UUID) TO service_role;

COMMIT;
