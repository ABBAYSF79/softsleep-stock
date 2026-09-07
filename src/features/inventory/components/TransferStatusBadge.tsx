import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { transferStatusLabel } from '../utils/labels';
import type { TransferStatus } from '../types';

const styles: Record<TransferStatus, string> = {
  DRAFT: 'border-transparent bg-slate-100 text-slate-800',
  DISPATCHED: 'border-transparent bg-sky-100 text-sky-900',
  PARTIALLY_RECEIVED: 'border-transparent bg-amber-100 text-amber-900',
  RECEIVED: 'border-transparent bg-emerald-100 text-emerald-900',
  CANCELLED: 'border-transparent bg-red-100 text-red-800',
};

export function TransferStatusBadge({ status }: { status: TransferStatus | string }) {
  const key = status as TransferStatus;
  return (
    <Badge className={cn('font-medium hover:bg-inherit', styles[key] ?? 'bg-slate-100 text-slate-800')}>
      {transferStatusLabel(status)}
    </Badge>
  );
}
