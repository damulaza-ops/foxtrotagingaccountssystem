import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, jsonResult, requireAuth } from "../supabase";

export default defineTool({
  name: "list_customers",
  title: "List customers",
  description: "Search and list customers with their code, contact details, credit terms and status.",
  inputSchema: {
    search: z.string().trim().optional().describe("Match against business name, branch or customer code."),
    status: z.string().trim().optional().describe("Filter by status, e.g. Active or Inactive."),
    limit: z.number().int().min(1).max(200).default(50),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, status, limit }, ctx) => {
    try {
      const supabase = requireAuth(ctx);
      let query = supabase
        .from("customers")
        .select(
          "id, customer_code, business_name, branch_name, contact_person, phone, email, location, credit_days, credit_limit, opening_balance, status",
        )
        .order("business_name")
        .limit(limit ?? 50);
      if (search) {
        const s = search.replace(/[,%]/g, " ");
        query = query.or(
          `business_name.ilike.%${s}%,branch_name.ilike.%${s}%,customer_code.ilike.%${s}%`,
        );
      }
      if (status) query = query.eq("status", status);
      const { data, error } = await query;
      if (error) return errorResult(error.message);
      return jsonResult({ count: data?.length ?? 0, customers: data ?? [] });
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
