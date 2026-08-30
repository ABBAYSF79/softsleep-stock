import { CSSProperties, ReactNode, useState } from "react";
import { Sidebar } from "./Sidebar";
import { Navbar } from "./Navbar";
import { cn } from "@/lib/utils";

interface MainLayoutProps {
  children: ReactNode;
  className?: string;
}

const SIDEBAR_WIDTH = "16rem";
const SIDEBAR_COLLAPSED_WIDTH = "4.5rem";
const NAVBAR_HEIGHT = "3.5rem";

export const MainLayout = ({ children, className }: MainLayoutProps) => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const sidebarWidth = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;

  return (
    <div className="min-h-screen bg-slate-50/80">
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onToggle={() => setCollapsed(!collapsed)}
        onMobileClose={() => setMobileOpen(false)}
      />
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/30 md:hidden"
        />
      )}

      <div
        className="ml-0 flex min-h-screen flex-col transition-[margin] duration-300 md:ml-[var(--sidebar-width)]"
        style={{ "--sidebar-width": sidebarWidth } as CSSProperties}
      >
        <div
          className="fixed top-0 right-0 left-0 z-40 transition-[left] duration-300 md:left-[var(--sidebar-width)]"
        >
          <Navbar onMobileMenu={() => setMobileOpen(true)} />
        </div>

        <main
          className={cn("flex-1 p-4 sm:p-6", className)}
          style={{ paddingTop: `calc(${NAVBAR_HEIGHT} + 1.25rem)` }}
        >
          {children}
        </main>
      </div>
    </div>
  );
};
