-- Roles
CREATE TYPE public.app_role AS ENUM ('administrator', 'accounts_manager', 'collections_officer', 'viewer');
CREATE TYPE public.payment_status AS ENUM ('current', 'partially_paid', 'overdue', 'paid', 'written_off', 'cancelled', 'unverified');
CREATE TYPE public.payment_method AS ENUM ('mpesa', 'bank_transfer', 'cash', 'cheque', 'other');
CREATE TYPE public.contact_method AS ENUM ('telephone', 'whatsapp', 'email', 'physical_visit', 'other');
CREATE TYPE public.follow_up_status AS ENUM ('no_response', 'promised_payment', 'partial_payment_expected', 'disputed_invoice', 'escalated', 'resolved');

-- profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- user_roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_manager(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('administrator','accounts_manager'))
$$;

-- Auto-create profile + role on signup; first user is administrator
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE user_count int;
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), COALESCE(NEW.email,''));
  SELECT count(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'administrator');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'viewer');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- customers
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_code TEXT NOT NULL UNIQUE,
  business_name TEXT NOT NULL,
  branch_name TEXT,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  location TEXT,
  credit_days INT NOT NULL DEFAULT 30,
  credit_limit NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- import_batches
CREATE TABLE public.import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  uploaded_by UUID REFERENCES auth.users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_rows INT NOT NULL DEFAULT 0,
  approved_rows INT NOT NULL DEFAULT 0,
  duplicate_rows INT NOT NULL DEFAULT 0,
  rejected_rows INT NOT NULL DEFAULT 0,
  warning_rows INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_batches TO authenticated;
GRANT ALL ON public.import_batches TO service_role;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

-- invoices
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  invoice_date DATE NOT NULL,
  due_date DATE NOT NULL,
  credit_days INT NOT NULL DEFAULT 30,
  invoice_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0,
  outstanding_balance NUMERIC(14,2) GENERATED ALWAYS AS (invoice_amount - amount_paid) STORED,
  payment_status public.payment_status NOT NULL DEFAULT 'current',
  disputed BOOLEAN NOT NULL DEFAULT false,
  written_off BOOLEAN NOT NULL DEFAULT false,
  import_batch_id UUID REFERENCES public.import_batches(id) ON DELETE SET NULL,
  source_sheet TEXT,
  source_row INT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_invoices_customer ON public.invoices(customer_id);
