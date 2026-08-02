import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, jsonResult, requireAuth } from "../supabase";

const BUCKETS = [
  { label: "Current", min: -Infinity, max: 0 },
  { label: "1-7 days", min: 1, max: 7 },
  { label: "8-14 days", min: 8, max: 14 },
  { label: "15-30 days", min: 15, max: 30 },
  { label: "31-60 days", min: 31, max: 60 },
  { label: "61-90 days", min: 61, max: 90 },
  { label: "90+ days", min: 91, max: Infinity },
];

export default defineTool({
  name: "aging_summary",
  title: "Aging summary",
  description:
    "Total outstanding receivables in KES broken down by aging bucket (Current, 1-7, 8-14, 15-30, 31-60, 61-90, 90+ days past due), optionally for a single customer.",
  inputSchema: {
    customer_id: z.string().uuid().optional().describe("Restrict the summary to one customer."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ customer_id }, ctx) => {
    try {
      const supabase = requireAuth(ctx);
      let query = supabase
        .from("invoices")
        .select("due_date, outstanding_balance, customer_id")
        .gt("outstanding_balance", 0)
        .not("payment_status", "in", "(paid,written_off,cancelled)")
        .limit(5000);
      if (customer_id) query = query.eq("customer_id", customer_id);
      const { data, error } = await query;
      if (error) return errorResult(error.message);

      const today = Date.now();
      const totals = BUCKETS.map((b) => ({ bucket: b.label, invoices: 0, amount: 0 }));
      let total = 0;
      for (const row of data ?? []) {
        const amount = Number(row.outstanding_balance ?? 0);
        const daysPastDue = Math.floor((today - new Date(row.due_date).getTime()) / 86_400_000);
        const index = BUCKETS.findIndex((b) => daysPastDue >= b.min && daysPastDue <= b.max);
        const target = totals[index === -1 ? 0 : index]!;
        target.invoices += 1;
        target.amount = Math.round((target.amount + amount) * 100) / 100;
        total += amount;
      }
      return jsonResult({
        currency: "KES",
        total_outstanding: Math.round(total * 100) / 100,
        open_invoices: data?.length ?? 0,
        buckets: totals,
      });
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
