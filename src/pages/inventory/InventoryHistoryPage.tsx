import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { InventoryLayout } from '@/features/inventory/components/InventoryLayout';
import { InventoryEmptyState } from '@/features/inventory/components/InventoryEmptyState';
import {
  useAccessoriesCatalog,
  useInventoryLocationsQuery,
  useStockMovementsQuery,
} from '@/features/inventory/hooks/useInventoryQueries';
import {
  locationDisplayName,
  movementTypeLabel,
} from '@/features/inventory/utils/labels';
import { computeAvailable } from '@/features/inventory/utils/stockRows';
import type { StockMovement, StockMovementType } from '@/features/inventory/types';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

const MOVEMENT_TYPES: StockMovementType[] = [
  'INITIAL',
  'SUPPLY',
  'SALE',
  'RESERVATION',
  'RELEASE',
  'RETURN',
  'ADJUSTMENT',
  'TRANSFER_OUT',
  'TRANSFER_IN',
];

export default function InventoryHistoryPage() {
  const [params, setParams] = useSearchParams();
  const pillowId = params.get('pillowId') ?? 'all';
  const locationId = params.get('locationId') ?? 'all';
  const type = params.get('type') ?? 'all';

  const { data: accessories = [] } = useAccessoriesCatalog();
  const { data: locations = [] } = useInventoryLocationsQuery();
  const { data: movements = [], isLoading } = useStockMovementsQuery({
    ...(pillowId !== 'all' ? { pillowId: Number(pillowId) } : {}),
    ...(locationId !== 'all' ? { locationId: Number(locationId) } : {}),
    ...(type !== 'all' ? { type } : {}),
    limit: 100,
  });

  const [selected, setSelected] = useState<StockMovement | null>(null);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (!value || value === 'all') next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const detail = useMemo(() => {
    if (!selected) return null;
    const prevAvail = computeAvailable(
      selected.previousPhysical,
      selected.previousPresentation,
      selected.previousReserved
    );
    const newAvail = computeAvailable(
      selected.newPhysical,
      selected.newPresentation,
      selected.newReserved
    );
    return { prevAvail, newAvail };
  }, [selected]);

  return (
    <InventoryLayout
      title="History"
      description="Immutable stock movement ledger. Movements cannot be edited."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Accessoire</Label>
          <Select value={pillowId} onValueChange={(v) => setFilter('pillowId', v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {accessories.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Location</Label>
          <Select value={locationId} onValueChange={(v) => setFilter('locationId', v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {locations.map((l) => (
                <SelectItem key={l.id} value={String(l.id)}>
                  {locationDisplayName(l.code, l.name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Movement type</Label>
          <Select value={type} onValueChange={(v) => setFilter('type', v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {MOVEMENT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {movementTypeLabel(t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : movements.length === 0 ? (
        <InventoryEmptyState
          title="No movements yet"
          description="Stock movements appear after opening inventory, supplies, sales, or transfers in Inventory mode."
        />
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border border-gray-200 bg-white md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Accessoire</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Movement</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>User</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((m) => (
                  <TableRow
                    key={m.id}
                    className="cursor-pointer"
                    onClick={() => setSelected(m)}
                  >
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {new Date(m.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-medium">
                      {m.pillow?.name ?? `#${m.pillowId}`}
                    </TableCell>
                    <TableCell>
                      {m.location
                        ? locationDisplayName(m.location.code, m.location.name)
                        : '—'}
                    </TableCell>
                    <TableCell>{movementTypeLabel(m.type)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {m.referenceNumber ?? m.referenceType ?? '—'}
                    </TableCell>
                    <TableCell>{m.user?.name ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-3 md:hidden">
            {movements.map((m) => (
              <Card
                key={m.id}
                className="cursor-pointer border-gray-200 shadow-none"
                onClick={() => setSelected(m)}
              >
                <CardContent className="space-y-1 p-4">
                  <div className="flex justify-between gap-2">
                    <p className="font-medium">{movementTypeLabel(m.type)}</p>
                    <span className="tabular-nums">
                      {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {m.pillow?.name ?? `#${m.pillowId}`}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <Sheet open={Boolean(selected)} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Movement detail</SheetTitle>
            <SheetDescription>Audit information — read only.</SheetDescription>
          </SheetHeader>
          {selected && detail ? (
            <dl className="mt-6 space-y-3 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Accessoire</dt>
                <dd className="font-medium text-right">
                  {selected.pillow?.name ?? `#${selected.pillowId}`}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Location</dt>
                <dd className="text-right">
                  {selected.location
                    ? locationDisplayName(selected.location.code, selected.location.name)
                    : '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Movement</dt>
                <dd className="font-medium">{movementTypeLabel(selected.type)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Quantity</dt>
                <dd className="tabular-nums">{selected.quantity}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Previous physical</dt>
                <dd className="tabular-nums">{selected.previousPhysical}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">New physical</dt>
                <dd className="tabular-nums">{selected.newPhysical}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Previous available</dt>
                <dd className="tabular-nums">{detail.prevAvail}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">New available</dt>
                <dd className="tabular-nums">{detail.newAvail}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Reason</dt>
                <dd className="max-w-[60%] text-right">{selected.reason ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Reference</dt>
                <dd className="text-right">
                  {selected.referenceNumber ??
                    (selected.referenceType
                      ? `${selected.referenceType} #${selected.referenceId}`
                      : '—')}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">User</dt>
                <dd>{selected.user?.name ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Date</dt>
                <dd>{new Date(selected.createdAt).toLocaleString()}</dd>
              </div>
            </dl>
          ) : null}
        </SheetContent>
      </Sheet>
    </InventoryLayout>
  );
}
