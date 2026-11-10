-- Run once after 009_library_self_service.sql in the shared Supabase database.
BEGIN;

CREATE TABLE public.lms_audit_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 action text NOT NULL,
 actor_id uuid, actor_name text NOT NULL, actor_role text NOT NULL,
 entity_type text NOT NULL, entity_id uuid, entity_label text NOT NULL,
 student_number text, details jsonb NOT NULL DEFAULT '{}',
 search_text text NOT NULL
);
CREATE INDEX lms_audit_events_recent ON public.lms_audit_events(occurred_at DESC,id DESC);
ALTER TABLE public.lms_audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lms_audit_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.lms_audit_events TO service_role;

-- Trigger writes share the same transaction as the library change.
CREATE FUNCTION public.lms_append_audit(p_action text,p_type text,p_id uuid,p_label text,
 p_actor uuid,p_student uuid,p_details jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_name text; v_role text; v_number text;
BEGIN
 SELECT nullif(trim(concat_ws(' ',first_name,middle_name,last_name)),''),role::text
 INTO v_name,v_role FROM public.users WHERE users_id=p_actor;
 SELECT student_number INTO v_number FROM public.profiles WHERE id=p_student;
 v_name:=coalesce(v_name,CASE WHEN p_actor IS NULL THEN 'System' ELSE 'Former account' END);
 v_role:=coalesce(v_role,'System');
 INSERT INTO public.lms_audit_events(action,actor_id,actor_name,actor_role,entity_type,entity_id,entity_label,student_number,details,search_text)
 VALUES(p_action,p_actor,v_name,v_role,p_type,p_id,coalesce(p_label,p_id::text),v_number,p_details,
 concat_ws(' ',p_action,p_type,p_label,v_name,v_role,v_number));
END $$;
REVOKE ALL ON FUNCTION public.lms_append_audit(text,text,uuid,text,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.lms_audit_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid; v_title text; v_action text; v_before jsonb:='{}'; v_after jsonb;
 v_changes jsonb; v_cover boolean:=false; v_previous text;
BEGIN
 -- Only the trusted backend may supply a staff identity in a request header.
 IF coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role'='service_role' THEN
  v_actor:=(nullif(current_setting('request.headers',true),'')::jsonb->>'x-lms-actor-id')::uuid;
 END IF;
 IF v_actor IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.users WHERE users_id=v_actor AND is_active AND role IN ('Librarian','Admin')
 ) THEN RAISE SQLSTATE 'PT403' USING MESSAGE='An active staff account is required.'; END IF;

 CASE TG_TABLE_NAME
 WHEN 'books' THEN
  v_after:=jsonb_build_object('title',NEW.title,'author',NEW.author,'category',NEW.category,
   'publicationYear',NEW.publication_year,'shelf',NEW.shelf_location,'copies',NEW.copies,'active',NEW.is_active);
  IF TG_OP='UPDATE' THEN
   v_before:=jsonb_build_object('title',OLD.title,'author',OLD.author,'category',OLD.category,
    'publicationYear',OLD.publication_year,'shelf',OLD.shelf_location,'copies',OLD.copies,'active',OLD.is_active);
   v_cover:=NEW.cover_image_path IS DISTINCT FROM OLD.cover_image_path;
   -- Automatic stock movement is already recorded by the loan event.
   IF v_actor IS NULL AND NOT v_cover AND (v_after-'copies')=(v_before-'copies') THEN RETURN NEW; END IF;
  END IF;
  SELECT coalesce(jsonb_object_agg(e.key,jsonb_build_object('before',v_before->e.key,'after',e.value)),'{}')
  INTO v_changes FROM jsonb_each(v_after) e WHERE v_before->e.key IS DISTINCT FROM e.value;
  IF TG_OP='UPDATE' AND v_changes='{}' AND NOT v_cover THEN RETURN NEW; END IF;
  v_action:=CASE WHEN TG_OP='INSERT' THEN 'book.created'
   WHEN OLD.is_active AND NOT NEW.is_active THEN 'book.archived'
   WHEN v_changes ? 'copies' AND (v_changes-'copies')='{}' AND NOT v_cover THEN 'book.stock_adjusted'
   ELSE 'book.updated' END;
  PERFORM public.lms_append_audit(v_action,'book',NEW.books_id,NEW.title,v_actor,NULL,
   jsonb_build_object('changes',v_changes,'coverChanged',v_cover OR TG_OP='INSERT'));

 WHEN 'borrow_records' THEN
  SELECT title INTO v_title FROM public.books WHERE books_id=NEW.book_id;
  IF TG_OP='INSERT' THEN
   PERFORM public.lms_append_audit('loan.borrowed','loan',NEW.id,v_title,NEW.issued_by,NEW.student_id,
    jsonb_build_object('bookId',NEW.book_id,'dueDate',NEW.due_date));
  ELSE
   IF OLD.return_date IS NULL AND NEW.return_date IS NOT NULL THEN
    PERFORM public.lms_append_audit('loan.returned','loan',NEW.id,v_title,NEW.returned_to,NEW.student_id,
     jsonb_build_object('returnDate',NEW.return_date,'fineAmount',NEW.fine_amount,'receiptNumber',NEW.receipt_number));
   END IF;
   IF OLD.fine_paid_at IS NULL AND NEW.fine_paid_at IS NOT NULL AND NEW.fine_amount>0 THEN
    PERFORM public.lms_append_audit('fine.collected','loan',NEW.id,v_title,NEW.returned_to,NEW.student_id,
     jsonb_build_object('amount',NEW.fine_amount,'receiptNumber',NEW.receipt_number));
   END IF;
  END IF;

 WHEN 'reservations' THEN
  SELECT title INTO v_title FROM public.books WHERE books_id=NEW.book_id;
  IF TG_OP='INSERT' THEN v_action:='reservation.created';v_actor:=coalesce(NEW.reserved_by,NEW.student_id);
  ELSE
   IF OLD.status=NEW.status THEN RETURN NEW; END IF;
   v_previous:=OLD.status;
   CASE NEW.status
    WHEN 'cancelled' THEN v_action:='reservation.cancelled';v_actor:=coalesce(v_actor,NEW.student_id);
    WHEN 'expired' THEN v_action:='reservation.expired';v_actor:=NULL;
    WHEN 'fulfilled' THEN
     v_action:='reservation.fulfilled';
     SELECT issued_by INTO v_actor FROM public.borrow_records WHERE student_id=NEW.student_id
      AND book_id=NEW.book_id AND return_date IS NULL ORDER BY borrow_date DESC,id DESC LIMIT 1;
    ELSE RETURN NEW;
   END CASE;
  END IF;
  PERFORM public.lms_append_audit(v_action,'reservation',NEW.id,v_title,v_actor,NEW.student_id,
   jsonb_build_object('fromStatus',v_previous,'toStatus',NEW.status,'expiresAt',NEW.expires_at));

 WHEN 'library_replacement_charges' THEN
  IF TG_OP='INSERT' THEN
   PERFORM public.lms_append_audit('replacement.assessed','replacement_charge',NEW.id,'Replacement charge',NEW.assessed_by,NEW.student_id,
    jsonb_build_object('amount',NEW.amount,'reason',NEW.reason));
  ELSIF OLD.settled_at IS NULL AND NEW.settled_at IS NOT NULL THEN
   PERFORM public.lms_append_audit('replacement.settled','replacement_charge',NEW.id,'Replacement charge',NEW.settled_by,NEW.student_id,
    jsonb_build_object('amount',NEW.amount,'reference',NEW.settlement_reference));
  END IF;
 END CASE;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.lms_audit_change() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER lms_audit_book AFTER INSERT OR UPDATE ON public.books FOR EACH ROW EXECUTE FUNCTION public.lms_audit_change();
CREATE TRIGGER lms_audit_loan AFTER INSERT OR UPDATE ON public.borrow_records FOR EACH ROW EXECUTE FUNCTION public.lms_audit_change();
CREATE TRIGGER lms_audit_reservation AFTER INSERT OR UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION public.lms_audit_change();
CREATE TRIGGER lms_audit_charge AFTER INSERT OR UPDATE ON public.library_replacement_charges FOR EACH ROW EXECUTE FUNCTION public.lms_audit_change();
NOTIFY pgrst,'reload schema';
COMMIT;
