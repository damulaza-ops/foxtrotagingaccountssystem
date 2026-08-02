import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, jsonResult, requireAuth } from "../supabase";

export default defineTool({
  name: "log_follow_up",
  title: "Log collection follow-up",
  description:
    "Record a collections follow-up against a customer (and optionally a specific invoice): how they were contacted, the outcome and any promise to pay.",
  inputSchema: {
    customer_id: z.string().uuid().describe("Customer the follow-up relates to."),
    invoice_id: z.string().uuid().optional().describe("Specific invoice, if the follow-up is invoice-level."),
    contact_method: z.enum(["telephone", "whatsapp", "email", "physical_visit", "other"]).default("telephone"),
    status: z
      .enum(["no_response", "promised_payment", "partial_payment_expected", "disputed_invoice", "escalated", "resolved"])
      .default("no_response"),
    contacted_person: z.string().trim().optional(),
    notes: z.string().trim().optional().describe("What was discussed."),
    promise_to_pay_amount: z.number().nonnegative().optional().describe("Amount promised, in KES."),
    promise_to_pay_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    follow_up_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Defaults to today."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    try {
      const supabase = requireAuth(ctx);
      const { data, error } = await supabase
        .from("follow_ups")
        .insert({
          customer_id: input.customer_id,
          invoice_id: input.invoice_id ?? null,
          contact_method: input.contact_method,
          status: input.status,
          contacted_person: input.contacted_person ?? null,
          notes: input.notes ?? null,
          promise_to_pay_amount: input.promise_to_pay_amount ?? null,
          promise_to_pay_date: input.promise_to_pay_date ?? null,
          follow_up_date: input.follow_up_date ?? new Date().toISOString().slice(0, 10),
          created_by: ctx.getUserId(),
        })
        .select()
        .single();
      if (error) {
        return errorResult(
          error.message.includes("row-level security")
            ? "You don't have permission to log follow-ups — ask an administrator to grant you access."
            : error.message,
        );
      }
      return jsonResult({ follow_up: data });
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
