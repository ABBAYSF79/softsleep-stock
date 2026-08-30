import { type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface DashboardStatCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  highlight?: boolean;
  subtext?: string;
}

export function DashboardStatCard({
  label,
  value,
  icon,
  highlight = false,
  subtext,
}: DashboardStatCardProps) {
  return (
    <Card
      className={`border-gray-200 shadow-sm ${
        highlight ? "border-matles-200 bg-matles-50/40" : ""
      }`}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 text-[10px] font-medium uppercase leading-tight tracking-wide text-muted-foreground sm:text-xs">
            {label}
          </p>
          {icon}
        </div>
        <p className="mt-2 break-words text-lg font-semibold tabular-nums text-gray-900 sm:text-xl">
          {value}
        </p>
        {subtext && (
          <p className="mt-1 text-xs text-muted-foreground">{subtext}</p>
        )}
      </CardContent>
    </Card>
  );
}
