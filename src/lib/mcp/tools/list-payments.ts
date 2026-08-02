import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, jsonResult, requireAuth } from "../supabase";

export default defineTool({
  name: "list_payments",
  title: "List payments",
  description: "List recent customer payments in KES, including method, reference and whether the payment was reversed.",
  inputSchema: {
    customer_id: z.string().uuid().optional().describe("Restrict to one customer."),
    from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Earliest payment date (YYYY-MM-DD)."),
    to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Latest payment date (YYYY-MM-DD)."),
    include_reversed: z.boolean().default(false),
    limit: z.number().int().min(1).max(200).default(50),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ customer_id, from_date, to_date, include_reversed, limit }, ctx) => {
    try {
      const supabase = requireAuth(ctx);
      let query = supabase
        .from("payments")
        .select(
          "id, payment_date, amount, payment_method, reference_number, receipt_number, reversed, notes, customers(id, customer_code, business_name)",
        )
        .order("payment_date", { ascending: false })
        .limit(limit ?? 50);
      if (customer_id) query = query.eq("customer_id", customer_id);
      if (from_date) query = query.gte("payment_date", from_date);
      if (to_date) query = query.lte("payment_date", to_date);
      if (!include_reversed) query = query.eq("reversed", false);
      const { data, error } = await query;
      if (error) return errorResult(error.message);
      const total = (data ?? []).reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
      return jsonResult({
        currency: "KES",
        count: data?.length ?? 0,
        total_amount: Math.round(total * 100) / 100,
        payments: data ?? [],
      });
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
