import { InventoryLayout } from '@/features/inventory/components/InventoryLayout';
import { InventoryEmptyState } from '@/features/inventory/components/InventoryEmptyState';
import {
  useInventoryMode,
  useInventoryReconciliationQuery,
} from '@/features/inventory/hooks/useInventoryQueries';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw } from 'lucide-react';

export default function InventoryReconciliationPage() {
  const { data: mode } = useInventoryMode();
  const { data, isLoading, isFetching, refetch, error } = useInventoryReconciliationQuery(true);

  return (
    <InventoryLayout
      title="Reconciliation"
      description="Read-only consistency check. Does not mutate stock or repair data."
      actions={
        <Button
          variant="outline"
          size="sm"
          disabled={isFetching}
          onClick={() => void refetch()}
        >
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Re-check
        </Button>
      }
    >
      {mode?.mode === 'LEGACY' ? (
        <InventoryEmptyState
          title="Legacy mode active"
          description="Reconciliation is most meaningful after inventory cutover. You can still run a check; empty balances are expected while mode=LEGACY."
        />
      ) : null}

      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-lg" />
      ) : error ? (
        <InventoryEmptyState
          title="Reconciliation failed"
          description="Could not load the reconciliation report."
        />
      ) : data ? (
        <div className="space-y-4">
          <div
            className={`rounded-lg border px-4 py-3 ${
              data.status === 'HEALTHY'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                : 'border-amber-200 bg-amber-50 text-amber-950'
            }`}
          >
            <p className="text-lg font-semibold">
              {data.status === 'HEALTHY'
                ? 'System Healthy'
                : `${data.mismatchCount} inconsistencies detected`}
            </p>
            <p className="mt-1 text-sm opacity-80">
              Checked at {new Date(data.checkedAt).toLocaleString()} · pillows {data.pillowCount} ·
              balances {data.balanceCount} · movements {data.movementCount} · transfers{' '}
              {data.transferCount}
            </p>
          </div>

          {data.mismatches?.length > 0 ? (
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
              {data.mismatches.map((m: {
                code: string;
                severity: string;
                message: string;
                pillowId?: number;
                locationId?: number;
                transferId?: number;
                movementId?: number;
              }, idx: number) => (
                <li key={`${m.code}-${idx}`} className="px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {m.code}
                    </span>
                    <span className="text-xs text-muted-foreground">{m.severity}</span>
                  </div>
                  <p className="mt-1 text-gray-900">{m.message}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[
                      m.pillowId != null ? `pillow ${m.pillowId}` : null,
                      m.locationId != null ? `location ${m.locationId}` : null,
                      m.transferId != null ? `transfer ${m.transferId}` : null,
                      m.movementId != null ? `movement ${m.movementId}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No automatic repair is offered. Future fixes must be explicit compensating movements.
            </p>
          )}
        </div>
      ) : null}
    </InventoryLayout>
  );
}
