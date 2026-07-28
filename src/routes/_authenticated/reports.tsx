import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, FileSpreadsheet, Printer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, LoadingRows, EmptyState } from "@/components/page-blocks";
import { fetchCustomers, fetchInvoices, fetchPayments, qk } from "@/lib/data";
import { fmtDate, fmtKES } from "@/lib/format";
import { AGING_BUCKETS, agingBucket, daysOverdue, displayStatus } from "@/lib/aging";
import { exportCSV, exportExcel, printPage } from "@/lib/export";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Foxtrot Aging Accounts" },
      { name: "description", content: "Aging summary, customer statements and collections reports exportable to Excel or CSV." },
      { property: "og:title", content: "Reports — Foxtrot Aging Accounts" },
      { property: "og:description", content: "Aging summary, customer statements and collections reports exportable to Excel or CSV." },
    ],
  }),
  component: ReportsPage,
});

type ReportKey = "aging_summary" | "customer_balances" | "overdue_detail" | "collections";

const REPORTS: { value: ReportKey; label: string; description: string }[] = [
  { value: "aging_summary", label: "Aging summary", description: "Outstanding balance grouped into aging buckets." },
  { value: "customer_balances", label: "Customer balances", description: "Balance and overdue amount per customer." },
  { value: "overdue_detail", label: "Overdue invoice detail", description: "Every overdue invoice with days past due." },
  { value: "collections", label: "Collections", description: "Payments received in the selected period." },
];

