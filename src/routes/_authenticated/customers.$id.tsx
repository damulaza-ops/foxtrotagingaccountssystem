import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, Pencil, Phone, Plus, Printer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, StatCard, LoadingRows, EmptyState } from "@/components/page-blocks";
import { StatusBadge, UrgencyBadge } from "@/components/status-badge";
import { CustomerDialog } from "@/components/customer-dialog";
import { InvoiceDialog } from "@/components/invoice-dialog";
import { RecordPaymentDialog } from "@/components/record-payment-dialog";
import { FollowUpDialog } from "@/components/follow-up-dialog";
import { fetchCustomers, fetchFollowUps, fetchInvoices, fetchPayments, qk } from "@/lib/data";
import { fmtDate, fmtKES } from "@/lib/format";
import { agingBucket, daysOverdue, displayStatus, urgency } from "@/lib/aging";
import { exportExcel, printPage } from "@/lib/export";
import { useAuthz } from "@/hooks/use-authz";

export const Route = createFileRoute("/_authenticated/customers/$id")({
  validateSearch: (search: Record<string, unknown>): { print?: boolean } => ({
    print: search.print === true || search.print === "true" ? true : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Customer Profile — Foxtrot Aging Accounts" },
      { name: "description", content: "Customer statement with invoices, payments, follow-ups and outstanding balance." },
      { property: "og:title", content: "Customer Profile — Foxtrot Aging Accounts" },
      { property: "og:description", content: "Customer statement with invoices, payments, follow-ups and outstanding balance." },
    ],
  }),
  component: CustomerDetail,
});

const FOLLOW_UP_LABELS: Record<string, string> = {
  no_response: "No response",
  promised_payment: "Promised payment",
  partial_payment_expected: "Partial payment expected",
  disputed_invoice: "Disputed invoice",
  escalated: "Escalated",
  resolved: "Resolved",
};

