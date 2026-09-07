import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import {
  useInventoryBalancesQuery,
  useInventoryMode,
  useInventoryTransfersQuery,
  useStockMovementsQuery,
} from '../hooks/useInventoryQueries';
import { locationDisplayName, movementTypeLabel } from '../utils/labels';
import type { InventoryStockRow } from '../types';
import { SupplyStockDialog } from './SupplyStockDialog';
import { AdjustStockDialog } from './AdjustStockDialog';
import { PresentationDialog } from './PresentationDialog';

interface StockDetailDrawerProps {
  row: InventoryStockRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StockDetailDrawer({ row, open, onOpenChange }: StockDetailDrawerProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const { data: mode } = useInventoryMode();
  const inventoryReady = mode?.mode === 'INVENTORY' && mode?.initialized;
  const pillowId = row?.pillowId;
  const { data: balances = [], isLoading: balLoading } = useInventoryBalancesQuery(
    pillowId ? { pillowId } : undefined
  );
  const { data: movements = [], isLoading: movLoading } = useStockMovementsQuery(
    pillowId ? { pillowId, limit: 20 } : undefined
  );
  const { data: transfers = [] } = useInventoryTransfersQuery();

  const [supplyOpen, setSupplyOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [presentationOpen, setPresentationOpen] = useState(false);
  const [actionLocationId, setActionLocationId] = useState<number | undefined>();

  const relatedTransfers = transfers
    .filter((t) => t.lines.some((l) => l.pillowId === pillowId))
    .slice(0, 8);

  const wh = balances.find((b) => b.location.code === 'WH-MAIN');
  const sr = balances.find((b) => b.location.code === 'SR-MAIN');

  const openSupply = (locationId?: number) => {
    setActionLocationId(locationId);
    setSupplyOpen(true);
  };
  const openAdjust = (locationId?: number) => {
    setActionLocationId(locationId);
    setAdjustOpen(true);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{row?.name ?? 'Accessoire'}</SheetTitle>
            <SheetDescription>
              Location stock with physical, presentation, reserved, available, and in-transit.
            </SheetDescription>
          </SheetHeader>

          {!row ? null : balLoading ? (
            <div className="mt-6 space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <div className="mt-6 space-y-6">
              {isAdmin && inventoryReady ? (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => openSupply(wh?.location.id)}>
                    Add Stock
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openAdjust(wh?.location.id)}>
                    Adjustment
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/inventory/transfers">Transfer</Link>
                  </Button>
                </div>
              ) : null}

              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-900">Stock summary</h3>
                <div className="rounded-md border border-gray-200 p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">
                      {locationDisplayName('WH-MAIN', wh?.location.name ?? 'Warehouse')}
                    </p>
                    {isAdmin && inventoryReady && wh ? (
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openSupply(wh.location.id)}>
                          Add
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openAdjust(wh.location.id)}>
                          Adjust
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-muted-foreground">
                    <dt>Physical</dt>
                    <dd className="text-right tabular-nums text-foreground">{wh?.physical ?? 0}</dd>
                    <dt>Reserved</dt>
                    <dd className="text-right tabular-nums text-foreground">{wh?.reserved ?? 0}</dd>
                    <dt>Available</dt>
                    <dd className="text-right tabular-nums text-foreground">{wh?.available ?? 0}</dd>
                  </dl>
                </div>
                <div className="rounded-md border border-gray-200 p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">
                      {locationDisplayName('SR-MAIN', sr?.location.name ?? 'Showroom')}
                    </p>
                    {isAdmin && inventoryReady && sr ? (
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openSupply(sr.location.id)}>
                          Add
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openAdjust(sr.location.id)}>
                          Adjust
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => setPresentationOpen(true)}
                        >
                          Presentation
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-muted-foreground">
                    <dt>Physical</dt>
                    <dd className="text-right tabular-nums text-foreground">{sr?.physical ?? 0}</dd>
                    <dt>Presentation</dt>
                    <dd className="text-right tabular-nums text-foreground">{sr?.presentation ?? 0}</dd>
                    <dt>Reserved</dt>
                    <dd className="text-right tabular-nums text-foreground">{sr?.reserved ?? 0}</dd>
                    <dt>Available</dt>
                    <dd className="text-right tabular-nums text-foreground">{sr?.available ?? 0}</dd>
                  </dl>
                </div>
                <p className="text-sm text-muted-foreground">
                  In transit:{' '}
                  <strong className="text-foreground tabular-nums">{row.inTransit}</strong>
                </p>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-gray-900">Recent movements</h3>
                {movLoading ? (
                  <Skeleton className="h-20 w-full" />
                ) : movements.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No movements yet for this accessoire.</p>
                ) : (
                  <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
                    {movements.map((m) => (
                      <li key={m.id} className="px-3 py-2 text-sm">
                        <div className="flex justify-between gap-2">
                          <span className="font-medium">{movementTypeLabel(m.type)}</span>
                          <span className="tabular-nums">
                            {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {m.location ? locationDisplayName(m.location.code, m.location.name) : '—'} ·{' '}
                          {new Date(m.createdAt).toLocaleString()}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-gray-900">Related transfers</h3>
                {relatedTransfers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No related transfers.</p>
                ) : (
                  <ul className="space-y-1">
                    {relatedTransfers.map((t) => (
                      <li key={t.id}>
                        <Link
                          to={`/inventory/transfers/${t.id}`}
                          className="text-sm font-medium text-matles-800 hover:underline"
                          onClick={() => onOpenChange(false)}
                        >
                          {t.reference || t.referenceNumber}
                        </Link>
                        <span className="ml-2 text-xs text-muted-foreground">{t.status}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {row ? (
        <>
          <SupplyStockDialog
            open={supplyOpen}
            onOpenChange={setSupplyOpen}
            pillowId={row.pillowId}
            pillowName={row.name}
            defaultLocationId={actionLocationId}
          />
          <AdjustStockDialog
            open={adjustOpen}
            onOpenChange={setAdjustOpen}
            pillowId={row.pillowId}
            pillowName={row.name}
            defaultLocationId={actionLocationId}
          />
          {sr ? (
            <PresentationDialog
              open={presentationOpen}
              onOpenChange={setPresentationOpen}
              pillowId={row.pillowId}
              pillowName={row.name}
              locationId={sr.location.id}
              locationCode={sr.location.code}
              locationName={sr.location.name}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}
