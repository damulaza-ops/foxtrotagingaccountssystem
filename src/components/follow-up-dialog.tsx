import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { fetchCustomers, fetchInvoices, qk } from "@/lib/data";
import { todayISO } from "@/lib/format";

const METHODS = [
  { value: "telephone", label: "Telephone" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "physical_visit", label: "Physical visit" },
  { value: "other", label: "Other" },
];
const STATUSES = [
  { value: "no_response", label: "No response" },
  { value: "promised_payment", label: "Promised payment" },
  { value: "partial_payment_expected", label: "Partial payment expected" },
  { value: "disputed_invoice", label: "Disputed invoice" },
  { value: "escalated", label: "Escalated" },
  { value: "resolved", label: "Resolved" },
];

export function FollowUpDialog({
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
  const [invoiceId, setInvoiceId] = useState<string>("none");
  const [date, setDate] = useState(todayISO());
  const [contactMethod, setContactMethod] = useState("telephone");
  const [contactedPerson, setContactedPerson] = useState("");
  const [notes, setNotes] = useState("");
  const [promiseDate, setPromiseDate] = useState("");
  const [promiseAmount, setPromiseAmount] = useState("");
  const [status, setStatus] = useState("no_response");

  useEffect(() => {
    if (open) {
      setCustomerId(defaultCustomerId ?? "");
      setInvoiceId(defaultInvoiceId ?? "none");
      setDate(todayISO());
      setContactMethod("telephone");
      setContactedPerson("");
      setNotes("");
      setPromiseDate("");
      setPromiseAmount("");
      setStatus("no_response");
    }
  }, [open, defaultCustomerId, defaultInvoiceId]);

  const customerInvoices = invoices.filter((i) => i.customer_id === customerId);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!customerId) throw new Error("Select a customer");
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("follow_ups").insert({
        customer_id: customerId,
        invoice_id: invoiceId === "none" ? null : invoiceId,
        follow_up_date: date,
        contact_method: contactMethod as "telephone",
        contacted_person: contactedPerson.trim() || null,
        notes: notes.trim() || null,
        promise_to_pay_date: promiseDate || null,
        promise_to_pay_amount: promiseAmount ? Number(promiseAmount) : null,
        status: status as "no_response",
        created_by: userData.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.followUps });
      toast.success("Follow-up recorded");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add follow-up</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Customer *</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.business_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Invoice (optional)</Label>
            <Select value={invoiceId} onValueChange={setInvoiceId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Whole account</SelectItem>
                {customerInvoices.map((i) => (
                  <SelectItem key={i.id} value={i.id}>{i.invoice_number}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Follow-up date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Contact method</Label>
            <Select value={contactMethod} onValueChange={setContactMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {METHODS.map((m) => (<SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Contacted person</Label>
            <Input value={contactedPerson} onChange={(e) => setContactedPerson(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (<SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Promise-to-pay date</Label>
            <Input type="date" value={promiseDate} onChange={(e) => setPromiseDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Promise-to-pay amount</Label>
            <Input type="number" min={0} step="0.01" value={promiseAmount} onChange={(e) => setPromiseAmount(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Notes</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save follow-up"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