CREATE INDEX idx_invoices_due_date ON public.invoices(due_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- payments
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  payment_date DATE NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  payment_method public.payment_method NOT NULL DEFAULT 'mpesa',
  receipt_number TEXT,
  reference_number TEXT,
  notes TEXT,
  reversed BOOLEAN NOT NULL DEFAULT false,
  reversed_at TIMESTAMPTZ,
  reversed_by UUID REFERENCES auth.users(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_customer ON public.payments(customer_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- payment_allocations
CREATE TABLE public.payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  allocated_amount NUMERIC(14,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_alloc_payment ON public.payment_allocations(payment_id);
CREATE INDEX idx_alloc_invoice ON public.payment_allocations(invoice_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_allocations TO authenticated;
GRANT ALL ON public.payment_allocations TO service_role;
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;

-- follow_ups
CREATE TABLE public.follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  follow_up_date DATE NOT NULL DEFAULT CURRENT_DATE,
  contact_method public.contact_method NOT NULL DEFAULT 'telephone',
  contacted_person TEXT,
  notes TEXT,
  promise_to_pay_date DATE,
  promise_to_pay_amount NUMERIC(14,2),
  status public.follow_up_status NOT NULL DEFAULT 'no_response',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_followups_customer ON public.follow_ups(customer_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.follow_ups TO authenticated;
GRANT ALL ON public.follow_ups TO service_role;
ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;

-- import_rows
CREATE TABLE public.import_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id UUID NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
  sheet_name TEXT,
  source_row INT,
  raw_data JSONB,
  mapped_data JSONB,
  validation_status TEXT NOT NULL DEFAULT 'pending',
  validation_messages TEXT[],
  linked_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_rows TO authenticated;
GRANT ALL ON public.import_rows TO service_role;
ALTER TABLE public.import_rows ENABLE ROW LEVEL SECURITY;

-- audit_logs
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  previous_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- app_settings (single row)
CREATE TABLE public.app_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  company_name TEXT NOT NULL DEFAULT 'Foxtrot',
  company_logo_url TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  currency TEXT NOT NULL DEFAULT 'KES',
  default_credit_days INT NOT NULL DEFAULT 30,
  invoice_prefix TEXT NOT NULL DEFAULT 'INV-',
  receipt_prefix TEXT NOT NULL DEFAULT 'RCT-',
  aging_buckets JSONB NOT NULL DEFAULT '[{"label":"Current","min":null,"max":0},{"label":"1-7 days","min":1,"max":7},{"label":"8-14 days","min":8,"max":14},{"label":"15-30 days","min":15,"max":30},{"label":"31-60 days","min":31,"max":60},{"label":"61-90 days","min":61,"max":90},{"label":"90+ days","min":91,"max":null}]',
  urgency_rules JSONB NOT NULL DEFAULT '[{"label":"Current","min":null,"max":0},{"label":"Low","min":1,"max":7},{"label":"Medium","min":8,"max":30},{"label":"High","min":31,"max":60},{"label":"Critical","min":61,"max":null}]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
INSERT INTO public.app_settings (id) VALUES (1);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_invoices_updated BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Recompute invoice payment state from allocations
CREATE OR REPLACE FUNCTION public.recalc_invoice(_invoice_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE total_alloc numeric; inv record;
BEGIN
  SELECT COALESCE(SUM(pa.allocated_amount),0) INTO total_alloc
  FROM public.payment_allocations pa
  JOIN public.payments p ON p.id = pa.payment_id AND p.reversed = false
  WHERE pa.invoice_id = _invoice_id;

  UPDATE public.invoices SET amount_paid = total_alloc WHERE id = _invoice_id;
  SELECT * INTO inv FROM public.invoices WHERE id = _invoice_id;

  IF inv.payment_status NOT IN ('written_off','cancelled') THEN
    UPDATE public.invoices SET payment_status =
      CASE
        WHEN inv.invoice_amount - total_alloc <= 0 THEN 'paid'::public.payment_status
        WHEN total_alloc > 0 AND CURRENT_DATE > inv.due_date THEN 'overdue'::public.payment_status
        WHEN total_alloc > 0 THEN 'partially_paid'::public.payment_status
        WHEN CURRENT_DATE > inv.due_date THEN 'overdue'::public.payment_status
        ELSE 'current'::public.payment_status
      END
    WHERE id = _invoice_id;
  END IF;
END;
$$;

-- Record payment with allocations atomically
CREATE OR REPLACE FUNCTION public.record_payment(
  _customer_id uuid, _payment_date date, _amount numeric, _method public.payment_method,
  _receipt text, _reference text, _notes text, _allocations jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid; alloc jsonb; total numeric := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_manager(auth.uid()) THEN RAISE EXCEPTION 'Not authorised to record payments'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'Payment amount must be positive'; END IF;

  FOR alloc IN SELECT * FROM jsonb_array_elements(_allocations) LOOP
    total := total + (alloc->>'amount')::numeric;
  END LOOP;
  IF total > _amount THEN RAISE EXCEPTION 'Allocations exceed payment amount'; END IF;

  INSERT INTO public.payments (customer_id, payment_date, amount, payment_method, receipt_number, reference_number, notes, created_by)
  VALUES (_customer_id, _payment_date, _amount, _method, _receipt, _reference, _notes, auth.uid())
  RETURNING id INTO pid;

  FOR alloc IN SELECT * FROM jsonb_array_elements(_allocations) LOOP
    INSERT INTO public.payment_allocations (payment_id, invoice_id, allocated_amount)
    VALUES (pid, (alloc->>'invoice_id')::uuid, (alloc->>'amount')::numeric);
    PERFORM public.recalc_invoice((alloc->>'invoice_id')::uuid);
  END LOOP;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_data)
  VALUES (auth.uid(), 'record_payment', 'payment', pid, jsonb_build_object('amount', _amount, 'allocations', _allocations));
  RETURN pid;
END;
$$;

-- Reverse payment with audit trail
CREATE OR REPLACE FUNCTION public.reverse_payment(_payment_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_manager(auth.uid()) THEN RAISE EXCEPTION 'Not authorised to reverse payments'; END IF;
  SELECT * INTO r FROM public.payments WHERE id = _payment_id;
  IF r IS NULL THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF r.reversed THEN RAISE EXCEPTION 'Payment already reversed'; END IF;

  UPDATE public.payments SET reversed = true, reversed_at = now(), reversed_by = auth.uid(),
    notes = COALESCE(notes,'') || ' [REVERSED: ' || COALESCE(_reason,'') || ']'
  WHERE id = _payment_id;

  PERFORM public.recalc_invoice(pa.invoice_id) FROM public.payment_allocations pa WHERE pa.payment_id = _payment_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, previous_data, new_data)
  VALUES (auth.uid(), 'reverse_payment', 'payment', _payment_id, to_jsonb(r), jsonb_build_object('reason', _reason));
END;
$$;

-- Write off invoice (admin only)
CREATE OR REPLACE FUNCTION public.write_off_invoice(_invoice_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'administrator') THEN RAISE EXCEPTION 'Only administrators can write off balances'; END IF;
  SELECT * INTO r FROM public.invoices WHERE id = _invoice_id;
  IF r IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  UPDATE public.invoices SET written_off = true, payment_status = 'written_off',
    notes = COALESCE(notes,'') || ' [WRITTEN OFF: ' || COALESCE(_reason,'') || ']'
  WHERE id = _invoice_id;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, previous_data, new_data)
  VALUES (auth.uid(), 'write_off', 'invoice', _invoice_id, to_jsonb(r), jsonb_build_object('reason', _reason));
END;
$$;

-- Refresh overdue statuses (called on app load)
CREATE OR REPLACE FUNCTION public.refresh_invoice_statuses()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.invoices SET payment_status = 'overdue'
  WHERE payment_status IN ('current','partially_paid')
    AND invoice_amount - amount_paid > 0 AND CURRENT_DATE > due_date;
  UPDATE public.invoices SET payment_status = CASE WHEN amount_paid > 0 THEN 'partially_paid'::public.payment_status ELSE 'current'::public.payment_status END
  WHERE payment_status = 'overdue' AND invoice_amount - amount_paid > 0 AND CURRENT_DATE <= due_date;
$$;

-- RLS POLICIES
-- profiles
CREATE POLICY "Authenticated can view profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Admins update any profile" ON public.profiles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'administrator'));

-- user_roles
CREATE POLICY "Authenticated can view roles" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'administrator')) WITH CHECK (public.has_role(auth.uid(),'administrator'));

-- customers
CREATE POLICY "Authenticated view customers" ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Managers insert customers" ON public.customers FOR INSERT TO authenticated WITH CHECK (public.is_manager(auth.uid()));
CREATE POLICY "Managers update customers" ON public.customers FOR UPDATE TO authenticated USING (public.is_manager(auth.uid()));
CREATE POLICY "Admins delete customers" ON public.customers FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'administrator'));

