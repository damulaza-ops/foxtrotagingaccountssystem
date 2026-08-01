import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { Download, Plus, Printer, Undo2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader, LoadingRows, EmptyState } from "@/components/page-blocks";
import { RecordPaymentDialog } from "@/components/record-payment-dialog";
import { supabase } from "@/integrations/supabase/client";
import { fetchPayments, qk, type PaymentWithDetails } from "@/lib/data";
import { fmtDate, fmtKES } from "@/lib/format";
import { exportExcel, printPage } from "@/lib/export";
import { useAuthz } from "@/hooks/use-authz";

export const Route = createFileRoute("/_authenticated/payments")({
  head: () => ({
    meta: [
      { title: "Payments — Foxtrot Aging Accounts" },
      { name: "description", content: "Record customer payments, view allocations and reverse payments with a full audit trail." },
      { property: "og:title", content: "Payments — Foxtrot Aging Accounts" },
      { property: "og:description", content: "Record customer payments, view allocations and reverse payments with a full audit trail." },
    ],
  }),
  component: PaymentsPage,
});

const METHOD_LABELS: Record<string, string> = {
  mpesa: "M-Pesa",
  bank_transfer: "Bank transfer",
  cash: "Cash",
  cheque: "Cheque",
  other: "Other",
};

function PaymentsPage() {
  const queryClient = useQueryClient();
  const { isManager } = useAuthz();
  const { data: payments, isLoading } = useQuery({ queryKey: qk.payments, queryFn: fetchPayments });

  const [search, setSearch] = useState("");
  const [method, setMethod] = useState("all");
  const [showReversed, setShowReversed] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [reversing, setReversing] = useState<PaymentWithDetails | null>(null);
  const [reason, setReason] = useState("");

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (payments ?? []).filter((p) => {
      if (method !== "all" && p.payment_method !== method) return false;
      if (showReversed === "active" && p.reversed) return false;
      if (showReversed === "reversed" && !p.reversed) return false;
      if (from && p.payment_date < from) return false;
      if (to && p.payment_date > to) return false;
      if (!q) return true;
      return (
        (p.customers?.business_name ?? "").toLowerCase().includes(q) ||
        (p.receipt_number ?? "").toLowerCase().includes(q) ||
        (p.reference_number ?? "").toLowerCase().includes(q)
      );
    });
  }, [payments, search, method, showReversed, from, to]);

  const total = rows.filter((p) => !p.reversed).reduce((s, p) => s + Number(p.amount), 0);

  const reverseMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.rpc("reverse_payment", { _payment_id: id, _reason: reason });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payment reversed");
      setReversing(null);
      setReason("");
      queryClient.invalidateQueries({ queryKey: qk.payments });
      queryClient.invalidateQueries({ queryKey: qk.invoices });
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });

  function handleExport() {
    exportExcel(
      rows.map((p) => ({
        Date: p.payment_date,
        Receipt: p.receipt_number ?? "",
        Customer: p.customers?.business_name ?? "",
        Method: METHOD_LABELS[p.payment_method] ?? p.payment_method,
        Reference: p.reference_number ?? "",
        "Amount (KES)": Number(p.amount),
        Allocations: p.payment_allocations
          .map((a) => `${a.invoices?.invoice_number ?? "?"}: ${Number(a.allocated_amount)}`)
          .join("; "),
        Reversed: p.reversed ? "Yes" : "No",
      })),
      "foxtrot-payments",
      "Payments",
    );
  }

  return (
    <div className="print-area">
      <PageHeader
        title="Payments"
        description="Payment receipts, invoice allocations and reversals."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" /> Export
            </Button>
            <Button variant="outline" size="sm" onClick={printPage}>
              <Printer className="mr-2 h-4 w-4" /> Print
            </Button>
            {isManager && (
              <Button size="sm" onClick={() => setPayOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> Record payment
              </Button>
            )}
          </>
        }
      />

      <Card className="mb-4 no-print">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <Label className="text-xs">Search</Label>
            <Input placeholder="Customer, receipt, reference" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All methods</SelectItem>
                {Object.entries(METHOD_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">State</Label>
            <Select value={showReversed} onValueChange={setShowReversed}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All payments</SelectItem>
                <SelectItem value="active">Active only</SelectItem>
                <SelectItem value="reversed">Reversed only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4"><LoadingRows /></div>
          ) : rows.length === 0 ? (
            <EmptyState title="No payments found" description="Adjust your filters or record a new payment." />
          ) : (
            <div className="w-full overflow-x-auto">
              <Table className="min-w-[900px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Receipt</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Allocated to</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="no-print" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((p) => (
                    <TableRow key={p.id} className={p.reversed ? "opacity-60" : undefined}>
                      <TableCell>{fmtDate(p.payment_date)}</TableCell>
                      <TableCell className="font-mono text-xs">{p.receipt_number ?? "—"}</TableCell>
                      <TableCell>
                        <Link to="/customers/$id" params={{ id: p.customer_id }} className="font-medium hover:underline">
                          {p.customers?.business_name ?? "—"}
                        </Link>
                      </TableCell>
                      <TableCell>{METHOD_LABELS[p.payment_method] ?? p.payment_method}</TableCell>
                      <TableCell className="font-mono text-xs">{p.reference_number ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        {p.payment_allocations.length === 0
                          ? "Unallocated"
                          : p.payment_allocations.map((a) => (
                              <div key={a.id}>
                                {a.invoices?.invoice_number ?? "—"} · {fmtKES(Number(a.allocated_amount))}
                              </div>
                            ))}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{fmtKES(Number(p.amount))}</TableCell>
                      <TableCell className="no-print">
                        {p.reversed ? (
                          <Badge variant="outline" className="bg-muted text-muted-foreground">Reversed</Badge>
                        ) : isManager ? (
                          <Button variant="ghost" size="sm" onClick={() => setReversing(p)}>
                            <Undo2 className="mr-1 h-4 w-4" /> Reverse
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="mt-4 text-sm text-muted-foreground">
        Total collected (excluding reversals): <span className="font-semibold text-foreground tabular-nums">{fmtKES(total)}</span>
      </p>

      <RecordPaymentDialog open={payOpen} onOpenChange={setPayOpen} />

      <Dialog open={!!reversing} onOpenChange={(o) => !o && setReversing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reverse payment of {fmtKES(Number(reversing?.amount ?? 0))}?</DialogTitle>
            <DialogDescription>
              Allocations will be removed, invoice balances restored and the reversal recorded in the audit trail.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="rev-reason">Reason for reversal</Label>
            <Textarea id="rev-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Cheque bounced" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReversing(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!reason.trim() || reverseMutation.isPending}
              onClick={() => reversing && reverseMutation.mutate({ id: reversing.id, reason: reason.trim() })}
            >
              Reverse payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
