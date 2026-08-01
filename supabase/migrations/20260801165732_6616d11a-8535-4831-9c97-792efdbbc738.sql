-- 1. Preserve pre-existing (imported) paid amounts separately from recorded payments
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS opening_paid numeric NOT NULL DEFAULT 0;

UPDATE public.invoices i
SET opening_paid = GREATEST(
  i.amount_paid - COALESCE((
    SELECT SUM(pa.allocated_amount)
    FROM public.payment_allocations pa
    JOIN public.payments p ON p.id = pa.payment_id AND p.reversed = false
    WHERE pa.invoice_id = i.id
  ), 0), 0)
WHERE i.opening_paid = 0;

-- 2. recalc_invoice keeps opening_paid in the total
CREATE OR REPLACE FUNCTION public.recalc_invoice(_invoice_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE total_alloc numeric; total_paid numeric; inv record;
BEGIN
  SELECT COALESCE(SUM(pa.allocated_amount),0) INTO total_alloc
  FROM public.payment_allocations pa
  JOIN public.payments p ON p.id = pa.payment_id AND p.reversed = false
  WHERE pa.invoice_id = _invoice_id;

  SELECT * INTO inv FROM public.invoices WHERE id = _invoice_id;
  IF NOT FOUND THEN RETURN; END IF;

  total_paid := COALESCE(inv.opening_paid,0) + total_alloc;

  UPDATE public.invoices SET amount_paid = total_paid WHERE id = _invoice_id;

  IF inv.payment_status NOT IN ('written_off','cancelled') THEN
    UPDATE public.invoices SET payment_status =
      CASE
        WHEN inv.invoice_amount - total_paid <= 0 THEN 'paid'::public.payment_status
        WHEN CURRENT_DATE > inv.due_date THEN 'overdue'::public.payment_status
        WHEN total_paid > 0 THEN 'partially_paid'::public.payment_status
        ELSE 'current'::public.payment_status
      END
    WHERE id = _invoice_id;
  END IF;
END;
$function$;

-- 3. record_payment: validate every allocation
CREATE OR REPLACE FUNCTION public.record_payment(_customer_id uuid, _payment_date date, _amount numeric, _method payment_method, _receipt text, _reference text, _notes text, _allocations jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE pid uuid; a record; inv record; total numeric := 0; outstanding numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_manager(auth.uid()) THEN RAISE EXCEPTION 'Not authorised to record payments'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Payment amount must be positive'; END IF;
  IF _customer_id IS NULL THEN RAISE EXCEPTION 'Select a customer'; END IF;
  IF _allocations IS NULL OR jsonb_typeof(_allocations) <> 'array' OR jsonb_array_length(_allocations) = 0 THEN
    RAISE EXCEPTION 'Allocate the payment to at least one invoice';
  END IF;

  FOR a IN
    SELECT (e->>'invoice_id')::uuid AS invoice_id, SUM((e->>'amount')::numeric) AS amount
    FROM jsonb_array_elements(_allocations) e
    GROUP BY 1
  LOOP
    IF a.invoice_id IS NULL THEN RAISE EXCEPTION 'Allocation is missing an invoice'; END IF;
    IF a.amount IS NULL OR a.amount <= 0 THEN RAISE EXCEPTION 'Allocation amounts must be greater than zero'; END IF;

    SELECT * INTO inv FROM public.invoices WHERE id = a.invoice_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found for one of the allocations'; END IF;
    IF inv.customer_id <> _customer_id THEN
      RAISE EXCEPTION 'Invoice % belongs to a different customer', inv.invoice_number;
    END IF;
    IF inv.payment_status IN ('written_off','cancelled') THEN
      RAISE EXCEPTION 'Invoice % is % and cannot receive payments', inv.invoice_number, inv.payment_status;
    END IF;

    outstanding := inv.invoice_amount - inv.amount_paid;
    IF a.amount > outstanding + 0.005 THEN
      RAISE EXCEPTION 'Allocation of % to invoice % exceeds its outstanding balance of %', a.amount, inv.invoice_number, outstanding;
    END IF;

    total := total + a.amount;
  END LOOP;

  IF total > _amount + 0.005 THEN RAISE EXCEPTION 'Allocations exceed the payment amount'; END IF;

  INSERT INTO public.payments (customer_id, payment_date, amount, payment_method, receipt_number, reference_number, notes, created_by)
  VALUES (_customer_id, _payment_date, _amount, _method, NULLIF(_receipt,''), NULLIF(_reference,''), NULLIF(_notes,''), auth.uid())
  RETURNING id INTO pid;

  FOR a IN
    SELECT (e->>'invoice_id')::uuid AS invoice_id, SUM((e->>'amount')::numeric) AS amount
    FROM jsonb_array_elements(_allocations) e
    GROUP BY 1
  LOOP
    INSERT INTO public.payment_allocations (payment_id, invoice_id, allocated_amount)
    VALUES (pid, a.invoice_id, a.amount);
    PERFORM public.recalc_invoice(a.invoice_id);
  END LOOP;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_data)
  VALUES (auth.uid(), 'record_payment', 'payment', pid, jsonb_build_object('amount', _amount, 'allocations', _allocations));
  RETURN pid;
END;
$function$;

-- 4. refresh_invoice_statuses also settles paid invoices
CREATE OR REPLACE FUNCTION public.refresh_invoice_statuses()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE public.invoices SET payment_status =
    CASE
      WHEN invoice_amount - amount_paid <= 0 THEN 'paid'::public.payment_status
      WHEN CURRENT_DATE > due_date THEN 'overdue'::public.payment_status
      WHEN amount_paid > 0 THEN 'partially_paid'::public.payment_status
      ELSE 'current'::public.payment_status
    END
  WHERE payment_status NOT IN ('written_off','cancelled','unverified')
    AND payment_status IS DISTINCT FROM
      CASE
        WHEN invoice_amount - amount_paid <= 0 THEN 'paid'::public.payment_status
        WHEN CURRENT_DATE > due_date THEN 'overdue'::public.payment_status
        WHEN amount_paid > 0 THEN 'partially_paid'::public.payment_status
        ELSE 'current'::public.payment_status
      END;
$function$;

-- 5. Clearer not-found handling
CREATE OR REPLACE FUNCTION public.reverse_payment(_payment_id uuid, _reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_manager(auth.uid()) THEN RAISE EXCEPTION 'Not authorised to reverse payments'; END IF;
  SELECT * INTO r FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF r.reversed THEN RAISE EXCEPTION 'Payment already reversed'; END IF;

  UPDATE public.payments SET reversed = true, reversed_at = now(), reversed_by = auth.uid(),
    notes = COALESCE(notes,'') || ' [REVERSED: ' || COALESCE(_reason,'') || ']'
  WHERE id = _payment_id;

  PERFORM public.recalc_invoice(pa.invoice_id) FROM public.payment_allocations pa WHERE pa.payment_id = _payment_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, previous_data, new_data)
  VALUES (auth.uid(), 'reverse_payment', 'payment', _payment_id, to_jsonb(r), jsonb_build_object('reason', _reason));
END;
$function$;

CREATE OR REPLACE FUNCTION public.write_off_invoice(_invoice_id uuid, _reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_role(auth.uid(), 'administrator') THEN RAISE EXCEPTION 'Only administrators can write off balances'; END IF;
  SELECT * INTO r FROM public.invoices WHERE id = _invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF r.written_off THEN RAISE EXCEPTION 'Invoice already written off'; END IF;
  UPDATE public.invoices SET written_off = true, payment_status = 'written_off',
    notes = COALESCE(notes,'') || ' [WRITTEN OFF: ' || COALESCE(_reason,'') || ']'
  WHERE id = _invoice_id;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, previous_data, new_data)
  VALUES (auth.uid(), 'write_off', 'invoice', _invoice_id, to_jsonb(r), jsonb_build_object('reason', _reason));
END;
$function$;

SELECT public.refresh_invoice_statuses();