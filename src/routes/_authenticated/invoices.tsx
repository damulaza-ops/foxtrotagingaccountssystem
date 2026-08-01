import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { MoreHorizontal, Plus, Download, Printer } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader, LoadingRows, EmptyState } from "@/components/page-blocks";
import { StatusBadge } from "@/components/status-badge";
import { InvoiceDialog } from "@/components/invoice-dialog";
import { RecordPaymentDialog } from "@/components/record-payment-dialog";
import { supabase } from "@/integrations/supabase/client";
import { fetchInvoices, qk, type InvoiceWithCustomer } from "@/lib/data";
import { fmtDate, fmtKES } from "@/lib/format";
import { daysOverdue, displayStatus, STATUS_LABELS, type DisplayStatus } from "@/lib/aging";
import { exportExcel, printPage } from "@/lib/export";
import { useAuthz } from "@/hooks/use-authz";

export const Route = createFileRoute("/_authenticated/invoices")({
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({
    q: typeof search.q === "string" && search.q.length > 0 ? search.q : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Invoices — Foxtrot Aging Accounts" },
      { name: "description", content: "Create, track and manage customer invoices, due dates and outstanding balances." },
      { property: "og:title", content: "Invoices — Foxtrot Aging Accounts" },
      { property: "og:description", content: "Create, track and manage customer invoices, due dates and outstanding balances." },
    ],
  }),
  component: InvoicesPage,
});

const STATUS_FILTERS: (DisplayStatus | "all" | "open")[] = [
  "all",
  "open",
  "current",
  "partially_paid",
  "overdue",
  "paid",
  "written_off",
  "cancelled",
];

