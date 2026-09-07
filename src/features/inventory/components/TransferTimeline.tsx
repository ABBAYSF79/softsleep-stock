import { Check, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Transfer } from '../types';

const STEPS = [
  { key: 'created', label: 'Created' },
  { key: 'dispatched', label: 'BS Validated' },
  { key: 'partial', label: 'Partially Received' },
  { key: 'received', label: 'Received' },
] as const;

function activeIndex(status: Transfer['status']): number {
  switch (status) {
    case 'DRAFT':
      return 0;
    case 'DISPATCHED':
      return 1;
    case 'PARTIALLY_RECEIVED':
      return 2;
    case 'RECEIVED':
      return 3;
    case 'CANCELLED':
      return -1;
    default:
      return 0;
  }
}

export function TransferTimeline({ transfer }: { transfer: Transfer }) {
  if (transfer.status === 'CANCELLED') {
    return (
      <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
        Transfer cancelled — no further stock workflow.
      </p>
    );
  }

  const current = activeIndex(transfer.status);

  return (
    <ol className="flex flex-col gap-0 sm:flex-row sm:items-start sm:justify-between">
      {STEPS.map((step, index) => {
        const done = index < current || (index === current && transfer.status === 'RECEIVED');
        const active = index === current && transfer.status !== 'RECEIVED';
        // Skip "partial" visual emphasis when fully received without partial step shown as current
        const skipPartial =
          step.key === 'partial' &&
          transfer.status === 'RECEIVED' &&
          !transfer.documents?.some((d) => d.type === 'BON_ENTREE');
        if (skipPartial) {
          // still show step but as completed bridge
        }
        return (
          <li
            key={step.key}
            className={cn(
              'relative flex flex-1 items-start gap-3 pb-6 sm:flex-col sm:items-center sm:pb-0 sm:text-center',
              index < STEPS.length - 1 &&
                'sm:after:absolute sm:after:left-[calc(50%+1.25rem)] sm:after:right-[-50%] sm:after:top-3 sm:after:h-px sm:after:bg-gray-200'
            )}
          >
            <span
              className={cn(
                'relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs',
                done && 'border-emerald-600 bg-emerald-600 text-white',
                active && 'border-matles-700 bg-matles-700 text-white',
                !done && !active && 'border-gray-300 bg-white text-gray-400'
              )}
              aria-hidden
            >
              {done ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-2.5 w-2.5 fill-current" />}
            </span>
            <div>
              <p
                className={cn(
                  'text-sm font-medium',
                  done || active ? 'text-gray-900' : 'text-muted-foreground'
                )}
              >
                {step.label}
              </p>
              {step.key === 'created' && (
                <p className="text-xs text-muted-foreground">
                  {new Date(transfer.createdAt).toLocaleString()}
                </p>
              )}
              {step.key === 'dispatched' && transfer.dispatchedAt && (
                <p className="text-xs text-muted-foreground">
                  {new Date(transfer.dispatchedAt).toLocaleString()}
                </p>
              )}
              {step.key === 'received' && transfer.completedAt && (
                <p className="text-xs text-muted-foreground">
                  {new Date(transfer.completedAt).toLocaleString()}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
