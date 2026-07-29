import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "administrator" | "accounts_manager" | "collections_officer" | "viewer";

export function useAuthz() {
  const { data, isLoading } = useQuery({
    queryKey: ["authz"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return { userId: null as string | null, roles: [] as AppRole[], email: "" };
      const { data: roleRows } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      return {
        userId: user.id,
        roles: (roleRows ?? []).map((r) => r.role as AppRole),
        email: user.email ?? "",
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  const roles = data?.roles ?? [];

// Temporary override for Rebecca
const isRebecca =
  (data?.email ?? "").toLowerCase() === "rebecca@foxcap.eu";

const isAdmin =
  roles.includes("administrator") || isRebecca;

const isManager =
  isAdmin || roles.includes("accounts_manager");

const canFollowUp =
  isManager || roles.includes("collections_officer");

  return {
    loading: isLoading,
    userId: data?.userId ?? null,
    email: data?.email ?? "",
    roles,
    isAdmin,
    isManager,
    canFollowUp,
  };
}

export const ROLE_LABELS: Record<AppRole, string> = {
  administrator: "Administrator",
  accounts_manager: "Accounts Manager",
  collections_officer: "Collections Officer",
  viewer: "Viewer",
};
