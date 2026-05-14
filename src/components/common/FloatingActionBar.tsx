import { ReactNode } from "react";
import { cn } from "@/lib/utils";

type FloatingActionBarProps = {
  open: boolean;
  children: ReactNode;
  className?: string;
};

export function FloatingActionBar({ open, children, className }: FloatingActionBarProps) {
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 transform-gpu transition-transform duration-200 ease-out will-change-transform motion-reduce:transition-none",
        open ? "translate-y-0" : "translate-y-full pointer-events-none",
        className
      )}
    >
      <div className="mx-auto w-full max-w-6xl px-4 pb-4">
        <div className="relative overflow-hidden rounded-xl border border-primary/15 bg-background/90 shadow-[0_-14px_44px_rgba(0,0,0,0.18)] ring-1 ring-black/5 backdrop-blur supports-[backdrop-filter]:bg-background/70 dark:ring-white/5 before:absolute before:inset-x-0 before:top-0 before:h-1 before:bg-gradient-to-r before:from-transparent before:via-primary/60 before:to-transparent">
          <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

