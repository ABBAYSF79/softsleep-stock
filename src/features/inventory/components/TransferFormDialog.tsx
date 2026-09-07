import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useAccessoriesCatalog,
  useCreateTransferMutation,
  useInventoryBalancesQuery,
  useInventoryLocationsQuery,
} from '../hooks/useInventoryQueries';
import { availableAtLocation } from '../utils/stockRows';
import { locationDisplayName } from '../utils/labels';
import { Plus, Trash2 } from 'lucide-react';

interface TransferFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type LineDraft = { key: string; pillowId: string; quantity: string };

export function TransferFormDialog({ open, onOpenChange }: TransferFormDialogProps) {
  const navigate = useNavigate();
  const { data: locations = [] } = useInventoryLocationsQuery();
  const { data: balances = [] } = useInventoryBalancesQuery();
  const { data: accessories = [] } = useAccessoriesCatalog();
  const create = useCreateTransferMutation();

  const wh = locations.find((l) => l.code === 'WH-MAIN');
  const sr = locations.find((l) => l.code === 'SR-MAIN');

  const [sourceId, setSourceId] = useState<string>('');
  const [destId, setDestId] = useState<string>('');
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([{ key: '1', pillowId: '', quantity: '' }]);

  useEffect(() => {
    if (!open) return;
    if (wh) setSourceId(String(wh.id));
    if (sr) setDestId(String(sr.id));
    setReason('');
    setLines([{ key: '1', pillowId: '', quantity: '' }]);
  }, [open, wh, sr]);

  const sourceNum = Number(sourceId);
  const destNum = Number(destId);

  const validationErrors = lines.map((line) => {
    if (!line.pillowId) return null;
    const pillowId = Number(line.pillowId);
    const qty = Number(line.quantity);
    const available = availableAtLocation(balances, pillowId, sourceNum);
    if (!Number.isInteger(qty) || qty <= 0) return 'Quantity must be a positive integer.';
    if (qty > available) return 'Quantity exceeds available stock.';
    return null;
  });

  const canSubmit =
    sourceNum > 0 &&
    destNum > 0 &&
    sourceNum !== destNum &&
    lines.every((l) => l.pillowId && Number(l.quantity) > 0) &&
    validationErrors.every((e) => e === null) &&
    !create.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New transfer</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="transfer-from">From</Label>
              <Select value={sourceId} onValueChange={setSourceId}>
                <SelectTrigger id="transfer-from">
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={String(l.id)}>
                      {locationDisplayName(l.code, l.name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="transfer-to">To</Label>
              <Select value={destId} onValueChange={setDestId}>
                <SelectTrigger id="transfer-to">
                  <SelectValue placeholder="Destination" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={String(l.id)} disabled={String(l.id) === sourceId}>
                      {locationDisplayName(l.code, l.name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {sourceNum === destNum && sourceNum > 0 ? (
            <p className="text-sm text-red-600">Source and destination must differ.</p>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="transfer-reason">Reason</Label>
            <Textarea
              id="transfer-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Optional"
              rows={2}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Accessories</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setLines((prev) => [
                    ...prev,
                    { key: String(Date.now()), pillowId: '', quantity: '' },
                  ])
                }
              >
                <Plus className="mr-1 h-4 w-4" />
                Add accessory
              </Button>
            </div>

            {lines.map((line, index) => {
              const pillowId = Number(line.pillowId);
              const available =
                pillowId > 0 && sourceNum > 0
                  ? availableAtLocation(balances, pillowId, sourceNum)
                  : null;
              return (
                <div key={line.key} className="space-y-2 rounded-md border border-gray-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 space-y-1.5">
                      <Label htmlFor={`acc-${line.key}`}>Accessoire</Label>
                      <Select
                        value={line.pillowId}
                        onValueChange={(v) =>
                          setLines((prev) =>
                            prev.map((l) => (l.key === line.key ? { ...l, pillowId: v } : l))
                          )
                        }
                      >
                        <SelectTrigger id={`acc-${line.key}`}>
                          <SelectValue placeholder="Select accessoire" />
                        </SelectTrigger>
                        <SelectContent>
                          {accessories.map((a) => (
                            <SelectItem key={a.id} value={String(a.id)}>
                              {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {lines.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="mt-6"
                        aria-label="Remove line"
                        onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                  {available !== null ? (
                    <p className="text-xs text-muted-foreground">
                      Available at source: <strong className="text-foreground">{available}</strong>
                    </p>
                  ) : null}
                  <div className="space-y-1.5">
                    <Label htmlFor={`qty-${line.key}`}>Quantity</Label>
                    <Input
                      id={`qty-${line.key}`}
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l) =>
                            l.key === line.key ? { ...l, quantity: e.target.value } : l
                          )
                        )
                      }
                    />
                    {validationErrors[index] ? (
                      <p className="text-xs text-red-600">{validationErrors[index]}</p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button
            disabled={!canSubmit}
            onClick={() => {
              create.mutate(
                {
                  sourceLocationId: sourceNum,
                  destinationLocationId: destNum,
                  reason: reason || null,
                  lines: lines.map((l) => ({
                    pillowId: Number(l.pillowId),
                    quantity: Number(l.quantity),
                  })),
                },
                {
                  onSuccess: (t) => {
                    onOpenChange(false);
                    navigate(`/inventory/transfers/${t.id}`);
                  },
                }
              );
            }}
          >
            {create.isPending ? 'Creating…' : 'Create transfer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
