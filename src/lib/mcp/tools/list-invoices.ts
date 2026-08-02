import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, jsonResult, requireAuth } from "../supabase";

const STATUSES = [
  "current",
  "partially_paid",
  "overdue",
  "paid",
  "written_off",
  "cancelled",
  "unverified",
] as const;

export default defineTool({
  name: "list_invoices",
  title: "List invoices",
  description:
    "List invoices with amounts, due dates, payment status and outstanding balance. Optionally filter to overdue or unpaid invoices only.",
  inputSchema: {
    customer_id: z.string().uuid().optional().describe("Restrict to one customer."),
    status: z.enum(STATUSES).optional().describe("Filter by payment status."),
    unpaid_only: z.boolean().default(false).describe("Only invoices with an outstanding balance above zero."),
    overdue_only: z.boolean().default(false).describe("Only invoices past their due date and not fully paid."),
    limit: z.number().int().min(1).max(200).default(50),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ customer_id, status, unpaid_only, overdue_only, limit }, ctx) => {
    try {
      const supabase = requireAuth(ctx);
      let query = supabase
        .from("invoices")
        .select(
          "id, invoice_number, invoice_date, due_date, invoice_amount, amount_paid, outstanding_balance, payment_status, disputed, written_off, customers(id, customer_code, business_name)",
        )
        .order("due_date", { ascending: true })
        .limit(limit ?? 50);
      if (customer_id) query = query.eq("customer_id", customer_id);
      if (status) query = query.eq("payment_status", status);
      if (unpaid_only || overdue_only) query = query.gt("outstanding_balance", 0);
      if (overdue_only) query = query.lt("due_date", new Date().toISOString().slice(0, 10));
      const { data, error } = await query;
      if (error) return errorResult(error.message);
      return jsonResult({ count: data?.length ?? 0, currency: "KES", invoices: data ?? [] });
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
