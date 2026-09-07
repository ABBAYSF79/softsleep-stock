import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { InventoryLayout } from '@/features/inventory/components/InventoryLayout';
import { TransferStatusBadge } from '@/features/inventory/components/TransferStatusBadge';
import { TransferTimeline } from '@/features/inventory/components/TransferTimeline';
import { DispatchDialog } from '@/features/inventory/components/DispatchDialog';
import { ReceiveDialog } from '@/features/inventory/components/ReceiveDialog';
import {
  useCancelTransferMutation,
  useInventoryTransferQuery,
} from '@/features/inventory/hooks/useInventoryQueries';
import {
  documentTypeLabel,
  locationDisplayName,
} from '@/features/inventory/utils/labels';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function InventoryTransferDetailPage() {
  const { id } = useParams();
  const transferId = Number(id);
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const { data: transfer, isLoading, error, refetch } = useInventoryTransferQuery(transferId);
  const cancel = useCancelTransferMutation();

  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  if (isLoading) {
    return (
      <InventoryLayout title="Transfer">
        <Skeleton className="h-64 w-full" />
      </InventoryLayout>
    );
  }

  if (error || !transfer) {
    return (
      <InventoryLayout title="Transfer">
        <p className="text-sm text-red-600">Transfer not found.</p>
        <Button asChild variant="outline" className="mt-3">
          <Link to="/inventory/transfers">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back
          </Link>
        </Button>
      </InventoryLayout>
    );
  }

  const ref = transfer.reference || transfer.referenceNumber;
  const beDocs = (transfer.documents || []).filter((d) => d.type === 'BON_ENTREE');
  const bsDocs = (transfer.documents || []).filter((d) => d.type === 'BON_SORTIE');

  return (
    <InventoryLayout
      title={ref}
      description={`${locationDisplayName(
        transfer.sourceLocation.code,
        transfer.sourceLocation.name
      )} → ${locationDisplayName(
        transfer.destinationLocation.code,
        transfer.destinationLocation.name
      )}`}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/inventory/transfers">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back
            </Link>
          </Button>
          {isAdmin && transfer.status === 'DRAFT' ? (
            <>
              <Button size="sm" onClick={() => setDispatchOpen(true)}>
                Validate Bon de Sortie
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setCancelOpen(true)}>
                Cancel draft
              </Button>
            </>
          ) : null}
          {isAdmin &&
          (transfer.status === 'DISPATCHED' || transfer.status === 'PARTIALLY_RECEIVED') ? (
            <Button size="sm" onClick={() => setReceiveOpen(true)}>
              Receive Stock
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <TransferStatusBadge status={transfer.status} />
        <span className="text-sm text-muted-foreground">
          Created by {transfer.createdBy?.name ?? '—'} ·{' '}
          {new Date(transfer.createdAt).toLocaleString()}
        </span>
      </div>

      {transfer.reason ? (
        <p className="text-sm text-muted-foreground">
          Reason: <span className="text-foreground">{transfer.reason}</span>
        </p>
      ) : null}

      <Card className="border-gray-200/80 shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <TransferTimeline transfer={transfer} />
        </CardContent>
      </Card>

      <Card className="border-gray-200/80 shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Lines</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Accessoire</TableHead>
                <TableHead className="text-right">Requested</TableHead>
                <TableHead className="text-right">Sent</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">In Transit</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfer.lines.map((line) => {
                const remaining =
                  line.availableRemainingToReceive ??
                  line.sentQuantity - line.receivedQuantity;
                return (
                  <TableRow key={line.id}>
                    <TableCell className="font-medium">
                      {line.pillow?.name ?? `#${line.pillowId}`}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {line.requestedQuantity ?? line.sentQuantity}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{line.sentQuantity}</TableCell>
                    <TableCell className="text-right tabular-nums">{line.receivedQuantity}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {line.inTransitQuantity ?? Math.max(0, line.sentQuantity - line.receivedQuantity)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {remaining}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-gray-200/80 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Bon de Sortie</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {bsDocs.length === 0 ? (
              <p className="text-muted-foreground">No BS document yet.</p>
            ) : (
              bsDocs.map((d) => (
                <div key={d.id} className="flex justify-between gap-2">
                  <Link
                    to={`/inventory/documents/${d.id}`}
                    className="font-medium text-matles-800 hover:underline"
                  >
                    {d.documentNumber}
                  </Link>
                  <span className="text-muted-foreground">{d.status}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-gray-200/80 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Receipts (Bon d&apos;Entrée)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {beDocs.length === 0 ? (
              <p className="text-muted-foreground">
                No receipts yet. Multiple BE documents are allowed for partial receiving.
              </p>
            ) : (
              beDocs.map((d) => {
                const units = d.lines?.reduce((s, l) => s + l.quantity, 0) ?? 0;
                return (
                  <div key={d.id} className="rounded-md border border-gray-100 px-3 py-2">
                    <div className="flex justify-between gap-2">
                      <Link
                        to={`/inventory/documents/${d.id}`}
                        className="font-medium text-matles-800 hover:underline"
                      >
                        {d.documentNumber}
                      </Link>
                      <span className="tabular-nums">{units} units</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {documentTypeLabel(d.type)} ·{' '}
                      {d.validatedAt
                        ? new Date(d.validatedAt).toLocaleString()
                        : d.status}
                    </p>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      <DispatchDialog
        transfer={transfer}
        open={dispatchOpen}
        onOpenChange={setDispatchOpen}
        onSuccess={() => void refetch()}
      />
      <ReceiveDialog
        transfer={transfer}
        open={receiveOpen}
        onOpenChange={setReceiveOpen}
        onSuccess={() => void refetch()}
      />

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel draft transfer?</AlertDialogTitle>
            <AlertDialogDescription>
              Transfer {ref} has no stock effect yet. Cancelling removes it from the active workflow.
              This cannot be undone from the UI.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep draft</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                cancel.mutate(transfer.id, {
                  onSuccess: () => {
                    setCancelOpen(false);
                    void refetch();
                  },
                });
              }}
            >
              Cancel transfer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </InventoryLayout>
  );
}
