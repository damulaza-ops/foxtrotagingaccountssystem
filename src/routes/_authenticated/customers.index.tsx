import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { MoreHorizontal, Plus } from "lucide-react";
import { PageHeader, EmptyState, LoadingRows } from "@/components/page-blocks";
import { CustomerDialog } from "@/components/customer-dialog";
import { supabase } from "@/integrations/supabase/client";
import { fetchCustomers, fetchInvoices, qk, type Customer } from "@/lib/data";
import { fmtKES } from "@/lib/format";
import { daysOverdue } from "@/lib/aging";
import { useAuthz } from "@/hooks/use-authz";

export const Route = createFileRoute("/_authenticated/customers/")({
  component: CustomersPage,
});

function CustomersPage() {
  const queryClient = useQueryClient();
  const { isManager, isAdmin } = useAuthz();
  const { data: customers, isLoading } = useQuery({ queryKey: qk.customers, queryFn: fetchCustomers });
  const { data: invoices = [] } = useQuery({ queryKey: qk.invoices, queryFn: fetchInvoices });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [archiving, setArchiving] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);

  const balances = useMemo(() => {
    const map = new Map<string, { balance: number; overdue: number }>();
    for (const i of invoices) {
      if (["written_off", "cancelled"].includes(i.payment_status)) continue;
      const out = Number(i.outstanding_balance);
      if (out <= 0) continue;
      const cur = map.get(i.customer_id) ?? { balance: 0, overdue: 0 };
      cur.balance += out;
      if (daysOverdue(i.due_date) > 0) cur.overdue += out;
      map.set(i.customer_id, cur);
    }
    return map;
  }, [invoices]);

  const filtered = (customers ?? []).filter((c) => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        c.business_name.toLowerCase().includes(q) ||
        c.customer_code.toLowerCase().includes(q) ||
        (c.branch_name ?? "").toLowerCase().includes(q) ||
        (c.contact_person ?? "").toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const archiveMutation = useMutation({
    mutationFn: async (c: Customer) => {
      const { error } = await supabase.from("customers").update({ status: c.status === "archived" ? "active" : "archived" }).eq("id", c.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.customers });
      toast.success("Customer updated");
      setArchiving(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (c: Customer) => {
      const { error } = await supabase.from("customers").delete().eq("id", c.id);
      if (error) {
        if (error.code === "23503")
          throw new Error("This customer has invoices or payments and cannot be deleted. Archive them instead.");
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.customers });
      toast.success("Customer deleted");
      setDeleting(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Manage customer accounts and credit terms"
        actions={
          isManager && (
            <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
              <Plus className="mr-1 h-4 w-4" />New customer
            </Button>
          )
        }
      />

      <Card className="no-print mb-4">
        <CardContent className="flex flex-wrap gap-3 p-4">
          <Input className="max-w-sm" placeholder="Search customers…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="on_hold">On hold</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4"><LoadingRows /></div>
          ) : filtered.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="No customers found"
                description="Add your first customer or import them from Excel."
                action={isManager ? <Button onClick={() => setDialogOpen(true)}>Add customer</Button> : undefined}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Business name</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Telephone</TableHead>
                    <TableHead className="text-right">Credit period</TableHead>
                    <TableHead className="text-right">Credit limit</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="text-right">Overdue</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="no-print" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => {
                    const b = balances.get(c.id) ?? { balance: 0, overdue: 0 };
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-mono text-xs">{c.customer_code}</TableCell>
                        <TableCell>
                          <Link to="/customers/$id" params={{ id: c.id }} className="font-medium hover:underline">
                            {c.business_name}
                          </Link>
                        </TableCell>
                        <TableCell>{c.branch_name ?? "—"}</TableCell>
                        <TableCell>{c.contact_person ?? "—"}</TableCell>
                        <TableCell>{c.phone ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{c.credit_days}d</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtKES(Number(c.credit_limit))}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{fmtKES(b.balance)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium text-destructive">
                          {b.overdue > 0 ? fmtKES(b.overdue) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={c.status === "active" ? "bg-success/15 text-success border-success/30" : "bg-muted text-muted-foreground"}>
                            {c.status === "on_hold" ? "On hold" : c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell className="no-print">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link to="/customers/$id" params={{ id: c.id }}>View profile & statement</Link>
                              </DropdownMenuItem>
                              {isManager && (
                                <>
                                  <DropdownMenuItem onClick={() => { setEditing(c); setDialogOpen(true); }}>Edit</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setArchiving(c)}>
                                    {c.status === "archived" ? "Restore" : "Archive"}
                                  </DropdownMenuItem>
                                </>
                              )}
                              {isAdmin && (
                                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleting(c)}>
                                  Delete
                                </DropdownMenuItem>
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

      <CustomerDialog open={dialogOpen} onOpenChange={setDialogOpen} customer={editing} />
      <AlertDialog open={!!archiving} onOpenChange={(o) => !o && setArchiving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {archiving?.status === "archived" ? "Restore" : "Archive"} {archiving?.business_name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {archiving?.status === "archived"
                ? "The customer will be visible in active lists again."
                : "Archived customers are hidden from active lists but their history is kept."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => archiving && archiveMutation.mutate(archiving)}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.business_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the customer record. Customers with invoices or payments cannot be deleted — archive them instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={(e) => { e.preventDefault(); if (deleting) deleteMutation.mutate(deleting); }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
