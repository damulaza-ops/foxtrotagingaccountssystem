import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MoreHorizontal, Download, Printer } from "lucide-react";
import { PageHeader, EmptyState, LoadingRows } from "@/components/page-blocks";
import { BucketBadge, UrgencyBadge } from "@/components/status-badge";
import { RecordPaymentDialog } from "@/components/record-payment-dialog";
import { FollowUpDialog } from "@/components/follow-up-dialog";
import { supabase } from "@/integrations/supabase/client";
import { fetchCustomers, fetchFollowUps, fetchInvoices, qk } from "@/lib/data";
import { fmtKES, fmtDate } from "@/lib/format";
import { AGING_BUCKETS, URGENCY_LEVELS, agingBucket, daysOverdue, displayStatus, urgency } from "@/lib/aging";
import { exportCSV } from "@/lib/export";
import { useAuthz } from "@/hooks/use-authz";

export const Route = createFileRoute("/_authenticated/aging")({
  component: AgingPage,
});

function AgingPage() {
  const queryClient = useQueryClient();
  const { isAdmin, isManager, canFollowUp } = useAuthz();
  const { data: invoices, isLoading } = useQuery({ queryKey: qk.invoices, queryFn: fetchInvoices });
  const { data: customers = [] } = useQuery({ queryKey: qk.customers, queryFn: fetchCustomers });
  const { data: followUps = [] } = useQuery({ queryKey: qk.followUps, queryFn: fetchFollowUps });

  const [search, setSearch] = useState("");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [bucketFilter, setBucketFilter] = useState("all");
  const [urgencyFilter, setUrgencyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [minBal, setMinBal] = useState("");
  const [maxBal, setMaxBal] = useState("");
  const [creditFilter, setCreditFilter] = useState("");

  const [payFor, setPayFor] = useState<{ customerId: string; invoiceId: string } | null>(null);
  const [followFor, setFollowFor] = useState<{ customerId: string; invoiceId: string } | null>(null);
  const [writeOff, setWriteOff] = useState<{ id: string; number: string } | null>(null);

  const rows = useMemo(() => {
    return (invoices ?? [])
      .filter((i) => Number(i.outstanding_balance) > 0)
      .filter((i) => !["written_off", "cancelled", "paid"].includes(i.payment_status))
      .map((i) => {
        const d = daysOverdue(i.due_date);
        const lastFu = followUps.find((f) => f.invoice_id === i.id || (f.customer_id === i.customer_id && !f.invoice_id));
        return { inv: i, days: d, bucket: agingBucket(d), urg: urgency(d), lastFollowUp: lastFu };
      })
      .filter((r) => {
        const c = r.inv.customers;
        if (search) {
          const q = search.toLowerCase();
          if (
            !r.inv.invoice_number.toLowerCase().includes(q) &&
            !(c?.business_name ?? "").toLowerCase().includes(q) &&
            !(c?.branch_name ?? "").toLowerCase().includes(q)
          )
            return false;
        }
        if (customerFilter !== "all" && r.inv.customer_id !== customerFilter) return false;
        if (bucketFilter !== "all" && r.bucket !== bucketFilter) return false;
        if (urgencyFilter !== "all" && r.urg !== urgencyFilter) return false;
        if (statusFilter !== "all" && displayStatus(r.inv) !== statusFilter) return false;
        if (fromDate && r.inv.invoice_date < fromDate) return false;
        if (toDate && r.inv.invoice_date > toDate) return false;
        const bal = Number(r.inv.outstanding_balance);
        if (minBal && bal < Number(minBal)) return false;
        if (maxBal && bal > Number(maxBal)) return false;
        if (creditFilter && r.inv.credit_days !== Number(creditFilter)) return false;
        return true;
      })
      .sort((a, b) => b.days - a.days);
  }, [invoices, followUps, search, customerFilter, bucketFilter, urgencyFilter, statusFilter, fromDate, toDate, minBal, maxBal, creditFilter]);

  const disputeMutation = useMutation({
    mutationFn: async ({ id, disputed }: { id: string; disputed: boolean }) => {
      const { error } = await supabase.from("invoices").update({ disputed }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.invoices });
      toast.success("Invoice updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const writeOffMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("write_off_invoice", { _invoice_id: id, _reason: "Written off from aging accounts" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.invoices });
      toast.success("Balance written off");
      setWriteOff(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleExport() {
    exportCSV(
      rows.map((r) => ({
        Customer: r.inv.customers?.business_name ?? "",
        Branch: r.inv.customers?.branch_name ?? "",
        Contact: r.inv.customers?.contact_person ?? "",
        Telephone: r.inv.customers?.phone ?? "",
        "Invoice No": r.inv.invoice_number,
        "Invoice Date": r.inv.invoice_date,
        "Due Date": r.inv.due_date,
        "Credit Days": r.inv.credit_days,
        "Days Overdue": Math.max(0, r.days),
        "Invoice Amount": Number(r.inv.invoice_amount),
        "Amount Paid": Number(r.inv.amount_paid),
        Outstanding: Number(r.inv.outstanding_balance),
        Bucket: r.bucket,
        Urgency: r.urg,
      })),
      "aging-accounts",
    );
  }

  const promiseByInvoice = (invId: string, custId: string) => {
    const fu = followUps
      .filter((f) => (f.invoice_id === invId || (f.customer_id === custId && !f.invoice_id)) && f.promise_to_pay_date)
      .sort((a, b) => (b.promise_to_pay_date ?? "").localeCompare(a.promise_to_pay_date ?? ""))[0];
    return fu?.promise_to_pay_date ?? null;
  };

  return (
    <div>
      <PageHeader
        title="Aging Accounts"
        description="Outstanding invoices sorted from oldest overdue to newest"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={handleExport}><Download className="mr-1 h-4 w-4" />CSV</Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="mr-1 h-4 w-4" />Print</Button>
          </>
        }
      />

      <Card className="no-print mb-4">
        <CardContent className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4 xl:grid-cols-5">
          <Input placeholder="Search customer / invoice…" value={search} onChange={(e) => setSearch(e.target.value)} className="col-span-2" />
          <Select value={customerFilter} onValueChange={setCustomerFilter}>
            <SelectTrigger><SelectValue placeholder="Customer" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All customers</SelectItem>
              {customers.map((c) => (<SelectItem key={c.id} value={c.id}>{c.business_name}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={bucketFilter} onValueChange={setBucketFilter}>
            <SelectTrigger><SelectValue placeholder="Aging bucket" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All buckets</SelectItem>
              {AGING_BUCKETS.map((b) => (<SelectItem key={b} value={b}>{b}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={urgencyFilter} onValueChange={setUrgencyFilter}>
            <SelectTrigger><SelectValue placeholder="Urgency" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All urgencies</SelectItem>
              {URGENCY_LEVELS.map((u) => (<SelectItem key={u} value={u}>{u}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue placeholder="Payment status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="current">Current</SelectItem>
              <SelectItem value="partially_paid">Partially paid</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="unverified">Requires verification</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} aria-label="From date" />
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} aria-label="To date" />
          <Input type="number" placeholder="Min balance" value={minBal} onChange={(e) => setMinBal(e.target.value)} />
          <Input type="number" placeholder="Max balance" value={maxBal} onChange={(e) => setMaxBal(e.target.value)} />
          <Input type="number" placeholder="Credit period (days)" value={creditFilter} onChange={(e) => setCreditFilter(e.target.value)} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4"><LoadingRows /></div>
          ) : rows.length === 0 ? (
            <div className="p-4"><EmptyState title="No aging accounts match your filters" /></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Telephone</TableHead>
                    <TableHead>Invoice No.</TableHead>
                    <TableHead>Inv. Date</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="text-right">Days O/D</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead>Bucket</TableHead>
                    <TableHead>Urgency</TableHead>
                    <TableHead>Last follow-up</TableHead>
                    <TableHead>Promise</TableHead>
                    <TableHead className="no-print" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(({ inv, days, bucket, urg, lastFollowUp }) => (
                    <TableRow key={inv.id} className={inv.disputed ? "bg-warning/10" : undefined}>
                      <TableCell>
                        <Link to="/customers/$id" params={{ id: inv.customer_id }} className="font-medium hover:underline">
                          {inv.customers?.business_name ?? "—"}
                        </Link>
                        {inv.disputed && <span className="ml-1 text-xs text-warning-foreground">(disputed)</span>}
                      </TableCell>
                      <TableCell>{inv.customers?.branch_name ?? "—"}</TableCell>
                      <TableCell>{inv.customers?.contact_person ?? "—"}</TableCell>
                      <TableCell>{inv.customers?.phone ?? "—"}</TableCell>
                      <TableCell>{inv.invoice_number}</TableCell>
                      <TableCell>{fmtDate(inv.invoice_date)}</TableCell>
                      <TableCell>{fmtDate(inv.due_date)}</TableCell>
                      <TableCell className="text-right tabular-nums">{inv.credit_days}d</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{Math.max(0, days)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtKES(Number(inv.invoice_amount))}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtKES(Number(inv.amount_paid))}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold text-destructive">
                        {fmtKES(Number(inv.outstanding_balance))}
                      </TableCell>
                      <TableCell><BucketBadge bucket={bucket} /></TableCell>
                      <TableCell><UrgencyBadge level={urg} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {lastFollowUp ? fmtDate(lastFollowUp.follow_up_date) : "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {promiseByInvoice(inv.id, inv.customer_id) ? fmtDate(promiseByInvoice(inv.id, inv.customer_id)) : "—"}
                      </TableCell>
                      <TableCell className="no-print">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {isManager && (
                              <DropdownMenuItem onClick={() => setPayFor({ customerId: inv.customer_id, invoiceId: inv.id })}>
                                Record payment
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem asChild>
                              <Link to="/invoices" search={{ q: inv.invoice_number }}>View invoice</Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link to="/customers/$id" params={{ id: inv.customer_id }}>View customer</Link>
                            </DropdownMenuItem>
                            {canFollowUp && (
                              <DropdownMenuItem onClick={() => setFollowFor({ customerId: inv.customer_id, invoiceId: inv.id })}>
                                Add follow-up note
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem asChild>
                              <Link to="/customers/$id" params={{ id: inv.customer_id }} search={{ print: true }}>
                                Download statement
                              </Link>
                            </DropdownMenuItem>
                            {isManager && (
                              <DropdownMenuItem onClick={() => disputeMutation.mutate({ id: inv.id, disputed: !inv.disputed })}>
                                {inv.disputed ? "Clear dispute" : "Mark as disputed"}
                              </DropdownMenuItem>
                            )}
                            {isAdmin && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => setWriteOff({ id: inv.id, number: inv.invoice_number })}
                                >
                                  Write off balance
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <RecordPaymentDialog
        open={!!payFor}
        onOpenChange={(o) => !o && setPayFor(null)}
        defaultCustomerId={payFor?.customerId}
        defaultInvoiceId={payFor?.invoiceId}
      />
      <FollowUpDialog
        open={!!followFor}
        onOpenChange={(o) => !o && setFollowFor(null)}
        defaultCustomerId={followFor?.customerId}
        defaultInvoiceId={followFor?.invoiceId}
      />
      <AlertDialog open={!!writeOff} onOpenChange={(o) => !o && setWriteOff(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Write off {writeOff?.number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This marks the remaining balance as written off. The action is recorded in the audit trail and cannot be
              undone from this screen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => writeOff && writeOffMutation.mutate(writeOff.id)}>
              Write off
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