-- invoices
CREATE POLICY "Authenticated view invoices" ON public.invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Managers insert invoices" ON public.invoices FOR INSERT TO authenticated WITH CHECK (public.is_manager(auth.uid()));
CREATE POLICY "Managers update invoices" ON public.invoices FOR UPDATE TO authenticated USING (public.is_manager(auth.uid()));
CREATE POLICY "Admins delete invoices" ON public.invoices FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'administrator'));

-- payments
CREATE POLICY "Authenticated view payments" ON public.payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Managers insert payments" ON public.payments FOR INSERT TO authenticated WITH CHECK (public.is_manager(auth.uid()));
CREATE POLICY "Managers update payments" ON public.payments FOR UPDATE TO authenticated USING (public.is_manager(auth.uid()));

-- payment_allocations
CREATE POLICY "Authenticated view allocations" ON public.payment_allocations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Managers insert allocations" ON public.payment_allocations FOR INSERT TO authenticated WITH CHECK (public.is_manager(auth.uid()));

-- follow_ups
CREATE POLICY "Authenticated view follow_ups" ON public.follow_ups FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff insert follow_ups" ON public.follow_ups FOR INSERT TO authenticated WITH CHECK (public.is_manager(auth.uid()) OR public.has_role(auth.uid(),'collections_officer'));
CREATE POLICY "Staff update follow_ups" ON public.follow_ups FOR UPDATE TO authenticated USING (public.is_manager(auth.uid()) OR public.has_role(auth.uid(),'collections_officer'));

-- import_batches / import_rows
CREATE POLICY "Authenticated view import_batches" ON public.import_batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Managers manage import_batches" ON public.import_batches FOR ALL TO authenticated USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));
CREATE POLICY "Authenticated view import_rows" ON public.import_rows FOR SELECT TO authenticated USING (true);
CREATE POLICY "Managers manage import_rows" ON public.import_rows FOR ALL TO authenticated USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

-- audit_logs
CREATE POLICY "Managers view audit_logs" ON public.audit_logs FOR SELECT TO authenticated USING (public.is_manager(auth.uid()));
CREATE POLICY "Authenticated insert audit_logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- app_settings
CREATE POLICY "Authenticated view settings" ON public.app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins update settings" ON public.app_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'administrator'));