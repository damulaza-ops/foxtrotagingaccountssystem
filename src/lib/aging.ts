import type { Tables } from "@/integrations/supabase/types";

export type Invoice = Tables<"invoices">;

/** Days past due date (0 or negative = not overdue). */
export function daysOverdue(dueDate: string, asOf?: Date): number {
  const due = new Date(dueDate + "T00:00:00");
  const now = asOf ?? new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((today.getTime() - due.getTime()) / 86400000);
}

export const AGING_BUCKETS = [
  "Current",
  "1–7 days",
  "8–14 days",
  "15–30 days",
  "31–60 days",
  "61–90 days",
  "90+ days",
] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

export function agingBucket(days: number): AgingBucket {
  if (days <= 0) return "Current";
  if (days <= 7) return "1–7 days";
  if (days <= 14) return "8–14 days";
  if (days <= 30) return "15–30 days";
  if (days <= 60) return "31–60 days";
  if (days <= 90) return "61–90 days";
  return "90+ days";
}

export const URGENCY_LEVELS = ["Current", "Low", "Medium", "High", "Critical"] as const;
export type Urgency = (typeof URGENCY_LEVELS)[number];

export function urgency(days: number): Urgency {
  if (days <= 0) return "Current";
  if (days <= 7) return "Low";
  if (days <= 30) return "Medium";
  if (days <= 60) return "High";
  return "Critical";
}

/** An invoice is overdue only when outstanding > 0 AND past due date. */
export function isOverdue(inv: Pick<Invoice, "due_date" | "outstanding_balance" | "payment_status">): boolean {
  if (inv.payment_status === "written_off" || inv.payment_status === "cancelled") return false;
  return (inv.outstanding_balance ?? 0) > 0 && daysOverdue(inv.due_date) > 0;
}

export type DisplayStatus =
  | "current"
  | "partially_paid"
  | "overdue"
  | "paid"
  | "written_off"
  | "cancelled"
  | "unverified";

/** Derived, always-fresh status regardless of stale stored status. */
export function displayStatus(inv: Pick<Invoice, "due_date" | "outstanding_balance" | "amount_paid" | "invoice_amount" | "payment_status">): DisplayStatus {
  const s = inv.payment_status;
  if (s === "written_off" || s === "cancelled" || s === "unverified") return s;
  const out = inv.outstanding_balance ?? inv.invoice_amount - inv.amount_paid;
  if (out <= 0) return "paid";
  if (daysOverdue(inv.due_date) > 0) return "overdue";
  if (inv.amount_paid > 0) return "partially_paid";
  return "current";
}

export const STATUS_LABELS: Record<DisplayStatus, string> = {
  current: "Current",
  partially_paid: "Partially paid",
  overdue: "Overdue",
  paid: "Paid",
  written_off: "Written off",
  cancelled: "Cancelled",
  unverified: "Requires verification",
};
