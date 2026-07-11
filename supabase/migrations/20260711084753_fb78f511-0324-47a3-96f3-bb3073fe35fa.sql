REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_manager(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.recalc_invoice(uuid) FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_payment(uuid, date, numeric, public.payment_method, text, text, text, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.reverse_payment(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.write_off_invoice(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.refresh_invoice_statuses() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, public, authenticated;