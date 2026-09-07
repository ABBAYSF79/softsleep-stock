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
import { locationDisplayName } from '../utils/labels';
import type { Transfer } from '../types';
import { useDispatchTransferMutation } from '../hooks/useInventoryQueries';

interface DispatchDialogProps {
  transfer: Transfer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function DispatchDialog({ transfer, open, onOpenChange, onSuccess }: DispatchDialogProps) {
  const dispatch = useDispatchTransferMutation();

  if (!transfer) return null;

  const source = locationDisplayName(
    transfer.sourceLocation.code,
    transfer.sourceLocation.name
  );

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Validate Bon de Sortie</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                You are about to dispatch transfer{' '}
                <span className="font-medium text-foreground">
                  {transfer.reference || transfer.referenceNumber}
                </span>
                .
              </p>
              <ul className="list-inside list-disc space-y-1 text-foreground">
                {transfer.lines.map((line) => (
                  <li key={line.id}>
                    {line.pillow?.name ?? `Accessoire #${line.pillowId}`} × {line.sentQuantity}
                  </li>
                ))}
              </ul>
              <p>
                Stock will leave <strong>{source}</strong> and become <strong>In Transit</strong>.
                Presentation and reserved quantities are not touched.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={dispatch.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={dispatch.isPending}
            onClick={(e) => {
              e.preventDefault();
              dispatch.mutate(transfer.id, {
                onSuccess: () => {
                  onOpenChange(false);
                  onSuccess?.();
                },
              });
            }}
          >
            {dispatch.isPending ? 'Dispatching…' : 'Confirm dispatch'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
