import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { InventoryLayout } from '@/features/inventory/components/InventoryLayout';
import { InventoryKpiCard } from '@/features/inventory/components/InventoryKpiCard';
import { InventoryEmptyState } from '@/features/inventory/components/InventoryEmptyState';
import { TransferStatusBadge } from '@/features/inventory/components/TransferStatusBadge';
import {
  useAccessoriesCatalog,
  useInventoryBalancesQuery,
  useInventoryLocationsQuery,
  useInventoryMode,
  useInventoryTransfersQuery,
  useStockMovementsQuery,
} from '@/features/inventory/hooks/useInventoryQueries';
import { buildLocationSummaries } from '@/features/inventory/utils/stockRows';
import { locationDisplayName, movementTypeLabel } from '@/features/inventory/utils/labels';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function startOfDay(isoDate: string): Date | null {
  if (!isoDate) return null;
  const d = new Date(`${isoDate}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function endOfDay(isoDate: string): Date | null {
  if (!isoDate) return null;
  const d = new Date(`${isoDate}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function inDateRange(iso: string | undefined, from: Date | null, to: Date | null): boolean {
  if (!from && !to) return true;
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  if (from && t < from.getTime()) return false;
  if (to && t > to.getTime()) return false;
  return true;
}

export default function InventoryOverviewPage() {
  const [params, setParams] = useSearchParams();
  const pillowId = params.get('pillowId') ?? 'all';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';

  const pillowNum = pillowId !== 'all' ? Number(pillowId) : undefined;
  const fromDate = startOfDay(from);
  const toDate = endOfDay(to);

  const { data: mode } = useInventoryMode();
  const { data: accessories = [] } = useAccessoriesCatalog();
  const { data: balances = [], isLoading: balLoading } = useInventoryBalancesQuery(
    pillowNum ? { pillowId: pillowNum } : undefined
  );
  const { data: locations = [] } = useInventoryLocationsQuery();
  const { data: transfers = [], isLoading: trLoading } = useInventoryTransfersQuery();
  const { data: movements = [], isLoading: movLoading } = useStockMovementsQuery({
    ...(pillowNum ? { pillowId: pillowNum } : {}),
    limit: 50,
  });

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (!value || value === 'all') next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const filteredTransfers = useMemo(() => {
    return transfers.filter((t) => {
      if (pillowNum) {
        const hasLine = t.lines.some((l) => l.pillowId === pillowNum);
        if (!hasLine) return false;
      }
      return inDateRange(t.createdAt, fromDate, toDate);
    });
  }, [transfers, pillowNum, fromDate, toDate]);

  const filteredMovements = useMemo(() => {
    return movements.filter((m) => inDateRange(m.createdAt, fromDate, toDate));
  }, [movements, fromDate, toDate]);

  const locationSummaries = buildLocationSummaries(balances, filteredTransfers, locations);
  const totals = locationSummaries.reduce(
    (acc, loc) => ({
      physical: acc.physical + loc.physical,
      available: acc.available + loc.available,
      reserved: acc.reserved + loc.reserved,
      presentation: acc.presentation + loc.presentation,
      inTransit: acc.inTransit + loc.inTransit,
    }),
    { physical: 0, available: 0, reserved: 0, presentation: 0, inTransit: 0 }
  );

  const openInTransit = filteredTransfers
    .filter((t) => t.status === 'DISPATCHED' || t.status === 'PARTIALLY_RECEIVED')
    .reduce((s, t) => {
      if (!pillowNum) return s + (t.totals?.inTransit ?? 0);
      return (
        s +
        t.lines
          .filter((l) => l.pillowId === pillowNum)
          .reduce(
            (ls, l) =>
              ls + (l.inTransitQuantity ?? Math.max(0, l.sentQuantity - l.receivedQuantity)),
            0
          )
      );
    }, 0);

  const pending = {
    drafts: filteredTransfers.filter((t) => t.status === 'DRAFT'),
    waitingReceipt: filteredTransfers.filter(
      (t) => t.status === 'DISPATCHED' || t.status === 'PARTIALLY_RECEIVED'
    ),
  };

  const recentTransfers = filteredTransfers.slice(0, 8);
  const recentMovements = filteredMovements.slice(0, 8);
  const selectedAccessory = accessories.find((a) => String(a.id) === pillowId);
  const initialized = Boolean(mode?.initialized);
  const loading = balLoading || trLoading;

  return (
    <InventoryLayout
      title="Overview"
      description="Immediate view of accessoire stock across Warehouse and Showroom."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-2">
          <Label>Accessoire</Label>
          <Select value={pillowId} onValueChange={(v) => setFilter('pillowId', v)}>
            <SelectTrigger>
              <SelectValue placeholder="All accessoires" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accessoires</SelectItem>
              {accessories.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ov-from">From date</Label>
          <Input
            id="ov-from"
            type="date"
            value={from}
            onChange={(e) => setFilter('from', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ov-to">To date</Label>
          <Input
            id="ov-to"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setFilter('to', e.target.value)}
          />
        </div>
      </div>

      {(pillowId !== 'all' || from || to) && (
        <p className="text-xs text-muted-foreground">
          Filters:{' '}
          {selectedAccessory ? selectedAccessory.name : 'all accessoires'}
          {from || to
            ? ` · activity ${from || '…'} → ${to || '…'}`
            : ' · stock KPIs (current)'}
          {from || to ? ' (transfers & movements)' : null}
        </p>
      )}

      {!initialized && !loading ? (
        <InventoryEmptyState
          title="No opening inventory has been initialized yet"
          description="Location balances are empty until cutover. Legacy Pillow.stock still drives day-to-day operations."
        />
      ) : null}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <InventoryKpiCard label="Total Physical" value={totals.physical} hint="Physique" />
          <InventoryKpiCard
            label="Available"
            value={totals.available}
            hint="Disponible"
            tone="success"
          />
          <InventoryKpiCard label="Reserved" value={totals.reserved} hint="Réservé" tone="warning" />
          <InventoryKpiCard
            label="Presentation"
            value={totals.presentation}
            hint="Présentation"
          />
          <InventoryKpiCard
            label="In Transit"
            value={openInTransit}
            hint="En transit"
            tone={openInTransit > 0 ? 'warning' : 'neutral'}
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-gray-200/80 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Stock by location</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-32 w-full" />
            ) : locationSummaries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No locations configured.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead />
                      {locationSummaries.map((l) => (
                        <TableHead key={l.locationId} className="text-right">
                          {locationDisplayName(l.code, l.name)}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(
                      [
                        ['Physical', 'physical'],
                        ['Presentation', 'presentation'],
                        ['Reserved', 'reserved'],
                        ['Available', 'available'],
                      ] as const
                    ).map(([label, key]) => (
                      <TableRow key={key}>
                        <TableCell className="font-medium">{label}</TableCell>
                        {locationSummaries.map((l) => (
                          <TableCell key={l.locationId} className="text-right tabular-nums">
                            {l[key]}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-gray-200/80 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pending actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Draft transfers</span>
              <Link
                to="/inventory/transfers?status=DRAFT"
                className="font-semibold tabular-nums text-matles-800 hover:underline"
              >
                {pending.drafts.length}
              </Link>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Waiting for receipt</span>
              <Link
                to="/inventory/transfers?status=DISPATCHED"
                className="font-semibold tabular-nums text-matles-800 hover:underline"
              >
                {pending.waitingReceipt.length}
              </Link>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Partial receipts</span>
              <span className="font-semibold tabular-nums">
                {filteredTransfers.filter((t) => t.status === 'PARTIALLY_RECEIVED').length}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-gray-200/80 shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Recent transfers</CardTitle>
            <Link
              to="/inventory/transfers"
              className="text-xs font-medium text-matles-800 hover:underline"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {trLoading ? (
              <Skeleton className="h-28 w-full" />
            ) : recentTransfers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No transfers match these filters.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {recentTransfers.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <div className="min-w-0">
                      <Link
                        to={`/inventory/transfers/${t.id}`}
                        className="font-medium text-matles-800 hover:underline"
                      >
                        {t.reference || t.referenceNumber}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {t.createdAt ? new Date(t.createdAt).toLocaleDateString() : '—'}
                      </p>
                    </div>
                    <TransferStatusBadge status={t.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="border-gray-200/80 shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Recent movements</CardTitle>
            <Link
              to="/inventory/history"
              className="text-xs font-medium text-matles-800 hover:underline"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {movLoading ? (
              <Skeleton className="h-28 w-full" />
            ) : recentMovements.length === 0 ? (
              <p className="text-sm text-muted-foreground">No movements match these filters.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {recentMovements.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{movementTypeLabel(m.type)}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {m.pillow?.name ?? `#${m.pillowId}`}
                        {m.createdAt ? ` · ${new Date(m.createdAt).toLocaleDateString()}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 tabular-nums">
                      {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </InventoryLayout>
  );
}