function InvoicesPage() {
  const queryClient = useQueryClient();
  const { isManager } = useAuthz();
  const { data: invoices, isLoading } = useQuery({ queryKey: qk.invoices, queryFn: fetchInvoices });

  const { q: initialQuery } = Route.useSearch();
  const [search, setSearch] = useState(initialQuery ?? "");
  const [status, setStatus] = useState<string>("all");

  useEffect(() => {
    if (initialQuery) setSearch(initialQuery);
  }, [initialQuery]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<InvoiceWithCustomer | null>(null);
  const [payFor, setPayFor] = useState<InvoiceWithCustomer | null>(null);
  const [writeOff, setWriteOff] = useState<InvoiceWithCustomer | null>(null);
  const [writeOffReason, setWriteOffReason] = useState("");

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (invoices ?? []).filter((i) => {
      const ds = displayStatus(i);
      if (status === "open" && (Number(i.outstanding_balance) <= 0 || ds === "written_off" || ds === "cancelled")) return false;
      if (status !== "all" && status !== "open" && ds !== status) return false;
      if (from && i.invoice_date < from) return false;
      if (to && i.invoice_date > to) return false;
      if (!q) return true;
      return (
        i.invoice_number.toLowerCase().includes(q) ||
        (i.customers?.business_name ?? "").toLowerCase().includes(q) ||
        (i.customers?.customer_code ?? "").toLowerCase().includes(q)
      );
    });
  }, [invoices, search, status, from, to]);

  const totals = rows.reduce(
    (acc, i) => {
      acc.amount += Number(i.invoice_amount);
      acc.paid += Number(i.amount_paid);
      acc.outstanding += Number(i.outstanding_balance ?? 0);
      return acc;
    },
    { amount: 0, paid: 0, outstanding: 0 },
  );

  const writeOffMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.rpc("write_off_invoice", { _invoice_id: id, _reason: reason });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invoice written off");
      setWriteOff(null);
      setWriteOffReason("");
      queryClient.invalidateQueries({ queryKey: qk.invoices });
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });

  function handleExport() {
    exportExcel(
      rows.map((i) => ({
        "Invoice No": i.invoice_number,
        Customer: i.customers?.business_name ?? "",
        "Invoice Date": i.invoice_date,
        "Due Date": i.due_date,
        "Amount (KES)": Number(i.invoice_amount),
        "Paid (KES)": Number(i.amount_paid),
        "Outstanding (KES)": Number(i.outstanding_balance ?? 0),
        "Days Overdue": Math.max(0, daysOverdue(i.due_date)),
        Status: STATUS_LABELS[displayStatus(i)],
      })),
      "foxtrot-invoices",
      "Invoices",
    );
  }

  return (
    <div className="print-area">
      <PageHeader
        title="Invoices"
        description="All customer invoices with due dates, payments and outstanding balances."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" /> Export
            </Button>
            <Button variant="outline" size="sm" onClick={printPage}>
              <Printer className="mr-2 h-4 w-4" /> Print
            </Button>
            {isManager && (
              <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
                <Plus className="mr-2 h-4 w-4" /> New invoice
              </Button>
            )}
          </>
        }
      />

      <Card className="mb-4 no-print">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label className="text-xs">Search</Label>
            <Input placeholder="Invoice no. or customer" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s === "all" ? "All statuses" : s === "open" ? "Open (unpaid)" : STATUS_LABELS[s as DisplayStatus]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Invoice date from</Label>
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
            <EmptyState title="No invoices found" description="Adjust your filters or create a new invoice." />
          ) : (
            <div className="w-full overflow-x-auto">
              <Table className="min-w-[900px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Invoice date</TableHead>
                    <TableHead>Due date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead className="text-right">Days overdue</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="no-print" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((i) => {
                    const d = daysOverdue(i.due_date);
                    const out = Number(i.outstanding_balance ?? 0);
                    return (
                      <TableRow key={i.id}>
                        <TableCell className="font-mono text-xs">{i.invoice_number}</TableCell>
                        <TableCell>
                          {i.customer_id ? (
                            <Link to="/customers/$id" params={{ id: i.customer_id }} className="font-medium hover:underline">
                              {i.customers?.business_name ?? "—"}
                            </Link>
                          ) : (
                            i.customers?.business_name ?? "—"
                          )}
                        </TableCell>
                        <TableCell>{fmtDate(i.invoice_date)}</TableCell>
                        <TableCell>{fmtDate(i.due_date)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtKES(Number(i.invoice_amount))}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtKES(Number(i.amount_paid))}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{fmtKES(out)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {out > 0 && d > 0 ? <span className="text-destructive">{d}</span> : "—"}
                        </TableCell>
                        <TableCell><StatusBadge status={displayStatus(i)} /></TableCell>
                        <TableCell className="no-print">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link to="/customers/$id" params={{ id: i.customer_id }}>View customer</Link>
                              </DropdownMenuItem>
                              {isManager && (
                                <>
                                  <DropdownMenuItem onClick={() => { setEditing(i); setDialogOpen(true); }}>Edit invoice</DropdownMenuItem>
                                  {out > 0 && (
                                    <DropdownMenuItem onClick={() => setPayFor(i)}>Record payment</DropdownMenuItem>
                                  )}
                                  {out > 0 && !i.written_off && (
                                    <DropdownMenuItem onClick={() => setWriteOff(i)}>Write off</DropdownMenuItem>
                                  )}
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <SummaryTile label="Invoiced" value={fmtKES(totals.amount)} />
        <SummaryTile label="Paid" value={fmtKES(totals.paid)} />
        <SummaryTile label="Outstanding" value={fmtKES(totals.outstanding)} />
      </div>

      <InvoiceDialog open={dialogOpen} onOpenChange={setDialogOpen} invoice={editing} />
      <RecordPaymentDialog
        open={!!payFor}
        onOpenChange={(o) => !o && setPayFor(null)}
        defaultCustomerId={payFor?.customer_id}
        defaultInvoiceId={payFor?.id}
      />

      <Dialog open={!!writeOff} onOpenChange={(o) => !o && setWriteOff(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Write off {writeOff?.invoice_number}?</DialogTitle>
            <DialogDescription>
              The remaining balance of {fmtKES(Number(writeOff?.outstanding_balance ?? 0))} will be written off and recorded in the audit trail.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="wo-reason">Reason</Label>
            <Textarea id="wo-reason" value={writeOffReason} onChange={(e) => setWriteOffReason(e.target.value)} placeholder="Explain why this balance is being written off" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWriteOff(null)}>Cancel</Button>
            <Button
              disabled={!writeOffReason.trim() || writeOffMutation.isPending}
              onClick={() => writeOff && writeOffMutation.mutate({ id: writeOff.id, reason: writeOffReason.trim() })}
            >
              Confirm write-off
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
