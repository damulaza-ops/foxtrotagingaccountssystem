import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { PageHeader, StatCard, LoadingRows, EmptyState } from "@/components/page-blocks";
import { UrgencyBadge } from "@/components/status-badge";
import { fetchInvoices, fetchPayments, qk } from "@/lib/data";
import { fmtKES } from "@/lib/format";
import { AGING_BUCKETS, agingBucket, daysOverdue, displayStatus, urgency } from "@/lib/aging";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Foxtrot Aging Accounts" },
      { name: "description", content: "Receivables overview: total outstanding, overdue balances, aging mix and recent collections." },
      { property: "og:title", content: "Dashboard — Foxtrot Aging Accounts" },
      { property: "og:description", content: "Receivables overview: total outstanding, overdue balances, aging mix and recent collections." },
    ],
  }),
  component: Dashboard,
});

const COLORS = ["#94a3b8", "#86efac", "#fde047", "#fbbf24", "#fb923c", "#ef4444", "#991b1b"];

function Dashboard() {
  const { data: invoices, isLoading: loadingInv } = useQuery({ queryKey: qk.invoices, queryFn: fetchInvoices });
  const { data: payments, isLoading: loadingPay } = useQuery({ queryKey: qk.payments, queryFn: fetchPayments });

  if (loadingInv || loadingPay) {
    return (
      <div>
        <PageHeader title="Dashboard" />
        <LoadingRows />
      </div>
    );
  }

  const invs = (invoices ?? []).filter((i) => i.payment_status !== "cancelled");
  const active = invs.filter((i) => i.payment_status !== "written_off");
  const open = active.filter((i) => Number(i.outstanding_balance) > 0);
  const overdue = open.filter((i) => daysOverdue(i.due_date) > 0);
  const settled = active.filter((i) => Number(i.outstanding_balance) <= 0 && Number(i.invoice_amount) > 0);
  const validPayments = (payments ?? []).filter((p) => !p.reversed);

  const totalOutstanding = open.reduce((s, i) => s + Number(i.outstanding_balance), 0);
  const totalOverdue = overdue.reduce((s, i) => s + Number(i.outstanding_balance), 0);
  const totalCollected = validPayments.reduce((s, p) => s + Number(p.amount), 0);
  const customersWithBalance = new Set(open.map((i) => i.customer_id)).size;
  const criticalCount = overdue.filter((i) => urgency(daysOverdue(i.due_date)) === "Critical").length;

  // Aging distribution
  const agingData = AGING_BUCKETS.map((b) => ({
    name: b,
    value: open
      .filter((i) => agingBucket(daysOverdue(i.due_date)) === b)
      .reduce((s, i) => s + Number(i.outstanding_balance), 0),
  }));

  // Outstanding by customer (top 10)
  const byCustomer = new Map<string, number>();
  for (const i of open) {
    const name = i.customers?.business_name ?? "Unknown";
    byCustomer.set(name, (byCustomer.get(name) ?? 0) + Number(i.outstanding_balance));
  }
  const customerData = [...byCustomer.entries()]
    .map(([name, value]) => ({ name: name.length > 18 ? name.slice(0, 18) + "…" : name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // Monthly invoices vs payments (last 6 months)
  const months: string[] = [];
  const now = new Date();
  for (let m = 5; m >= 0; m--) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    months.push(d.toISOString().slice(0, 7));
  }
  const monthly = months.map((m) => ({
    month: new Date(m + "-01").toLocaleDateString("en-KE", { month: "short", year: "2-digit" }),
    invoiced: invs.filter((i) => i.invoice_date.startsWith(m)).reduce((s, i) => s + Number(i.invoice_amount), 0),
    collected: validPayments.filter((p) => p.payment_date.startsWith(m)).reduce((s, p) => s + Number(p.amount), 0),
  }));

  // Follow-up table: worst overdue first
  const followUpList = [...overdue]
    .sort((a, b) => daysOverdue(b.due_date) - daysOverdue(a.due_date))
    .slice(0, 10);

  return (
    <div>
      <PageHeader title="Dashboard" description="Accounts receivable overview" />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <StatCard label="Outstanding" value={fmtKES(totalOutstanding)} />
        <StatCard label="Overdue" value={fmtKES(totalOverdue)} tone="destructive" />
        <StatCard label="Collected" value={fmtKES(totalCollected)} tone="success" />
        <StatCard label="Customers w/ balance" value={customersWithBalance} />
        <StatCard label="Overdue accounts" value={overdue.length} tone="destructive" />
        <StatCard label="Critical accounts" value={criticalCount} tone="destructive" />
        <StatCard label="Settled invoices" value={settled.length} tone="success" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Aging balance distribution</CardTitle></CardHeader>
          <CardContent className="h-72">
            {agingData.every((d) => d.value === 0) ? (
              <EmptyState title="No outstanding balances" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={agingData.filter((d) => d.value > 0)} dataKey="value" nameKey="name" outerRadius={90} label={(e) => e.name}>
                    {agingData.filter((d) => d.value > 0).map((d) => (
                      <Cell key={d.name} fill={COLORS[AGING_BUCKETS.indexOf(d.name as (typeof AGING_BUCKETS)[number])]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmtKES(v)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Outstanding balance by customer</CardTitle></CardHeader>
          <CardContent className="h-72">
            {customerData.length === 0 ? (
              <EmptyState title="No outstanding balances" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={customerData} layout="vertical" margin={{ left: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => fmtKES(v)} />
                  <Bar dataKey="value" fill="#ef4444" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Monthly invoices vs payments</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                <Tooltip formatter={(v: number) => fmtKES(v)} />
                <Legend />
                <Bar dataKey="invoiced" name="Invoiced" fill="#64748b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="collected" name="Collected" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Payments collected by month</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                <Tooltip formatter={(v: number) => fmtKES(v)} />
                <Bar dataKey="collected" name="Collected" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Accounts requiring immediate follow-up</CardTitle>
          <Button asChild variant="outline" size="sm"><Link to="/aging">View all aging accounts</Link></Button>
        </CardHeader>
        <CardContent>
          {followUpList.length === 0 ? (
            <EmptyState title="No overdue accounts" description="All invoices are current or settled. Great work!" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Due date</TableHead>
                    <TableHead className="text-right">Days overdue</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead>Urgency</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {followUpList.map((i) => {
                    const d = daysOverdue(i.due_date);
                    return (
                      <TableRow key={i.id}>
                        <TableCell>
                          <Link to="/customers/$id" params={{ id: i.customer_id }} className="font-medium hover:underline">
                            {i.customers?.business_name ?? "—"}
                          </Link>
                        </TableCell>
                        <TableCell>{i.invoice_number}</TableCell>
                        <TableCell>{i.due_date}</TableCell>
                        <TableCell className="text-right tabular-nums">{d}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium text-destructive">
                          {fmtKES(Number(i.outstanding_balance))}
                        </TableCell>
                        <TableCell><UrgencyBadge level={urgency(d)} /></TableCell>
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