function CustomerDetail() {
  const { id } = Route.useParams();
  const { print } = Route.useSearch();
  const { isManager, canFollowUp } = useAuthz();

  const { data: customers, isLoading: lc } = useQuery({ queryKey: qk.customers, queryFn: fetchCustomers });
  const { data: invoices, isLoading: li } = useQuery({ queryKey: qk.invoices, queryFn: fetchInvoices });
  const { data: payments } = useQuery({ queryKey: qk.payments, queryFn: fetchPayments });
  const { data: followUps } = useQuery({ queryKey: qk.followUps, queryFn: fetchFollowUps });

  const [editOpen, setEditOpen] = useState(false);
  const [invOpen, setInvOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [fuOpen, setFuOpen] = useState(false);

  const customer = customers?.find((c) => c.id === id);
  const custInvoices = useMemo(
    () => (invoices ?? []).filter((i) => i.customer_id === id),
    [invoices, id],
  );
  const custPayments = useMemo(() => (payments ?? []).filter((p) => p.customer_id === id), [payments, id]);
  const custFollowUps = useMemo(() => (followUps ?? []).filter((f) => f.customer_id === id), [followUps, id]);

  if (lc || li) {
    return (
      <div>
        <PageHeader title="Customer" />
        <LoadingRows />
      </div>
    );
  }

  if (!customer) {
    return (
      <EmptyState
        title="Customer not found"
        description="This customer may have been removed."
        action={<Button asChild><Link to="/customers">Back to customers</Link></Button>}
      />
    );
  }

  const open = custInvoices.filter(
    (i) => Number(i.outstanding_balance ?? 0) > 0 && i.payment_status !== "written_off" && i.payment_status !== "cancelled",
  );
  const balance = open.reduce((s, i) => s + Number(i.outstanding_balance ?? 0), 0);
  const overdueList = open.filter((i) => daysOverdue(i.due_date) > 0);
  const overdue = overdueList.reduce((s, i) => s + Number(i.outstanding_balance ?? 0), 0);
  const collected = custPayments.filter((p) => !p.reversed).reduce((s, p) => s + Number(p.amount), 0);
  const oldest = overdueList.reduce((m, i) => Math.max(m, daysOverdue(i.due_date)), 0);

  function exportStatement() {
    exportExcel(
      custInvoices.map((i) => ({
        "Invoice No": i.invoice_number,
        "Invoice Date": i.invoice_date,
        "Due Date": i.due_date,
        "Amount (KES)": Number(i.invoice_amount),
        "Paid (KES)": Number(i.amount_paid),
        "Outstanding (KES)": Number(i.outstanding_balance ?? 0),
        "Days Overdue": Math.max(0, daysOverdue(i.due_date)),
        Bucket: agingBucket(daysOverdue(i.due_date)),
      })),
      `statement-${customer!.customer_code}`,
      "Statement",
    );
  }

  return (
    <div className="print-area">
      <Button asChild variant="ghost" size="sm" className="no-print mb-2 -ml-2">
        <Link to="/customers"><ArrowLeft className="mr-2 h-4 w-4" /> All customers</Link>
      </Button>

      <PageHeader
        title={customer.business_name}
        description={`${customer.customer_code}${customer.branch_name ? " · " + customer.branch_name : ""}${customer.location ? " · " + customer.location : ""}`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportStatement}>
              <Download className="mr-2 h-4 w-4" /> Statement
            </Button>
            <Button variant="outline" size="sm" onClick={printPage}>
              <Printer className="mr-2 h-4 w-4" /> Print
            </Button>
            {canFollowUp && (
              <Button variant="outline" size="sm" onClick={() => setFuOpen(true)}>
                <Phone className="mr-2 h-4 w-4" /> Log follow-up
              </Button>
            )}
            {isManager && (
              <>
                <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                  <Pencil className="mr-2 h-4 w-4" /> Edit
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPayOpen(true)}>Record payment</Button>
                <Button size="sm" onClick={() => setInvOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" /> New invoice
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Outstanding balance" value={fmtKES(balance)} sub={`${open.length} open invoices`} />
        <StatCard label="Overdue" value={fmtKES(overdue)} tone="destructive" sub={`${overdueList.length} invoices`} />
        <StatCard label="Total collected" value={fmtKES(collected)} tone="success" />
        <StatCard
          label="Oldest debt"
          value={oldest > 0 ? `${oldest} days` : "None"}
          sub={oldest > 0 ? agingBucket(oldest) : "No overdue balance"}
          tone={oldest > 60 ? "destructive" : "default"}
        />
      </div>

      <Card className="mb-4">
        <CardHeader className="pb-2"><CardTitle className="text-base">Account details</CardTitle></CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Detail label="Contact person" value={customer.contact_person} />
          <Detail label="Phone" value={customer.phone} />
          <Detail label="Email" value={customer.email} />
          <Detail label="Credit terms" value={`${customer.credit_days} days`} />
          <Detail label="Credit limit" value={fmtKES(Number(customer.credit_limit))} />
          <Detail label="Location" value={customer.location} />
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
            <Badge
              variant="outline"
              className={customer.status === "active" ? "mt-1 bg-success/15 text-success border-success/30" : "mt-1 bg-muted text-muted-foreground"}
            >
              {customer.status === "on_hold" ? "On hold" : customer.status.charAt(0).toUpperCase() + customer.status.slice(1)}
            </Badge>
          </div>
          <Detail label="Notes" value={customer.notes} />
        </CardContent>
      </Card>

      <Tabs defaultValue="invoices">
        <TabsList className="no-print">
          <TabsTrigger value="invoices">Invoices ({custInvoices.length})</TabsTrigger>
          <TabsTrigger value="payments">Payments ({custPayments.length})</TabsTrigger>
          <TabsTrigger value="followups">Follow-ups ({custFollowUps.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices">
          <Card>
            <CardContent className="p-0">
              {custInvoices.length === 0 ? (
                <EmptyState title="No invoices" description="This customer has no invoices yet." />
              ) : (
                <div className="w-full overflow-x-auto">
                  <Table className="min-w-[800px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Due</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Paid</TableHead>
                        <TableHead className="text-right">Outstanding</TableHead>
                        <TableHead>Urgency</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {custInvoices.map((i) => {
                        const d = daysOverdue(i.due_date);
                        const out = Number(i.outstanding_balance ?? 0);
                        return (
                          <TableRow key={i.id}>
                            <TableCell className="font-mono text-xs">{i.invoice_number}</TableCell>
                            <TableCell>{fmtDate(i.invoice_date)}</TableCell>
                            <TableCell>{fmtDate(i.due_date)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmtKES(Number(i.invoice_amount))}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmtKES(Number(i.amount_paid))}</TableCell>
                            <TableCell className="text-right font-medium tabular-nums">{fmtKES(out)}</TableCell>
                            <TableCell>{out > 0 ? <UrgencyBadge level={urgency(d)} /> : "—"}</TableCell>
                            <TableCell><StatusBadge status={displayStatus(i)} /></TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card>
            <CardContent className="p-0">
              {custPayments.length === 0 ? (
                <EmptyState title="No payments" description="No payments recorded for this customer." />
              ) : (
                <div className="w-full overflow-x-auto">
                  <Table className="min-w-[700px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Receipt</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Allocated to</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>State</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {custPayments.map((p) => (
                        <TableRow key={p.id} className={p.reversed ? "opacity-60" : undefined}>
                          <TableCell>{fmtDate(p.payment_date)}</TableCell>
                          <TableCell className="font-mono text-xs">{p.receipt_number ?? "—"}</TableCell>
                          <TableCell className="capitalize">{p.payment_method.replace("_", " ")}</TableCell>
                          <TableCell className="text-xs">
                            {p.payment_allocations.map((a) => a.invoices?.invoice_number ?? "—").join(", ") || "Unallocated"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{fmtKES(Number(p.amount))}</TableCell>
                          <TableCell>
                            {p.reversed ? (
                              <Badge variant="outline" className="bg-muted text-muted-foreground">Reversed</Badge>
                            ) : (
                              <Badge variant="outline" className="bg-success/15 text-success border-success/30">Posted</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="followups">
          <Card>
            <CardContent className="p-0">
              {custFollowUps.length === 0 ? (
                <EmptyState title="No follow-ups" description="Log a follow-up to start tracking collection activity." />
              ) : (
                <div className="w-full overflow-x-auto">
                  <Table className="min-w-[800px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Contacted</TableHead>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Outcome</TableHead>
                        <TableHead>Promise</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {custFollowUps.map((f) => (
                        <TableRow key={f.id}>
                          <TableCell>{fmtDate(f.follow_up_date)}</TableCell>
                          <TableCell className="capitalize">{f.contact_method.replace("_", " ")}</TableCell>
                          <TableCell>{f.contacted_person ?? "—"}</TableCell>
                          <TableCell className="font-mono text-xs">{f.invoices?.invoice_number ?? "—"}</TableCell>
                          <TableCell>{FOLLOW_UP_LABELS[f.status] ?? f.status}</TableCell>
                          <TableCell className="text-xs">
                            {f.promise_to_pay_amount
                              ? `${fmtKES(Number(f.promise_to_pay_amount))} by ${fmtDate(f.promise_to_pay_date)}`
                              : "—"}
                          </TableCell>
                          <TableCell className="max-w-[280px] truncate text-xs">{f.notes ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <CustomerDialog open={editOpen} onOpenChange={setEditOpen} customer={customer} />
      <InvoiceDialog open={invOpen} onOpenChange={setInvOpen} defaultCustomerId={customer.id} />
      <RecordPaymentDialog open={payOpen} onOpenChange={setPayOpen} defaultCustomerId={customer.id} />
      <FollowUpDialog open={fuOpen} onOpenChange={setFuOpen} defaultCustomerId={customer.id} />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 break-words">{value || "—"}</p>
    </div>
  );
}
