import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { fetchCustomers, fetchSettings, qk, type Invoice } from "@/lib/data";
import { addDaysISO, todayISO } from "@/lib/format";

export function InvoiceDialog({
  open,
  onOpenChange,
  invoice,
  defaultCustomerId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  invoice?: Invoice | null;
  defaultCustomerId?: string;
}) {
  const queryClient = useQueryClient();
  const { data: customers = [] } = useQuery({ queryKey: qk.customers, queryFn: fetchCustomers });
  const { data: settings } = useQuery({ queryKey: qk.settings, queryFn: fetchSettings });

  const [customerId, setCustomerId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayISO());
  const [creditDays, setCreditDays] = useState(30);
  const [dueDate, setDueDate] = useState("");
  const [dueTouched, setDueTouched] = useState(false);
  const [amount, setAmount] = useState<string>("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      if (invoice) {
        setCustomerId(invoice.customer_id);
        setInvoiceNumber(invoice.invoice_number);
        setInvoiceDate(invoice.invoice_date);
        setCreditDays(invoice.credit_days);
        setDueDate(invoice.due_date);
        setDueTouched(true);
        setAmount(String(invoice.invoice_amount));
        setNotes(invoice.notes ?? "");
      } else {
        setCustomerId(defaultCustomerId ?? "");
        setInvoiceNumber("");
        setInvoiceDate(todayISO());
        setCreditDays(settings?.default_credit_days ?? 30);
        setDueDate("");
        setDueTouched(false);
        setAmount("");
        setNotes("");
      }
    }
  }, [open, invoice, defaultCustomerId, settings]);

  // When customer changes, pull their credit period
  useEffect(() => {
    if (!invoice && customerId) {
      const c = customers.find((c) => c.id === customerId);
      if (c) setCreditDays(c.credit_days);
    }
  }, [customerId, customers, invoice]);

  // Auto-calculate due date from invoice date + credit period
  useEffect(() => {
    if (!dueTouched && invoiceDate) {
      setDueDate(addDaysISO(invoiceDate, creditDays || 0));
    }
  }, [invoiceDate, creditDays, dueTouched]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!customerId) throw new Error("Select a customer");
      if (!invoiceNumber.trim()) throw new Error("Invoice number is required");
      const amt = Number(amount);
      if (!isFinite(amt) || amt <= 0) throw new Error("Enter a valid invoice amount");
      const { data: userData } = await supabase.auth.getUser();
      const payload = {
        invoice_number: invoiceNumber.trim(),
        customer_id: customerId,
        invoice_date: invoiceDate,
        credit_days: creditDays,
        due_date: dueDate || addDaysISO(invoiceDate, creditDays || 0),
        invoice_amount: amt,
        notes: notes.trim() || null,
      };
      if (invoice) {
        const { error } = await supabase.from("invoices").update(payload).eq("id", invoice.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("invoices")
          .insert({ ...payload, created_by: userData.user?.id ?? null });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.invoices });
      toast.success(invoice ? "Invoice updated" : "Invoice created");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{invoice ? "Edit invoice" : "New invoice"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Customer *</Label>
            <Select value={customerId} onValueChange={setCustomerId} disabled={!!invoice}>
              <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
              <SelectContent>
                {customers
                  .filter((c) => c.status !== "archived" || c.id === customerId)
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.business_name}
                      {c.branch_name ? ` — ${c.branch_name}` : ""}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Invoice number *</Label>
            <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder={(settings?.invoice_prefix ?? "INV-") + "0001"} />
          </div>
          <div className="space-y-1.5">
            <Label>Invoice date *</Label>
            <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Credit period (days)</Label>
            <Input type="number" min={0} value={creditDays} onChange={(e) => { setCreditDays(Number(e.target.value)); setDueTouched(false); }} />
          </div>
          <div className="space-y-1.5">
            <Label>Due date (auto)</Label>
            <Input type="date" value={dueDate} onChange={(e) => { setDueDate(e.target.value); setDueTouched(true); }} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Invoice amount (KES) *</Label>
            <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
