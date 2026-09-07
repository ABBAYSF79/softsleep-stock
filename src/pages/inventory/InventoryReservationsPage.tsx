import { Link } from 'react-router-dom';
import { InventoryLayout } from '@/features/inventory/components/InventoryLayout';
import { InventoryEmptyState } from '@/features/inventory/components/InventoryEmptyState';
import { useInventoryReservationsQuery } from '@/features/inventory/hooks/useInventoryQueries';
import { locationDisplayName } from '@/features/inventory/utils/labels';
import { Badge } from '@/components/ui/badge';
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

function statusLabel(status: string) {
  const map: Record<string, string> = {
    ACTIVE: 'Active',
    PARTIALLY_FULFILLED: 'Partially Fulfilled',
    FULFILLED: 'Fulfilled',
    RELEASED: 'Released',
    CANCELLED: 'Cancelled',
  };
  return map[status] ?? status;
}

export default function InventoryReservationsPage() {
  const { data: reservations = [], isLoading } = useInventoryReservationsQuery();

  return (
    <InventoryLayout
      title="Reservations"
      description="Accessory stock held for orders. Reservation is not a physical deduction."
    >
      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : reservations.length === 0 ? (
        <InventoryEmptyState
          title="No reservations yet"
          description="Reservations appear when inventory-mode orders reserve accessories at a location."
        />
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border border-gray-200 bg-white md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Reserved</TableHead>
                  <TableHead className="text-right">Fulfilled</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reservations.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.reference || r.referenceNumber}</TableCell>
                    <TableCell>
                      {r.source === 'ORDER' && r.orderId ? (
                        <span>Order #{r.orderId}</span>
                      ) : r.pillowOrderId ? (
                        <span>PillowOrder #{r.pillowOrderId}</span>
                      ) : (
                        r.source
                      )}
                    </TableCell>
                    <TableCell>
                      {r.location
                        ? locationDisplayName(r.location.code, r.location.name)
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{statusLabel(r.status)}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.totals?.reserved ?? 0}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.totals?.fulfilled ?? 0}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {r.totals?.remaining ?? 0}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-3 md:hidden">
            {reservations.map((r: any) => (
              <Card key={r.id} className="border-gray-200 shadow-none">
                <CardContent className="space-y-1 p-4">
                  <div className="flex justify-between gap-2">
                    <p className="font-semibold">{r.reference || r.referenceNumber}</p>
                    <Badge variant="secondary">{statusLabel(r.status)}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Reserved {r.totals?.reserved} · Fulfilled {r.totals?.fulfilled} · Remaining{' '}
                    {r.totals?.remaining}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <p className="text-xs text-muted-foreground">
        See also{' '}
        <Link to="/inventory/stock" className="text-matles-800 hover:underline">
          Stock
        </Link>{' '}
        for reserved/available aggregates.
      </p>
    </InventoryLayout>
  );
}
