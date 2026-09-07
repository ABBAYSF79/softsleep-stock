import { useState } from 'react';
import { InventoryLayout } from '@/features/inventory/components/InventoryLayout';
import { InventoryEmptyState } from '@/features/inventory/components/InventoryEmptyState';
import { LocationFormDialog } from '@/features/inventory/components/LocationFormDialog';
import {
  useInventoryBalancesQuery,
  useInventoryLocationsQuery,
  useInventoryMode,
  useInventoryTransfersQuery,
  useUpdateLocationMutation,
} from '@/features/inventory/hooks/useInventoryQueries';
import { buildLocationSummaries } from '@/features/inventory/utils/stockRows';
import { locationDisplayName } from '@/features/inventory/utils/labels';
import type { InventoryLocation } from '@/features/inventory/types';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Pencil, Plus, Power } from 'lucide-react';

export default function InventoryLocationsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const { data: mode } = useInventoryMode();
  const { data: locations = [], isLoading: locLoading } = useInventoryLocationsQuery({
    includeInactive: isAdmin,
  });
  const { data: balances = [], isLoading: balLoading } = useInventoryBalancesQuery();
  const { data: transfers = [] } = useInventoryTransfersQuery();
  const updateLocation = useUpdateLocationMutation();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryLocation | null>(null);

  const summaries = buildLocationSummaries(balances, transfers, locations);
  const summaryById = new Map(summaries.map((s) => [s.locationId, s]));
  const loading = locLoading || balLoading;

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (loc: InventoryLocation) => {
    setEditing(loc);
    setFormOpen(true);
  };

  return (
    <InventoryLayout
      title="Locations"
      description="Manage warehouses, showrooms, and other stock sites. Soft-deactivate instead of deleting."
      actions={
        isAdmin ? (
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add location
          </Button>
        ) : undefined
      }
    >
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : locations.length === 0 ? (
        <InventoryEmptyState
          title="No locations found"
          description="Create WH-MAIN / SR-MAIN (or run seed:locations), then add more sites as needed."
          actionLabel={isAdmin ? 'Add location' : undefined}
          onAction={isAdmin ? openCreate : undefined}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {locations.map((loc) => {
            const sum = summaryById.get(loc.id);
            return (
              <Card
                key={loc.id}
                className={`border-gray-200/80 shadow-none ${!loc.active ? 'opacity-70' : ''}`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-lg">
                        {locationDisplayName(loc.code, loc.name)}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">{loc.code}</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      <Badge variant="secondary">{loc.type}</Badge>
                      {!loc.active ? <Badge variant="outline">Inactive</Badge> : null}
                      {loc.isSellable ? <Badge variant="outline">Sellable</Badge> : null}
                      {loc.allowsPresentation ? (
                        <Badge variant="outline">Presentation</Badge>
                      ) : null}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {!mode?.initialized ? (
                    <p className="text-sm text-muted-foreground">
                      No opening inventory initialized — stock figures stay empty until cutover.
                    </p>
                  ) : null}
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <dt className="text-muted-foreground">Physical</dt>
                    <dd className="text-right font-semibold tabular-nums">{sum?.physical ?? 0}</dd>
                    <dt className="text-muted-foreground">Presentation</dt>
                    <dd className="text-right tabular-nums">{sum?.presentation ?? 0}</dd>
                    <dt className="text-muted-foreground">Reserved</dt>
                    <dd className="text-right tabular-nums">{sum?.reserved ?? 0}</dd>
                    <dt className="text-muted-foreground">Available</dt>
                    <dd className="text-right font-semibold tabular-nums text-emerald-700">
                      {sum?.available ?? 0}
                    </dd>
                    <dt className="text-muted-foreground">In Transit</dt>
                    <dd className="text-right tabular-nums">{sum?.inTransit ?? 0}</dd>
                  </dl>
                  {loc.type === 'WAREHOUSE' ? (
                    <p className="text-xs text-muted-foreground">
                      Warehouse presentation stays 0.
                    </p>
                  ) : null}
                  {loc.type === 'SHOWROOM' ? (
                    <p className="text-xs text-muted-foreground">
                      Presentation is part of physical stock but not sellable.
                    </p>
                  ) : null}
                  {isAdmin ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => openEdit(loc)}>
                        <Pencil className="mr-1.5 h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={updateLocation.isPending}
                        onClick={() =>
                          void updateLocation.mutateAsync({
                            id: loc.id,
                            active: !loc.active,
                          })
                        }
                      >
                        <Power className="mr-1.5 h-3.5 w-3.5" />
                        {loc.active ? 'Deactivate' : 'Reactivate'}
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <LocationFormDialog open={formOpen} onOpenChange={setFormOpen} location={editing} />
    </InventoryLayout>
  );
}
