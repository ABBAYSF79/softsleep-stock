import { AlertTriangle, Info } from 'lucide-react';
import { useInventoryMode } from '../hooks/useInventoryQueries';
import { Skeleton } from '@/components/ui/skeleton';

export function InventoryModeBanner() {
  const { data, isLoading } = useInventoryMode();

  if (isLoading) {
    return <Skeleton className="h-12 w-full rounded-lg" />;
  }

  if (!data) return null;

  if (data.mode === 'LEGACY') {
    return (
      <div
        role="status"
        className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
        <div>
          <p className="font-medium">Inventory system is not active yet</p>
          <p className="mt-0.5 text-amber-900/80">
            Current operations still use the legacy stock system. Location balances below are empty
            until opening inventory cutover.
          </p>
        </div>
      </div>
    );
  }

  if (!data.initialized) {
    return (
      <div
        role="status"
        className="flex gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950"
      >
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" aria-hidden />
        <div>
          <p className="font-medium">No opening inventory has been initialized yet</p>
          <p className="mt-0.5 text-sky-900/80">
            Inventory mode is on, but there are no location balances. Figures of 0 do not mean the
            company has no physical stock — the system is not initialized.
          </p>
        </div>
      </div>
    );
  }

  return null;
}
