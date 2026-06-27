import { ReactNode, useState } from "react";
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

  return (
    <div className="min-h-screen bg-slate-50/80">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />

      <div
        className="flex min-h-screen flex-col transition-[margin] duration-300"
        style={{
          marginLeft: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH,
        }}
      >
        <div
          className="fixed top-0 right-0 z-40 transition-[left] duration-300"
          style={{
            left: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH,
          }}
        >
          <Navbar />
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
