import { Link, useLocation } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  APP_NAME,
  APP_TAGLINE,
  NAV_GROUPS,
  filterNavItems,
} from "./nav-config";

export interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export const Sidebar = ({ collapsed, onToggle }: SidebarProps) => {
  const location = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const visibleItems = filterNavItems(isAdmin);

  return (
    <aside
      className={cn(
        "fixed top-0 left-0 z-50 flex h-full flex-col border-r border-gray-200/80 bg-white shadow-sm transition-all duration-300",
        collapsed ? "w-[4.5rem]" : "w-64"
      )}
    >
      {/* Brand */}
      <div
        className={cn(
          "flex h-14 shrink-0 items-center border-b border-gray-200/80 px-3",
          collapsed ? "justify-center" : "justify-between"
        )}
      >
        {!collapsed ? (
          <Link to="/" className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-matles-700 text-sm font-bold text-white shadow-sm">
              MS
            </div>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold text-gray-900">{APP_NAME}</p>
              <p className="truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {APP_TAGLINE}
              </p>
            </div>
          </Link>
        ) : (
          <Link
            to="/"
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-matles-700 text-sm font-bold text-white shadow-sm"
            title={APP_NAME}
          >
            MS
          </Link>
        )}

        {!collapsed && (
          <button
            type="button"
            onClick={onToggle}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-gray-100 hover:text-gray-900"
            aria-label="Collapse sidebar"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {collapsed && (
        <div className="flex justify-center border-b border-gray-200/80 py-2">
          <button
            type="button"
            onClick={onToggle}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-gray-100 hover:text-gray-900"
            aria-label="Expand sidebar"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {NAV_GROUPS.map((group) => {
          const groupItems = visibleItems.filter((item) => item.group === group.id);
          if (groupItems.length === 0) return null;

          return (
            <div key={group.id} className="mb-4 last:mb-0">
              {!collapsed && (
                <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/80">
                  {group.label}
                </p>
              )}
              <ul className="space-y-0.5">
                {groupItems.map((item) => {
                  const isActive = location.pathname === item.path;
                  const Icon = item.icon;

                  return (
                    <li key={item.path}>
                      <Link
                        to={item.path}
                        title={collapsed ? item.title : undefined}
                        className={cn(
                          "group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-all duration-150",
                          collapsed && "justify-center px-2",
                          item.highlight &&
                            !isActive &&
                            "border border-matles-100/80 bg-matles-50/50 text-matles-800 hover:bg-matles-50",
                          !item.highlight && !isActive && "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
                          isActive &&
                            "bg-matles-700 font-medium text-white shadow-sm hover:bg-matles-700 hover:text-white",
                          item.highlight && isActive && "border-matles-700"
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0",
                            isActive ? "text-white" : "text-gray-500 group-hover:text-gray-700"
                          )}
                        />
                        {!collapsed && (
                          <span className="truncate">{item.title}</span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* User footer */}
      {!collapsed && user && (
        <div className="shrink-0 border-t border-gray-200/80 p-3">
          <div className="rounded-lg bg-gray-50 px-3 py-2.5">
            <p className="truncate text-sm font-medium text-gray-900">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.role}</p>
          </div>
        </div>
      )}
    </aside>
  );
};
