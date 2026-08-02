import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, jsonResult, requireAuth } from "../supabase";

export default defineTool({
  name: "customer_statement",
  title: "Customer statement",
  description:
    "Full account statement for one customer: profile, all invoices, payments received and follow-up history, with the total outstanding balance in KES.",
  inputSchema: {
    customer_id: z.string().uuid().describe("Customer id, e.g. from list_customers."),
    invoice_limit: z.number().int().min(1).max(500).default(100),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ customer_id, invoice_limit }, ctx) => {
    try {
      const supabase = requireAuth(ctx);
      const [customerRes, invoicesRes, paymentsRes, followUpsRes] = await Promise.all([
        supabase.from("customers").select("*").eq("id", customer_id).maybeSingle(),
        supabase
          .from("invoices")
          .select(
            "id, invoice_number, invoice_date, due_date, invoice_amount, amount_paid, outstanding_balance, payment_status, disputed, written_off",
          )
          .eq("customer_id", customer_id)
          .order("invoice_date", { ascending: false })
          .limit(invoice_limit ?? 100),
        supabase
          .from("payments")
          .select("id, payment_date, amount, payment_method, reference_number, receipt_number, reversed, notes")
          .eq("customer_id", customer_id)
          .order("payment_date", { ascending: false })
          .limit(100),
        supabase
          .from("follow_ups")
          .select("id, follow_up_date, contact_method, contacted_person, status, promise_to_pay_amount, promise_to_pay_date, notes")
          .eq("customer_id", customer_id)
          .order("follow_up_date", { ascending: false })
          .limit(50),
      ]);

      const firstError = customerRes.error ?? invoicesRes.error ?? paymentsRes.error ?? followUpsRes.error;
      if (firstError) return errorResult(firstError.message);
      if (!customerRes.data) return errorResult("Customer not found or not visible to this account.");

      const outstanding = (invoicesRes.data ?? []).reduce(
        (sum, i) => sum + Number(i.outstanding_balance ?? 0),
        0,
      );

      return jsonResult({
        currency: "KES",
        customer: customerRes.data,
        total_outstanding: Math.round(outstanding * 100) / 100,
        invoices: invoicesRes.data ?? [],
        payments: paymentsRes.data ?? [],
        follow_ups: followUpsRes.data ?? [],
      });
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
