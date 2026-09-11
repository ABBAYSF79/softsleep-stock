import {
  Activity,
  BarChart3,
  FileText,
  Home,
  LayoutGrid,
  LineChart,
  Lock,
  Package,
  Package2,
  Settings,
  ShoppingCart,
  Truck,
  UserCheck,
  Users,
  Wallet,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

export type NavGroupId =
  | "main"
  | "catalog"
  | "inventory"
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
  /** When true, only exact pathname matches (e.g. Overview at /inventory). */
  exact?: boolean;
}

export const APP_NAME = "Matelas Stock";
export const APP_TAGLINE = "SoftSleep Management";
/** Bump when deploying frontend — visible in sidebar so you can confirm the server build. */
export const APP_VERSION = "v2026.09.11a";

export const NAV_GROUPS: NavGroup[] = [
  { id: "main", label: "Main" },
  { id: "catalog", label: "Catalog" },
  { id: "inventory", label: "Accessoires" },
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
    adminOnly: true,
  },
  {
    title: "Inventory",
    path: "/inventory",
    icon: Warehouse,
    group: "inventory",
    adminOnly: true,
    highlight: true,
  },
  {
    title: "Legacy Accessoires Stock",
    path: "/pillow-stock",
    icon: Package,
    group: "inventory",
    adminOnly: true,
  },
  {
    title: "Accessoires Orders",
    path: "/pillow-orders",
    icon: ShoppingCart,
    group: "orders",
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
  if (pathname.startsWith("/inventory/transfers/")) return "Transfer";
  if (pathname.startsWith("/inventory/documents/")) return "Document";
  if (pathname.startsWith("/inventory/stock")) return "Inventory Stock";
  if (pathname.startsWith("/inventory/locations")) return "Locations";
  if (pathname.startsWith("/inventory/transfers")) return "Transfers";
  if (pathname.startsWith("/inventory/documents")) return "Documents";
  if (pathname.startsWith("/inventory/reservations")) return "Reservations";
  if (pathname.startsWith("/inventory/history")) return "Inventory History";
  if (pathname.startsWith("/inventory/cutover")) return "Cutover";
  if (pathname.startsWith("/inventory/reconciliation")) return "Reconciliation";
  if (pathname.startsWith("/inventory")) return "Inventory";
  if (pathname.startsWith("/pillow-stock")) return "Legacy Accessoires Stock";
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