function ReportsPage() {
  const { data: invoices, isLoading } = useQuery({ queryKey: qk.invoices, queryFn: fetchInvoices });
  const { data: payments } = useQuery({ queryKey: qk.payments, queryFn: fetchPayments });
  const { data: customers } = useQuery({ queryKey: qk.customers, queryFn: fetchCustomers });

  const [report, setReport] = useState<ReportKey>("aging_summary");
  const [customerId, setCustomerId] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const scopedInvoices = useMemo(
    () =>
      (invoices ?? []).filter((i) => {
        if (customerId !== "all" && i.customer_id !== customerId) return false;
        if (from && i.invoice_date < from) return false;
        if (to && i.invoice_date > to) return false;
        return i.payment_status !== "cancelled";
      }),
    [invoices, customerId, from, to],
  );

  const scopedPayments = useMemo(
    () =>
      (payments ?? []).filter((p) => {
        if (p.reversed) return false;
        if (customerId !== "all" && p.customer_id !== customerId) return false;
        if (from && p.payment_date < from) return false;
        if (to && p.payment_date > to) return false;
        return true;
      }),
    [payments, customerId, from, to],
  );

  const openInvoices = scopedInvoices.filter(
    (i) => Number(i.outstanding_balance ?? 0) > 0 && i.payment_status !== "written_off",
  );

  const rows: Record<string, string | number>[] = useMemo(() => {
    if (report === "aging_summary") {
      return AGING_BUCKETS.map((b) => {
        const set = openInvoices.filter((i) => agingBucket(daysOverdue(i.due_date)) === b);
        return {
          Bucket: b,
          Invoices: set.length,
          "Outstanding (KES)": set.reduce((s, i) => s + Number(i.outstanding_balance ?? 0), 0),
        };
      });
    }
    if (report === "customer_balances") {
      const map = new Map<string, { name: string; balance: number; overdue: number; invoices: number }>();
      for (const i of openInvoices) {
        const key = i.customer_id;
        const e = map.get(key) ?? { name: i.customers?.business_name ?? "Unknown", balance: 0, overdue: 0, invoices: 0 };
        e.balance += Number(i.outstanding_balance ?? 0);
        if (daysOverdue(i.due_date) > 0) e.overdue += Number(i.outstanding_balance ?? 0);
        e.invoices += 1;
        map.set(key, e);
      }
      return [...map.values()]
        .sort((a, b) => b.balance - a.balance)
        .map((e) => ({
          Customer: e.name,
          "Open invoices": e.invoices,
          "Balance (KES)": e.balance,
          "Overdue (KES)": e.overdue,
        }));
    }
    if (report === "overdue_detail") {
      return openInvoices
        .filter((i) => daysOverdue(i.due_date) > 0)
        .sort((a, b) => daysOverdue(b.due_date) - daysOverdue(a.due_date))
        .map((i) => ({
          "Invoice No": i.invoice_number,
          Customer: i.customers?.business_name ?? "",
          "Due Date": fmtDate(i.due_date),
          "Days Overdue": daysOverdue(i.due_date),
          Bucket: agingBucket(daysOverdue(i.due_date)),
          "Outstanding (KES)": Number(i.outstanding_balance ?? 0),
          Status: displayStatus(i),
        }));
    }
    return scopedPayments.map((p) => ({
      Date: fmtDate(p.payment_date),
      Receipt: p.receipt_number ?? "",
      Customer: p.customers?.business_name ?? "",
      Method: p.payment_method,
      "Amount (KES)": Number(p.amount),
    }));
  }, [report, openInvoices, scopedPayments]);

  const headers = rows.length ? Object.keys(rows[0]) : [];
  const numericTotals = headers.filter((h) => h.includes("KES"));
  const chartData = AGING_BUCKETS.map((b) => ({
    name: b,
    value: openInvoices
      .filter((i) => agingBucket(daysOverdue(i.due_date)) === b)
      .reduce((s, i) => s + Number(i.outstanding_balance ?? 0), 0),
  }));

  const active = REPORTS.find((r) => r.value === report)!;

  return (
    <div className="print-area">
      <PageHeader
        title="Reports"
        description="Generate aging, balance and collections reports for any period."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => exportCSV(rows, `foxtrot-${report}`)} disabled={!rows.length}>
              <Download className="mr-2 h-4 w-4" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportExcel(rows, `foxtrot-${report}`, active.label)} disabled={!rows.length}>
              <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
            </Button>
            <Button variant="outline" size="sm" onClick={printPage}>
              <Printer className="mr-2 h-4 w-4" /> Print
            </Button>
          </>
        }
      />

      <Card className="mb-4 no-print">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label className="text-xs">Report</Label>
            <Select value={report} onValueChange={(v) => setReport(v as ReportKey)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REPORTS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Customer</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All customers</SelectItem>
                {(customers ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.business_name}</SelectItem>
                ))}
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

      <Card className="mb-4">
        <CardHeader className="pb-2"><CardTitle className="text-base">Aging distribution</CardTitle></CardHeader>
        <CardContent className="h-[280px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" fontSize={11} interval={0} angle={-15} textAnchor="end" height={50} />
              <YAxis fontSize={11} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v: number) => fmtKES(v)} />
              <Bar dataKey="value" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{active.label}</CardTitle>
          <p className="text-sm text-muted-foreground">{active.description}</p>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4"><LoadingRows /></div>
          ) : rows.length === 0 ? (
            <EmptyState title="Nothing to report" description="No data matches the selected filters." />
          ) : (
            <div className="w-full overflow-x-auto">
              <Table className="min-w-[700px]">
                <TableHeader>
                  <TableRow>
                    {headers.map((h) => (
                      <TableHead key={h} className={h.includes("KES") || h === "Days Overdue" ? "text-right" : ""}>{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, idx) => (
                    <TableRow key={idx}>
                      {headers.map((h) => (
                        <TableCell key={h} className={h.includes("KES") || h === "Days Overdue" ? "text-right tabular-nums" : ""}>
                          {h.includes("KES") ? fmtKES(Number(r[h])) : String(r[h])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {numericTotals.length > 0 && (
                    <TableRow className="font-semibold">
                      {headers.map((h, idx) => (
                        <TableCell key={h} className={h.includes("KES") ? "text-right tabular-nums" : ""}>
                          {idx === 0 ? "Total" : h.includes("KES") ? fmtKES(rows.reduce((s, r) => s + Number(r[h] ?? 0), 0)) : ""}
                        </TableCell>
                      ))}
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
