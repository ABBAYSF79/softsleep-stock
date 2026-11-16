import {
  Activity,
  BarChart3,
  FileSpreadsheet,
  FileText,
  Home,
  LayoutGrid,
  LineChart,
  Lock,
  Package,
  Package2,
  Pencil,
  Settings,
  ShoppingCart,
  Truck,
  UserCheck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type NavGroupId =
  | "main"
  | "catalog"
  | "orders"
  | "analytics"
  | "finance"
  | "admin";

export interface NavGroup {
  id: NavGroupId;
  label: string;
}

export interface NavItem {
  title: string;
  path: string;
  icon: LucideIcon;
  group: NavGroupId;
  adminOnly?: boolean;
  livreurOnly?: boolean;
  suiviAllowed?: boolean;
  highlight?: boolean;
  /** When true, only exact pathname matches (e.g. Home at /). */
  exact?: boolean;
}

export const APP_NAME = "Matelas Stock";
export const APP_TAGLINE = "SoftSleep Management";
/** Bump when deploying frontend — visible in sidebar so you can confirm the server build. */
export const APP_VERSION = "v2026.09.11a";

export const NAV_GROUPS: NavGroup[] = [
  { id: "main", label: "Main" },
  { id: "catalog", label: "Catalog" },
  { id: "orders", label: "Orders" },
  { id: "analytics", label: "Analytics" },
  { id: "finance", label: "Finance" },
  { id: "admin", label: "Administration" },
];

export const NAV_ITEMS: NavItem[] = [
  {
    title: "Home",
    path: "/",
    icon: Home,
    group: "main",
    exact: true,
  },
  {
    title: "Products",
    path: "/products",
    icon: Package2,
    group: "catalog",
    suiviAllowed: true,
  },
  {
    title: "Stock",
    path: "/stock",
    icon: Package,
    group: "catalog",
  },
  {
    title: "Order Management",
    path: "/orders-management",
    icon: ShoppingCart,
    group: "orders",
    highlight: true,
    suiviAllowed: true,
  },
  {
    title: "Amana Management",
    path: "/amana-management",
    icon: Package,
    group: "orders",
    suiviAllowed: true,
  },
  {
    title: "Quick Edit",
    path: "/quick-edit",
    icon: Pencil,
    group: "orders",
  },
  {
    title: "Sales Overview",
    path: "/sales",
    icon: LineChart,
    group: "analytics",
  },
  {
    title: "Product Overview",
    path: "/product-overview",
    icon: LayoutGrid,
    group: "analytics",
  },
  {
    title: "Confirmation Team",
    path: "/confirmation-team",
    icon: UserCheck,
    group: "analytics",
  },
  {
    title: "Team Overview",
    path: "/team-overview-2",
    icon: BarChart3,
    group: "analytics",
  },
  {
    title: "Invoice",
    path: "/invoice",
    icon: FileText,
    group: "finance",
    adminOnly: true,
  },
  {
    title: "Invoices Tracking",
    path: "/invoices",
    icon: BarChart3,
    group: "finance",
    adminOnly: true,
  },
  {
    title: "Finance",
    path: "/finance",
    icon: Wallet,
    group: "finance",
    adminOnly: true,
  },
  {
    title: "Users",
    path: "/users",
    icon: Users,
    group: "admin",
    adminOnly: true,
  },
  {
    title: "Mes livraisons",
    path: "/livreur/orders",
    icon: Truck,
    group: "orders",
    livreurOnly: true,
    highlight: true,
  },
  {
    title: "Statistiques",
    path: "/livreur/stats",
    icon: BarChart3,
    group: "orders",
    livreurOnly: true,
  },
  {
    title: "Delivery",
    path: "/delivery",
    icon: Truck,
    group: "admin",
    suiviAllowed: true,
  },
  {
    title: "Activities",
    path: "/activities",
    icon: Activity,
    group: "admin",
    adminOnly: true,
  },
  {
    title: "Export clients",
    path: "/export-clients",
    icon: FileSpreadsheet,
    group: "admin",
    adminOnly: true,
  },
  {
    title: "Advanced Edit",
    path: "/advanced-edit",
    icon: Lock,
    group: "admin",
    adminOnly: true,
  },
  {
    title: "Settings",
    path: "/settings",
    icon: Settings,
    group: "admin",
    adminOnly: true,
  },
];

export function getNavTitle(pathname: string): string {
  const exact = NAV_ITEMS.find((item) => item.path === pathname);
  if (exact) return exact.title;
  return APP_NAME;
}

export function filterNavItems(isAdmin: boolean, isLivreur = false, isSuivi = false): NavItem[] {
  if (isLivreur) {
    return NAV_ITEMS.filter((item) => item.livreurOnly);
  }
  if (isSuivi) {
    return NAV_ITEMS.filter((item) => item.suiviAllowed);
  }
  return NAV_ITEMS.filter((item) => (!item.adminOnly || isAdmin) && !item.livreurOnly);
}
