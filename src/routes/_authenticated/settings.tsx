import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PageHeader, LoadingRows } from "@/components/page-blocks";
import { supabase } from "@/integrations/supabase/client";
import { fetchSettings, qk } from "@/lib/data";
import { AGING_BUCKETS } from "@/lib/aging";
import { useAuthz } from "@/hooks/use-authz";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Foxtrot Aging Accounts" },
      { name: "description", content: "Configure company details, invoice numbering, credit terms and aging rules." },
      { property: "og:title", content: "Settings — Foxtrot Aging Accounts" },
      { property: "og:description", content: "Configure company details, invoice numbering, credit terms and aging rules." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const queryClient = useQueryClient();
  const { isAdmin } = useAuthz();
  const { data: settings, isLoading } = useQuery({ queryKey: qk.settings, queryFn: fetchSettings });

  const [form, setForm] = useState({
    company_name: "",
    email: "",
    phone: "",
    address: "",
    invoice_prefix: "",
    receipt_prefix: "",
    default_credit_days: 30,
  });

  useEffect(() => {
    if (settings) {
      setForm({
        company_name: settings.company_name ?? "",
        email: settings.email ?? "",
        phone: settings.phone ?? "",
        address: settings.address ?? "",
        invoice_prefix: settings.invoice_prefix ?? "",
        receipt_prefix: settings.receipt_prefix ?? "",
        default_credit_days: settings.default_credit_days ?? 30,
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("app_settings")
        .update({
          company_name: form.company_name.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          address: form.address.trim() || null,
          invoice_prefix: form.invoice_prefix.trim(),
          receipt_prefix: form.receipt_prefix.trim(),
          default_credit_days: Number(form.default_credit_days) || 30,
        })
        .eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Settings saved");
      queryClient.invalidateQueries({ queryKey: qk.settings });
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Settings" />
        <LoadingRows />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Company profile, document numbering and receivables defaults."
        actions={
          isAdmin && (
            <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              <Save className="mr-2 h-4 w-4" /> Save changes
            </Button>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Company profile</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <Field label="Company name">
              <Input value={form.company_name} disabled={!isAdmin} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Email">
                <Input type="email" value={form.email} disabled={!isAdmin} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
              <Field label="Phone">
                <Input value={form.phone} disabled={!isAdmin} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </Field>
            </div>
            <Field label="Address">
              <Textarea value={form.address} disabled={!isAdmin} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Documents & credit terms</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Invoice prefix">
                <Input value={form.invoice_prefix} disabled={!isAdmin} onChange={(e) => setForm({ ...form, invoice_prefix: e.target.value })} />
              </Field>
              <Field label="Receipt prefix">
                <Input value={form.receipt_prefix} disabled={!isAdmin} onChange={(e) => setForm({ ...form, receipt_prefix: e.target.value })} />
              </Field>
            </div>
            <Field label="Default credit days">
              <Input
                type="number"
                min={0}
                value={form.default_credit_days}
                disabled={!isAdmin}
                onChange={(e) => setForm({ ...form, default_credit_days: Number(e.target.value) })}
              />
            </Field>
            <Field label="Currency">
              <Input value={`${settings?.currency ?? "KES"} — Kenyan Shilling (en-KE)`} readOnly disabled />
            </Field>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-base">Aging buckets</CardTitle></CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              Invoices are automatically classified into these buckets based on days past the due date.
            </p>
            <div className="flex flex-wrap gap-2">
              {AGING_BUCKETS.map((b) => (
                <Badge key={b} variant="outline" className="bg-secondary text-secondary-foreground">{b}</Badge>
              ))}
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Urgency levels: Current (not due), Low (1–7), Medium (8–30), High (31–60), Critical (60+ days overdue).
            </p>
          </CardContent>
        </Card>
      </div>

      {!isAdmin && (
        <p className="mt-4 text-sm text-muted-foreground">Only administrators can change these settings.</p>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
