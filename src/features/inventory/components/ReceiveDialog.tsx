import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Transfer } from '../types';
import { useReceiveTransferMutation } from '../hooks/useInventoryQueries';

interface ReceiveDialogProps {
  transfer: Transfer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function ReceiveDialog({ transfer, open, onOpenChange, onSuccess }: ReceiveDialogProps) {
  const receive = useReceiveTransferMutation();
  const [qty, setQty] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!transfer || !open) return;
    const next: Record<number, string> = {};
    for (const line of transfer.lines) {
      const remaining = line.availableRemainingToReceive ?? line.sentQuantity - line.receivedQuantity;
      next[line.pillowId] = remaining > 0 ? String(remaining) : '0';
    }
    setQty(next);
  }, [transfer, open]);

  const lines = useMemo(() => {
    if (!transfer) return [];
    return transfer.lines
      .map((line) => {
        const remaining =
          line.availableRemainingToReceive ?? line.sentQuantity - line.receivedQuantity;
        const raw = Number(qty[line.pillowId] ?? 0);
        return { line, remaining, raw };
      })
      .filter((x) => x.remaining > 0);
  }, [transfer, qty]);

  const invalid = lines.some(
    (x) => !Number.isInteger(x.raw) || x.raw < 0 || x.raw > x.remaining
  );
  const hasPositive = lines.some((x) => x.raw > 0);

  if (!transfer) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Receive stock</DialogTitle>
          <DialogDescription>
            You can receive partially. Multiple Bon d&apos;Entrée documents are supported for the
            same transfer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing left to receive.</p>
          ) : (
            lines.map(({ line, remaining }) => (
              <div
                key={line.id}
                className="rounded-md border border-gray-200 p-3 space-y-2"
              >
                <p className="font-medium text-gray-900">
                  {line.pillow?.name ?? `Accessoire #${line.pillowId}`}
                </p>
                <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                  <span>Sent: {line.sentQuantity}</span>
                  <span>Received: {line.receivedQuantity}</span>
                  <span>Remaining: {remaining}</span>
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`recv-${line.pillowId}`}>Receive now</Label>
                  <Input
                    id={`recv-${line.pillowId}`}
                    type="number"
                    min={0}
                    max={remaining}
                    value={qty[line.pillowId] ?? ''}
                    onChange={(e) =>
                      setQty((prev) => ({ ...prev, [line.pillowId]: e.target.value }))
                    }
                  />
                  {Number(qty[line.pillowId]) > remaining ? (
                    <p className="text-xs text-red-600">
                      La quantité reçue dépasse la quantité encore en transit.
                    </p>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={receive.isPending}>
            Cancel
          </Button>
          <Button
            disabled={receive.isPending || invalid || !hasPositive}
            onClick={() => {
              const payload = lines
                .filter((x) => x.raw > 0)
                .map((x) => ({ pillowId: x.line.pillowId, quantity: x.raw }));
              receive.mutate(
                { id: transfer.id, input: { lines: payload } },
                {
                  onSuccess: () => {
                    onOpenChange(false);
                    onSuccess?.();
                  },
                }
              );
            }}
          >
            {receive.isPending ? 'Validating…' : 'Validate Bon d’Entrée'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
