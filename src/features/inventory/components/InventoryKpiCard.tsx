import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface InventoryKpiCardProps {
  label: string;
  value: number | string;
  hint?: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
  icon?: ReactNode;
}

const toneClass: Record<NonNullable<InventoryKpiCardProps['tone']>, string> = {
  neutral: 'text-gray-900',
  success: 'text-emerald-700',
  warning: 'text-amber-700',
  danger: 'text-red-700',
};

export function InventoryKpiCard({
  label,
  value,
  hint,
  tone = 'neutral',
  icon,
}: InventoryKpiCardProps) {
  return (
    <Card className="border-gray-200/80 shadow-none">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          {icon}
        </div>
        <p className={cn('mt-2 text-2xl font-semibold tabular-nums tracking-tight', toneClass[tone])}>
          {value}
        </p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
