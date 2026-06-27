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
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          {icon}
        </div>
        <p className="mt-2 text-xl font-semibold tabular-nums text-gray-900">
          {value}
        </p>
        {subtext && (
          <p className="mt-1 text-xs text-muted-foreground">{subtext}</p>
        )}
      </CardContent>
    </Card>
  );
}
