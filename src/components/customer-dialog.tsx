import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { qk, type Customer } from "@/lib/data";

const empty = {
  customer_code: "",
  business_name: "",
  branch_name: "",
  contact_person: "",
  phone: "",
  email: "",
  location: "",
  credit_days: 30,
  credit_limit: 0,
  opening_balance: 0,
  status: "active",
  notes: "",
};

export function CustomerDialog({
  open,
  onOpenChange,
  customer,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  customer?: Customer | null;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<typeof empty>(empty);

  useEffect(() => {
    if (open) {
      setForm(
        customer
          ? {
              customer_code: customer.customer_code,
              business_name: customer.business_name,
              branch_name: customer.branch_name ?? "",
              contact_person: customer.contact_person ?? "",
              phone: customer.phone ?? "",
              email: customer.email ?? "",
              location: customer.location ?? "",
              credit_days: customer.credit_days,
              credit_limit: Number(customer.credit_limit),
              opening_balance: Number(customer.opening_balance ?? 0),
              status: customer.status,
              notes: customer.notes ?? "",
            }
          : empty,
      );
    }
  }, [open, customer]);

  const set = (k: keyof typeof empty, v: string | number) => setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: async () => {
      if (!form.business_name.trim()) throw new Error("Business name is required");
      const code =
        form.customer_code.trim() ||
        "C" + Date.now().toString().slice(-6);
      const payload = {
        customer_code: code,
        business_name: form.business_name.trim(),
        branch_name: form.branch_name.trim() || null,
        contact_person: form.contact_person.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        location: form.location.trim() || null,
        credit_days: Number(form.credit_days) || 0,
        credit_limit: Number(form.credit_limit) || 0,
        status: form.status,
        notes: form.notes.trim() || null,
      };
      if (customer) {
        const { error } = await supabase.from("customers").update(payload).eq("id", customer.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("customers").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.customers });
      toast.success(customer ? "Customer updated" : "Customer added");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{customer ? "Edit customer" : "Add customer"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Customer code</Label>
            <Input value={form.customer_code} onChange={(e) => set("customer_code", e.target.value)} placeholder="Auto if blank" />
          </div>
          <div className="space-y-1.5">
            <Label>Business name *</Label>
            <Input value={form.business_name} onChange={(e) => set("business_name", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Branch name</Label>
            <Input value={form.branch_name} onChange={(e) => set("branch_name", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Contact person</Label>
            <Input value={form.contact_person} onChange={(e) => set("contact_person", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Telephone</Label>
            <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Location</Label>
            <Input value={form.location} onChange={(e) => set("location", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Credit period (days)</Label>
            <Input type="number" min={0} value={form.credit_days} onChange={(e) => set("credit_days", Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label>Credit limit (KES)</Label>
            <Input type="number" min={0} value={form.credit_limit} onChange={(e) => set("credit_limit", Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="on_hold">On hold</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
