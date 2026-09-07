import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { InventoryLayout } from '@/features/inventory/components/InventoryLayout';
import { InventoryEmptyState } from '@/features/inventory/components/InventoryEmptyState';
import { TransferStatusBadge } from '@/features/inventory/components/TransferStatusBadge';
import { TransferFormDialog } from '@/features/inventory/components/TransferFormDialog';
import {
  useInventoryLocationsQuery,
  useInventoryTransfersQuery,
} from '@/features/inventory/hooks/useInventoryQueries';
import { locationDisplayName } from '@/features/inventory/utils/labels';
import type { TransferStatus } from '@/features/inventory/types';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

export default function InventoryTransfersPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'all';
  const q = params.get('q') ?? '';
  const source = params.get('source') ?? 'all';
  const dest = params.get('dest') ?? 'all';
  const debouncedQ = useDebounce(q, 300);

  const { data: transfers = [], isLoading } = useInventoryTransfersQuery(
    status !== 'all' ? { status } : undefined
  );
  const { data: locations = [] } = useInventoryLocationsQuery();
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    const query = debouncedQ.trim().toLowerCase();
    return transfers.filter((t) => {
      if (query) {
        const ref = (t.reference || t.referenceNumber || '').toLowerCase();
        if (!ref.includes(query)) return false;
      }
      if (source !== 'all' && String(t.sourceLocation.id) !== source) return false;
      if (dest !== 'all' && String(t.destinationLocation.id) !== dest) return false;
      return true;
    });
  }, [transfers, debouncedQ, source, dest]);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (!value || value === 'all') next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  return (
    <InventoryLayout
      title="Transfers"
      description="Move accessoires between Warehouse and Showroom with BS → transit → BE."
      actions={
        isAdmin ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            New Transfer
          </Button>
        ) : null
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
          <Label htmlFor="tr-search">Search reference</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="tr-search"
              className="pl-8"
              value={q}
              onChange={(e) => setFilter('q', e.target.value)}
              placeholder="TR-2026-…"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => setFilter('status', v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {(
                [
                  'DRAFT',
                  'DISPATCHED',
                  'PARTIALLY_RECEIVED',
                  'RECEIVED',
                  'CANCELLED',
                ] as TransferStatus[]
              ).map((s) => (
                <SelectItem key={s} value={s}>
                  {s.replace(/_/g, ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Source</Label>
          <Select value={source} onValueChange={(v) => setFilter('source', v)}>
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
          <Label>Destination</Label>
          <Select value={dest} onValueChange={(v) => setFilter('dest', v)}>
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
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : filtered.length === 0 ? (
        <InventoryEmptyState
          title="No transfers yet"
          description="Create your first transfer to move stock between locations."
          actionLabel={isAdmin ? 'New Transfer' : undefined}
          onAction={isAdmin ? () => setCreateOpen(true) : undefined}
        />
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border border-gray-200 bg-white lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">In Transit</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created By</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <Link
                        to={`/inventory/transfers/${t.id}`}
                        className="font-medium text-matles-800 hover:underline"
                      >
                        {t.reference || t.referenceNumber}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {locationDisplayName(t.sourceLocation.code, t.sourceLocation.name)}
                    </TableCell>
                    <TableCell>
                      {locationDisplayName(
                        t.destinationLocation.code,
                        t.destinationLocation.name
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{t.lines.length}</TableCell>
                    <TableCell className="text-right tabular-nums">{t.totals.sent}</TableCell>
                    <TableCell className="text-right tabular-nums">{t.totals.received}</TableCell>
                    <TableCell className="text-right tabular-nums">{t.totals.inTransit}</TableCell>
                    <TableCell>
                      <TransferStatusBadge status={t.status} />
                    </TableCell>
                    <TableCell>{t.createdBy?.name ?? '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {new Date(t.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-3 lg:hidden">
            {filtered.map((t) => (
              <Card key={t.id} className="border-gray-200 shadow-none">
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      to={`/inventory/transfers/${t.id}`}
                      className="font-semibold text-matles-800 hover:underline"
                    >
                      {t.reference || t.referenceNumber}
                    </Link>
                    <TransferStatusBadge status={t.status} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {locationDisplayName(t.sourceLocation.code, t.sourceLocation.name)} →{' '}
                    {locationDisplayName(
                      t.destinationLocation.code,
                      t.destinationLocation.name
                    )}
                  </p>
                  <p className="text-sm tabular-nums">
                    Sent {t.totals.sent} · Received {t.totals.received} · Transit{' '}
                    {t.totals.inTransit}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <TransferFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </InventoryLayout>
  );
}
