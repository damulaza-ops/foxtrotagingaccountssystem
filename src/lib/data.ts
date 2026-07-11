import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Customer = Tables<"customers">;
export type Invoice = Tables<"invoices">;
export type Payment = Tables<"payments">;
export type FollowUp = Tables<"follow_ups">;
export type Profile = Tables<"profiles">;
export type AppSettings = Tables<"app_settings">;

export type InvoiceWithCustomer = Invoice & { customers: Customer | null };
export type PaymentWithDetails = Payment & {
  customers: Customer | null;
  payment_allocations: (Tables<"payment_allocations"> & { invoices: Invoice | null })[];
};
export type FollowUpWithDetails = FollowUp & { customers: Customer | null; invoices: Invoice | null };

export async function fetchCustomers(): Promise<Customer[]> {
  const { data, error } = await supabase.from("customers").select("*").order("business_name");
  if (error) throw error;
  return data;
}

export async function fetchInvoices(): Promise<InvoiceWithCustomer[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select("*, customers(*)")
    .order("invoice_date", { ascending: false })
    .limit(5000);
  if (error) throw error;
  return data as InvoiceWithCustomer[];
}

export async function fetchPayments(): Promise<PaymentWithDetails[]> {
  const { data, error } = await supabase
    .from("payments")
    .select("*, customers(*), payment_allocations(*, invoices(*))")
    .order("payment_date", { ascending: false })
    .limit(5000);
  if (error) throw error;
  return data as PaymentWithDetails[];
}

export async function fetchFollowUps(): Promise<FollowUpWithDetails[]> {
  const { data, error } = await supabase
    .from("follow_ups")
    .select("*, customers(*), invoices(*)")
    .order("follow_up_date", { ascending: false })
    .limit(2000);
  if (error) throw error;
  return data as FollowUpWithDetails[];
}

export async function fetchSettings(): Promise<AppSettings> {
  const { data, error } = await supabase.from("app_settings").select("*").eq("id", 1).single();
  if (error) throw error;
  return data;
}

export async function refreshStatuses() {
  await supabase.rpc("refresh_invoice_statuses");
}

export const qk = {
  customers: ["customers"] as const,
  invoices: ["invoices"] as const,
  payments: ["payments"] as const,
  followUps: ["follow_ups"] as const,
  settings: ["app_settings"] as const,
  profiles: ["profiles"] as const,
};
