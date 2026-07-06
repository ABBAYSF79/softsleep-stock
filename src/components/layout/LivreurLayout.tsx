import { ReactNode } from "react";
import { LogOut, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { LivreurBottomNav } from "@/components/livreur/LivreurBottomNav";

interface LivreurLayoutProps {
  children: ReactNode;
  title?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const LivreurLayout = ({
  children,
  title = "Mes livraisons",
  onRefresh,
  isRefreshing,
}: LivreurLayoutProps) => {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/90">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-matles-700 text-white shadow-sm">
              <Truck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold text-slate-900">{title}</h1>
              <p className="truncate text-xs text-muted-foreground">{user?.name}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {onRefresh && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 px-2 text-xs"
                onClick={onRefresh}
                disabled={isRefreshing}
              >
                {isRefreshing ? "..." : "Actualiser"}
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground"
              onClick={logout}
              aria-label="Déconnexion"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-lg px-3 pb-24 pt-3 sm:px-4">{children}</main>
      <LivreurBottomNav />
    </div>
  );
};
