import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Hourglass,
  Users,
  FileText,
  Banknote,
  CheckCircle2,
  FileSpreadsheet,
  BarChart3,
  UserCog,
  Settings,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const items = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Aging Accounts", url: "/aging", icon: Hourglass },
  { title: "Customers", url: "/customers", icon: Users },
  { title: "Invoices", url: "/invoices", icon: FileText },
  { title: "Payments", url: "/payments", icon: Banknote },
  { title: "Settled Accounts", url: "/settled", icon: CheckCircle2 },
  { title: "Excel Import", url: "/import", icon: FileSpreadsheet },
  { title: "Reports", url: "/reports", icon: BarChart3 },
  { title: "Users", url: "/users", icon: UserCog },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const currentPath = useRouterState({ select: (r) => r.location.pathname });

  return (
    <Sidebar collapsible="icon" className="no-print">
      <SidebarHeader className="border-b px-3 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            F
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <p className="text-sm font-bold">Foxtrot</p>
              <p className="text-[11px] text-muted-foreground">Aging Accounts</p>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Receivables</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={currentPath === item.url || currentPath.startsWith(item.url + "/")}
                    tooltip={item.title}
                  >
                    <Link to={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
