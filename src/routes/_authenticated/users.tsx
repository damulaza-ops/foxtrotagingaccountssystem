import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, LoadingRows, EmptyState } from "@/components/page-blocks";
import { supabase } from "@/integrations/supabase/client";
import { qk, type Profile } from "@/lib/data";
import { fmtDate } from "@/lib/format";
import { useAuthz, ROLE_LABELS, type AppRole } from "@/hooks/use-authz";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({
    meta: [
      { title: "Users & Roles — Foxtrot Aging Accounts" },
      { name: "description", content: "Manage system users, assign roles and control access to receivables data." },
      { property: "og:title", content: "Users & Roles — Foxtrot Aging Accounts" },
      { property: "og:description", content: "Manage system users, assign roles and control access to receivables data." },
    ],
  }),
  component: UsersPage,
});

const ALL_ROLES: AppRole[] = ["administrator", "accounts_manager", "collections_officer", "viewer"];

type UserRow = Profile & { roles: AppRole[] };

async function fetchUsers(): Promise<UserRow[]> {
  const [{ data: profiles, error: pErr }, { data: roles, error: rErr }] = await Promise.all([
    supabase.from("profiles").select("*").order("full_name"),
    supabase.from("user_roles").select("user_id, role"),
  ]);
  if (pErr) throw pErr;
  if (rErr) throw rErr;
  return (profiles ?? []).map((p) => ({
    ...p,
    roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as AppRole),
  }));
}

function UsersPage() {
  const queryClient = useQueryClient();
  const { isAdmin, userId } = useAuthz();
  const { data: users, isLoading } = useQuery({ queryKey: ["users-with-roles"], queryFn: fetchUsers });
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users ?? [];
    return (users ?? []).filter(
      (u) => u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    );
  }, [users, search]);

  const roleMutation = useMutation({
    mutationFn: async ({ id, role, enabled }: { id: string; role: AppRole; enabled: boolean }) => {
      if (enabled) {
        const { error } = await supabase.from("user_roles").insert({ user_id: id, role });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("user_roles").delete().eq("user_id", id).eq("role", role);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Roles updated");
      queryClient.invalidateQueries({ queryKey: ["users-with-roles"] });
      queryClient.invalidateQueries({ queryKey: ["authz"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("profiles").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("User status updated");
      queryClient.invalidateQueries({ queryKey: ["users-with-roles"] });
      queryClient.invalidateQueries({ queryKey: qk.profiles });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader title="Users & Roles" description="Everyone with access to the Foxtrot Aging Accounts System." />

      {!isAdmin && (
        <Card className="mb-4 border-warning/40 bg-warning/10">
          <CardContent className="flex items-center gap-2 p-4 text-sm">
            <ShieldCheck className="h-4 w-4" />
            You can view users, but only administrators can change roles or access.
          </CardContent>
        </Card>
      )}

      <Card className="mb-4 no-print">
        <CardContent className="p-4">
          <Label className="text-xs">Search</Label>
          <Input className="max-w-sm" placeholder="Name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">System users</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4"><LoadingRows /></div>
          ) : rows.length === 0 ? (
            <EmptyState title="No users found" description="New users appear here after they sign up." />
          ) : (
            <div className="w-full overflow-x-auto">
              <Table className="min-w-[900px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Joined</TableHead>
                    {ALL_ROLES.map((r) => (
                      <TableHead key={r} className="text-center">{ROLE_LABELS[r]}</TableHead>
                    ))}
                    <TableHead>Status</TableHead>
                    <TableHead className="no-print" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">
                        {u.full_name || "—"}
                        {u.id === userId && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                      </TableCell>
                      <TableCell className="text-sm">{u.email}</TableCell>
                      <TableCell className="text-sm">{u.phone ?? "—"}</TableCell>
                      <TableCell className="text-sm">{fmtDate(u.created_at)}</TableCell>
                      {ALL_ROLES.map((r) => (
                        <TableCell key={r} className="text-center">
                          <Checkbox
                            checked={u.roles.includes(r)}
                            disabled={!isAdmin || roleMutation.isPending}
                            onCheckedChange={(v) => roleMutation.mutate({ id: u.id, role: r, enabled: v === true })}
                            aria-label={`${ROLE_LABELS[r]} for ${u.full_name || u.email}`}
                          />
                        </TableCell>
                      ))}
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={u.status === "active" ? "bg-success/15 text-success border-success/30" : "bg-muted text-muted-foreground"}
                        >
                          {u.status === "active" ? "Active" : "Suspended"}
                        </Badge>
                      </TableCell>
                      <TableCell className="no-print">
                        {isAdmin && u.id !== userId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={statusMutation.isPending}
                            onClick={() => statusMutation.mutate({ id: u.id, status: u.status === "active" ? "suspended" : "active" })}
                          >
                            {u.status === "active" ? "Suspend" : "Reactivate"}
                          </Button>
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
    </div>
  );
}
