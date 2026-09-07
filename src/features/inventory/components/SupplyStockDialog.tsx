import { useEffect, useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useInventoryLocationsQuery,
  useSupplyMutation,
} from '../hooks/useInventoryQueries';
import { locationDisplayName } from '../utils/labels';

interface SupplyStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pillowId: number;
  pillowName: string;
  defaultLocationId?: number;
}

export function SupplyStockDialog({
  open,
  onOpenChange,
  pillowId,
  pillowName,
  defaultLocationId,
}: SupplyStockDialogProps) {
  const { data: locations = [] } = useInventoryLocationsQuery();
  const supply = useSupplyMutation();
  const [locationId, setLocationId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLocationId(defaultLocationId ? String(defaultLocationId) : '');
    setQuantity('');
    setReason('');
    setConfirming(false);
  }, [open, defaultLocationId]);

  const locId = Number(locationId);
  const qty = Number(quantity);
  const loc = locations.find((l) => l.id === locId);
  const canSubmit =
    locId > 0 && Number.isInteger(qty) && qty > 0 && reason.trim().length > 0 && !supply.isPending;

  const submit = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    await supply.mutateAsync({
      pillowId,
      locationId: locId,
      quantity: qty,
      reason: reason.trim(),
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Stock</DialogTitle>
          <DialogDescription>
            Add physical stock for <strong>{pillowName}</strong> at a specific location.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Location</Label>
            <Select value={locationId} onValueChange={(v) => { setLocationId(v); setConfirming(false); }}>
              <SelectTrigger>
                <SelectValue placeholder="Select location" />
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
            <Label htmlFor="supply-qty">Quantity</Label>
            <Input
              id="supply-qty"
              type="number"
              min={1}
              step={1}
              value={quantity}
              onChange={(e) => { setQuantity(e.target.value); setConfirming(false); }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="supply-reason">Reason</Label>
            <Textarea
              id="supply-reason"
              value={reason}
              onChange={(e) => { setReason(e.target.value); setConfirming(false); }}
              placeholder="e.g. New delivery"
              rows={2}
            />
          </div>
          {confirming && loc && Number.isInteger(qty) && qty > 0 ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              {qty} units will be added to {locationDisplayName(loc.code, loc.name)} physical stock.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canSubmit} onClick={() => void submit()}>
            {confirming ? 'Confirm add' : 'Continue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
