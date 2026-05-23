import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { 
  Package2, 
  ShoppingCart, 
  Users, 
  Package, 
  ChevronLeft,
  ChevronRight, 
  LayoutDashboard,
  Truck,
  Settings,
  LineChart,
  Activity,
  FileText,
  Wallet,
  Trophy,
  BarChart3,
  UserCheck,
  Users2,
  Lock,
  LayoutGrid
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export const Sidebar = ({ collapsed, onToggle }: SidebarProps) => {
  const location = useLocation();
  const { user } = useAuth();

  const menuItems = [
    {
      title: "Dashboard",
      icon: <LayoutDashboard className="h-5 w-5" />,
      path: "/",
    },
    {
      title: "Products",
      icon: <Package2 className="h-5 w-5" />,
      path: "/products",
    },
    {
      title: "Stock",
      icon: <Package className="h-5 w-5" />,
      path: "/stock",
      adminOnly: true,
    },
    {
      title: "Pillow Orders",
      icon: <ShoppingCart className="h-5 w-5" />,
      path: "/pillow-orders",
    },
    {
      title: "Order Management",
      icon: <ShoppingCart className="h-5 w-5" />,
      path: "/orders-management",
    },
    {
      title: "Sales Overview",
      icon: <LineChart className="h-5 w-5" />,
      path: "/sales",
    },
    {
      title: "Product overview",
      icon: <LayoutGrid className="h-5 w-5" />,
      path: "/product-overview",
    },
    {
      title: "Invoice",
      icon: <FileText className="h-5 w-5" />,
      path: "/invoice",
      adminOnly: true,
    },
    {
      title: "Invoices Tracking",
      icon: <BarChart3 className="h-5 w-5" />,
      path: "/invoices",
      adminOnly: true,
    },
    {
      title: "Finance",
      icon: <Wallet className="h-5 w-5" />,
      path: "/finance",
      adminOnly: true,
    },
    {
      title: "Leaderboard",
      icon: <Trophy className="h-5 w-5" />,
      path: "/leaderboard",
    },
    {
      title: "Users",
      icon: <Users className="h-5 w-5" />,
      path: "/users",
      adminOnly: true,
    },
    {
      title: "Delivery",
      icon: <Truck className="h-5 w-5" />,
      path: "/delivery",
    },
    {
      title: "Activities",
      icon: <Activity className="h-5 w-5" />,
      path: "/activities",
      adminOnly: true,
    },
    {
      title: "Advanced Edit",
      icon: <Lock className="h-5 w-5" />,
      path: "/advanced-edit",
      adminOnly: true,
    },
    {
      title: "Settings",
      icon: <Settings className="h-5 w-5" />,
      path: "/settings",
      adminOnly: true,
    },
    {
      title: "Confirmation Team",
      icon: <UserCheck className="h-5 w-5" />,
      path: "/confirmation-team",
      adminOnly: false
    },
    {
      title: "Confirmation Overview",
      icon: <Users2 className="h-5 w-5" />,
      path: "/confirmation-team-overview",
      adminOnly: false
    },
  ];

  return (
    <div 
      className={cn(
        "fixed top-0 left-0 h-full z-50 bg-white border-r border-gray-200 flex flex-col transition-all duration-300",
        collapsed ? "w-20" : "w-64"
      )}
    >
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        {!collapsed && (
          <div className="font-bold text-2xl text-matles-700">Matles</div>
        )}
        <button onClick={onToggle} className="p-2 rounded-md hover:bg-gray-100">
          {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
        </button>
      </div>

      <div className="flex flex-col flex-1 py-4 overflow-y-auto">
        {menuItems.filter(item => !item.adminOnly || user?.role === 'ADMIN').map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              "flex items-center gap-4 px-4 py-3 hover:bg-gray-100",
              location.pathname === item.path && "bg-matles-50 text-matles-700 font-medium border-l-4 border-matles-600",
              collapsed && "justify-center"
            )}
          >
            {item.icon}
            {!collapsed && <span>{item.title}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
};
