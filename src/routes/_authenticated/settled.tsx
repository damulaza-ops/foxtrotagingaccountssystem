import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, Printer } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, StatCard, LoadingRows, EmptyState } from "@/components/page-blocks";
import { StatusBadge } from "@/components/status-badge";
import { fetchInvoices, fetchPayments, qk } from "@/lib/data";
import { fmtDate, fmtKES } from "@/lib/format";
import { daysOverdue, displayStatus } from "@/lib/aging";
import { exportExcel, printPage } from "@/lib/export";

export const Route = createFileRoute("/_authenticated/settled")({
  head: () => ({
    meta: [
      { title: "Settled Accounts — Foxtrot Aging Accounts" },
      { name: "description", content: "Fully paid and written-off invoices with settlement dates and collection turnaround." },
      { property: "og:title", content: "Settled Accounts — Foxtrot Aging Accounts" },
      { property: "og:description", content: "Fully paid and written-off invoices with settlement dates and collection turnaround." },
    ],
  }),
  component: SettledPage,
});

function SettledPage() {
  const { data: invoices, isLoading } = useQuery({ queryKey: qk.invoices, queryFn: fetchInvoices });
  const { data: payments } = useQuery({ queryKey: qk.payments, queryFn: fetchPayments });

  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Last non-reversed payment date per invoice = settlement date
  const settledOn = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of payments ?? []) {
      if (p.reversed) continue;
      for (const a of p.payment_allocations) {
        const prev = map.get(a.invoice_id);
        if (!prev || p.payment_date > prev) map.set(a.invoice_id, p.payment_date);
      }
    }
    return map;
  }, [payments]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (invoices ?? [])
      .filter((i) => {
        const st = displayStatus(i);
        if (st !== "paid" && st !== "written_off") return false;
        const date = settledOn.get(i.id) ?? i.updated_at.slice(0, 10);
        if (from && date < from) return false;
        if (to && date > to) return false;
        if (!q) return true;
        return (
          i.invoice_number.toLowerCase().includes(q) ||
          (i.customers?.business_name ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (settledOn.get(b.id) ?? b.updated_at).localeCompare(settledOn.get(a.id) ?? a.updated_at));
  }, [invoices, settledOn, search, from, to]);

  const totalSettled = rows.reduce((s, i) => s + Number(i.amount_paid), 0);
  const writtenOff = rows.filter((i) => displayStatus(i) === "written_off");
  const writtenOffValue = writtenOff.reduce((s, i) => s + (Number(i.invoice_amount) - Number(i.amount_paid)), 0);
  const withDays = rows
    .map((i) => {
      const d = settledOn.get(i.id);
      if (!d) return null;
      return Math.max(0, Math.floor((new Date(d + "T00:00:00").getTime() - new Date(i.invoice_date + "T00:00:00").getTime()) / 86400000));
    })
    .filter((n): n is number => n !== null);
  const avgDays = withDays.length ? Math.round(withDays.reduce((a, b) => a + b, 0) / withDays.length) : 0;

  function handleExport() {
    exportExcel(
      rows.map((i) => ({
        "Invoice No": i.invoice_number,
        Customer: i.customers?.business_name ?? "",
        "Invoice Date": i.invoice_date,
        "Due Date": i.due_date,
        "Settled On": settledOn.get(i.id) ?? "",
        "Amount (KES)": Number(i.invoice_amount),
        "Paid (KES)": Number(i.amount_paid),
        Status: displayStatus(i) === "written_off" ? "Written off" : "Paid",
      })),
      "foxtrot-settled-accounts",
      "Settled",
    );
  }

  return (
    <div className="print-area">
      <PageHeader
        title="Settled Accounts"
        description="Invoices that have been fully paid or written off."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" /> Export
            </Button>
            <Button variant="outline" size="sm" onClick={printPage}>
              <Printer className="mr-2 h-4 w-4" /> Print
            </Button>
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Settled invoices" value={rows.length} />
        <StatCard label="Value collected" value={fmtKES(totalSettled)} tone="success" />
        <StatCard label="Written off" value={fmtKES(writtenOffValue)} sub={`${writtenOff.length} invoices`} tone="destructive" />
        <StatCard label="Avg. days to settle" value={`${avgDays} days`} />
      </div>

      <Card className="mb-4 no-print">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-3">
          <div>
            <Label className="text-xs">Search</Label>
            <Input placeholder="Invoice no. or customer" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Settled from</Label>
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
            <EmptyState title="No settled accounts yet" description="Fully paid or written-off invoices will appear here." />
          ) : (
            <div className="w-full overflow-x-auto">
              <Table className="min-w-[900px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Invoice date</TableHead>
                    <TableHead>Due date</TableHead>
                    <TableHead>Settled on</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Days late</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((i) => {
                    const s = settledOn.get(i.id);
                    const late = s ? daysOverdue(i.due_date, new Date(s + "T00:00:00")) : 0;
                    return (
                      <TableRow key={i.id}>
                        <TableCell className="font-mono text-xs">{i.invoice_number}</TableCell>
                        <TableCell>
                          <Link to="/customers/$id" params={{ id: i.customer_id }} className="font-medium hover:underline">
                            {i.customers?.business_name ?? "—"}
                          </Link>
                        </TableCell>
                        <TableCell>{fmtDate(i.invoice_date)}</TableCell>
                        <TableCell>{fmtDate(i.due_date)}</TableCell>
                        <TableCell>{s ? fmtDate(s) : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtKES(Number(i.invoice_amount))}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtKES(Number(i.amount_paid))}</TableCell>
                        <TableCell className="text-right tabular-nums">{late > 0 ? late : "On time"}</TableCell>
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
    </div>
  );
}
