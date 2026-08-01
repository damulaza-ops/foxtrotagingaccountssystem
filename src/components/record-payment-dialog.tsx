import { useEffect, useMemo, useState } from "react";
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
import { fetchCustomers, fetchInvoices, qk } from "@/lib/data";
import { fmtKES, todayISO } from "@/lib/format";
import { daysOverdue } from "@/lib/aging";

const METHODS = [
  { value: "mpesa", label: "M-Pesa" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
] as const;

export function RecordPaymentDialog({
  open,
  onOpenChange,
  defaultCustomerId,
  defaultInvoiceId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultCustomerId?: string;
  defaultInvoiceId?: string;
}) {
  const queryClient = useQueryClient();
  const { data: customers = [] } = useQuery({ queryKey: qk.customers, queryFn: fetchCustomers });
  const { data: invoices = [] } = useQuery({ queryKey: qk.invoices, queryFn: fetchInvoices });

  const [customerId, setCustomerId] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState<string>("mpesa");
  const [receipt, setReceipt] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [alloc, setAlloc] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setCustomerId(defaultCustomerId ?? "");
      setPaymentDate(todayISO());
      setAmount("");
      setMethod("mpesa");
      setReceipt("");
      setReference("");
      setNotes("");
      setAlloc(defaultInvoiceId ? { [defaultInvoiceId]: "" } : {});
    }
  }, [open, defaultCustomerId, defaultInvoiceId]);

  const openInvoices = useMemo(
    () =>
      invoices
        .filter(
          (i) =>
            i.customer_id === customerId &&
            (i.outstanding_balance ?? 0) > 0 &&
            i.payment_status !== "written_off" &&
            i.payment_status !== "cancelled",
        )
        .sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [invoices, customerId],
  );

  const allocTotal = Object.values(alloc).reduce((s, v) => s + (Number(v) || 0), 0);
  const payAmount = Number(amount) || 0;

  function autoAllocate() {
    let remaining = payAmount;
    const next: Record<string, string> = {};
    for (const inv of openInvoices) {
      if (remaining <= 0) break;
      const out = Number(inv.outstanding_balance ?? 0);
      const use = Math.min(out, remaining);
      if (use > 0) next[inv.id] = use.toFixed(2);
      remaining -= use;
    }
    setAlloc(next);
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (!customerId) throw new Error("Select a customer");
      if (payAmount <= 0) throw new Error("Enter a valid payment amount");
      const allocations = Object.entries(alloc)
        .map(([invoice_id, v]) => ({ invoice_id, amount: Number(v) || 0 }))
        .filter((a) => a.amount > 0);
      if (allocations.length === 0) throw new Error("Allocate the payment to at least one invoice");
      if (allocTotal > payAmount + 0.005) throw new Error("Allocations exceed the payment amount");
      for (const a of allocations) {
        const inv = openInvoices.find((i) => i.id === a.invoice_id);
        if (inv && a.amount > Number(inv.outstanding_balance ?? 0) + 0.005)
          throw new Error(`Allocation for ${inv.invoice_number} exceeds its outstanding balance`);
      }
      const { error } = await supabase.rpc("record_payment", {
        _customer_id: customerId,
        _payment_date: paymentDate,
        _amount: payAmount,
        _method: method as "mpesa",
        _receipt: receipt.trim(),
        _reference: reference.trim(),
        _notes: notes.trim(),
        _allocations: allocations,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.invoices });
      queryClient.invalidateQueries({ queryKey: qk.payments });
      toast.success("Payment recorded");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Customer *</Label>
            <Select value={customerId} onValueChange={(v) => { setCustomerId(v); setAlloc({}); }}>
              <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.business_name}{c.branch_name ? ` — ${c.branch_name}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Payment date *</Label>
            <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Amount (KES) *</Label>
            <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Payment method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Receipt number</Label>
            <Input value={receipt} onChange={(e) => setReceipt(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Transaction reference</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
        </div>

        {customerId && (
          <div className="mt-2">
            <div className="mb-2 flex items-center justify-between">
              <Label>Allocate to invoices</Label>
              <Button type="button" size="sm" variant="outline" onClick={autoAllocate} disabled={payAmount <= 0}>
                Auto-allocate (oldest first)
              </Button>
            </div>
            {openInvoices.length === 0 ? (
              <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                This customer has no open invoices.
              </p>
            ) : (
              <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border p-2">
                {openInvoices.map((inv) => (
                  <div key={inv.id} className="flex items-center gap-2 text-sm">
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">{inv.invoice_number}</p>
                      <p className="text-xs text-muted-foreground">
                        Due {inv.due_date}
                        {daysOverdue(inv.due_date) > 0 ? ` · ${daysOverdue(inv.due_date)}d overdue` : ""} · Outstanding {fmtKES(Number(inv.outstanding_balance))}
                      </p>
                    </div>
                    <Input
                      className="w-32"
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="0.00"
                      value={alloc[inv.id] ?? ""}
                      onChange={(e) => setAlloc((a) => ({ ...a, [inv.id]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Allocated {fmtKES(allocTotal)} of {fmtKES(payAmount)}
              {allocTotal > payAmount ? " — exceeds payment!" : ""}
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Recording…" : "Record payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
