import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import { InventoryLayout } from '@/features/inventory/components/InventoryLayout';
import { InventoryEmptyState } from '@/features/inventory/components/InventoryEmptyState';
import { StockDetailDrawer } from '@/features/inventory/components/StockDetailDrawer';
import { SupplyStockDialog } from '@/features/inventory/components/SupplyStockDialog';
import { AdjustStockDialog } from '@/features/inventory/components/AdjustStockDialog';
import {
  useInventoryBalancesQuery,
  useInventoryMode,
  useInventoryTransfersQuery,
} from '@/features/inventory/hooks/useInventoryQueries';
import { buildStockRows } from '@/features/inventory/utils/stockRows';
import type { InventoryStockRow } from '@/features/inventory/types';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
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

type StockStatus = 'all' | 'available' | 'low' | 'out' | 'reserved' | 'in_transit';

export default function InventoryStockPage() {
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const status = (params.get('status') as StockStatus) || 'all';
  const debouncedSearch = useDebounce(search, 300);
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const { data: mode } = useInventoryMode();
  const { data: balances = [], isLoading } = useInventoryBalancesQuery();
  const { data: transfers = [] } = useInventoryTransfersQuery();
  const [selected, setSelected] = useState<InventoryStockRow | null>(null);
  const [supplyOpen, setSupplyOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const inventoryReady = mode?.mode === 'INVENTORY' && mode?.initialized;

  const rows = useMemo(() => buildStockRows(balances, transfers), [balances, transfers]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q) && !String(r.pillowId).includes(q)) {
        return false;
      }
      switch (status) {
        case 'available':
          return r.available > 0;
        case 'low':
          return r.available > 0 && r.available <= 5;
        case 'out':
          return r.totalPhysical === 0 && r.inTransit === 0;
        case 'reserved':
          return r.reserved > 0;
        case 'in_transit':
          return r.inTransit > 0;
        default:
          return true;
      }
    });
  }, [rows, debouncedSearch, status]);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (!value || value === 'all') next.delete(key);
    else next.set(key, value);
    if (key === 'q' && !value) next.delete('q');
    setParams(next, { replace: true });
  };

  const requireSelection = (action: () => void) => {
    if (!selected) {
      toast.message('Select an accessoire row first');
      return;
    }
    action();
  };

  return (
    <InventoryLayout
      title="Stock"
      description="Physical, available, reserved, presentation, and in-transit by accessoire."
      actions={
        isAdmin && inventoryReady ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => requireSelection(() => setSupplyOpen(true))}>
              Add Stock
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => requireSelection(() => setAdjustOpen(true))}
            >
              Adjustment
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="relative flex-1 space-y-1.5">
          <Label htmlFor="stock-search">Search accessoire</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="stock-search"
              className="pl-8"
              value={search}
              onChange={(e) => setFilter('q', e.target.value)}
              placeholder="Name or ID"
            />
          </div>
        </div>
        <div className="w-full space-y-1.5 sm:w-48">
          <Label>Stock status</Label>
          <Select value={status} onValueChange={(v) => setFilter('status', v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="available">Available</SelectItem>
              <SelectItem value="low">Low stock</SelectItem>
              <SelectItem value="out">Out of stock</SelectItem>
              <SelectItem value="reserved">Reserved</SelectItem>
              <SelectItem value="in_transit">In transit</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {!mode?.initialized && !isLoading ? (
        <InventoryEmptyState
          title="No opening inventory has been initialized yet"
          description="Balance rows will appear after clean cutover. Do not treat empty tables as zero company stock."
        />
      ) : isLoading ? (
        <Skeleton className="h-64 w-full rounded-lg" />
      ) : filtered.length === 0 ? (
        <InventoryEmptyState
          title="No accessoires match your filters"
          description="Try clearing search or changing the stock status filter."
        />
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border border-gray-200 bg-white md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Accessoire</TableHead>
                  <TableHead className="text-right">ID</TableHead>
                  <TableHead className="text-right">Warehouse</TableHead>
                  <TableHead className="text-right">Showroom</TableHead>
                  <TableHead className="text-right">Presentation</TableHead>
                  <TableHead className="text-right">Reserved</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead className="text-right">In Transit</TableHead>
                  <TableHead className="text-right">Total Physical</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow
                    key={r.pillowId}
                    className="cursor-pointer"
                    onClick={() => setSelected(r)}
                  >
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {r.pillowId}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.warehousePhysical}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.showroomPhysical}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.presentation}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.reserved}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{r.available}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.inTransit}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.totalPhysical}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-3 md:hidden">
            {filtered.map((r) => (
              <Card
                key={r.pillowId}
                className="cursor-pointer border-gray-200 shadow-none"
                onClick={() => setSelected(r)}
              >
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-gray-900">{r.name}</p>
                    <span className="text-xs text-muted-foreground">#{r.pillowId}</span>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    <dt>Warehouse</dt>
                    <dd className="text-right tabular-nums text-foreground">{r.warehousePhysical}</dd>
                    <dt>Showroom</dt>
                    <dd className="text-right tabular-nums text-foreground">{r.showroomPhysical}</dd>
                    <dt>Available</dt>
                    <dd className="text-right tabular-nums font-medium text-foreground">
                      {r.available}
                    </dd>
                    <dt>In transit</dt>
                    <dd className="text-right tabular-nums text-foreground">{r.inTransit}</dd>
                  </dl>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <StockDetailDrawer
        row={selected}
        open={Boolean(selected)}
        onOpenChange={(o) => !o && setSelected(null)}
      />

      {selected ? (
        <>
          <SupplyStockDialog
            open={supplyOpen}
            onOpenChange={setSupplyOpen}
            pillowId={selected.pillowId}
            pillowName={selected.name}
          />
          <AdjustStockDialog
            open={adjustOpen}
            onOpenChange={setAdjustOpen}
            pillowId={selected.pillowId}
            pillowName={selected.name}
          />
        </>
      ) : null}
    </InventoryLayout>
  );
}
