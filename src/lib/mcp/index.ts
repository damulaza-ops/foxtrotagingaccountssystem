import { auth, defineMcp } from "@lovable.dev/mcp-js";
import agingSummaryTool from "./tools/aging-summary";
import customerStatementTool from "./tools/customer-statement";
import listCustomersTool from "./tools/list-customers";
import listInvoicesTool from "./tools/list-invoices";
import listPaymentsTool from "./tools/list-payments";
import logFollowUpTool from "./tools/log-follow-up";

const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "foxtrot-aging-accounts-system",
  title: "Foxtrot Accounts Flow",
  version: "0.1.0",
  instructions:
    "Tools for the Foxtrot Aging Accounts System (accounts receivable in Kenyan Shillings, KES). Use `list_customers` to find a customer id, `customer_statement` for a full account view, `list_invoices` and `list_payments` for detail, `aging_summary` for outstanding receivables by aging bucket, and `log_follow_up` to record a collections contact. All data is scoped to the signed-in user's permissions.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listCustomersTool,
    listInvoicesTool,
    agingSummaryTool,
    customerStatementTool,
    listPaymentsTool,
    logFollowUpTool,
  ],
});
