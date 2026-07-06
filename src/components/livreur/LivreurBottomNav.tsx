import { NavLink } from "react-router-dom";
import { BarChart3, Package } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { path: "/livreur/orders", label: "Commandes", icon: Package },
  { path: "/livreur/stats", label: "Statistiques", icon: BarChart3 },
] as const;

export const LivreurBottomNav = () => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200/90 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/90">
      <div className="mx-auto grid max-w-lg grid-cols-2 gap-1 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1">
        {TABS.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center gap-0.5 rounded-xl py-2.5 text-xs font-medium transition-colors",
                isActive
                  ? "bg-matles-50 text-matles-700"
                  : "text-muted-foreground hover:bg-slate-50 hover:text-slate-900"
              )
            }
          >
            <Icon className="h-5 w-5" />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
};
