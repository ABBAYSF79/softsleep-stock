
import { ReactNode, useState } from "react";
import { Sidebar } from "./Sidebar";
import { Navbar } from "./Navbar";
import { cn } from "@/lib/utils";

interface MainLayoutProps {
  children: ReactNode;
  className?: string;
}

export const MainLayout = ({ children, className }: MainLayoutProps) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <div className="flex flex-col flex-1">
        <div 
          className={cn(
            "fixed top-0 right-0 z-40 bg-gray-50 transition-all duration-300",
            collapsed ? "left-20" : "left-64"
          )}
        >
          <Navbar />
        </div>
        <main 
          className={cn(
            "flex-1 p-6 pt-24 transition-all duration-300", 
            collapsed ? "ml-20" : "ml-64",
            className
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
};
