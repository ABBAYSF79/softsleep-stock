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
  useAdjustMutation,
  useInventoryBalancesQuery,
  useInventoryLocationsQuery,
} from '../hooks/useInventoryQueries';
import { locationDisplayName } from '../utils/labels';

interface AdjustStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pillowId: number;
  pillowName: string;
  defaultLocationId?: number;
}

export function AdjustStockDialog({
  open,
  onOpenChange,
  pillowId,
  pillowName,
  defaultLocationId,
}: AdjustStockDialogProps) {
  const { data: locations = [] } = useInventoryLocationsQuery();
  const { data: balances = [] } = useInventoryBalancesQuery({ pillowId });
  const adjust = useAdjustMutation();
  const [locationId, setLocationId] = useState('');
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLocationId(defaultLocationId ? String(defaultLocationId) : '');
    setDelta('');
    setReason('');
    setConfirming(false);
  }, [open, defaultLocationId]);

  const locId = Number(locationId);
  const d = Number(delta);
  const bal = balances.find((b) => b.location.id === locId);
  const current = bal?.physical ?? 0;
  const next = current + d;
  const loc = locations.find((l) => l.id === locId);
  const canSubmit =
    locId > 0 &&
    Number.isInteger(d) &&
    d !== 0 &&
    reason.trim().length > 0 &&
    next >= 0 &&
    !adjust.isPending;

  const submit = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    await adjust.mutateAsync({
      pillowId,
      locationId: locId,
      delta: d,
      reason: reason.trim(),
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adjustment</DialogTitle>
          <DialogDescription>
            Controlled physical correction for <strong>{pillowName}</strong>. Reason required.
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
            <Label htmlFor="adj-delta">Adjustment quantity</Label>
            <Input
              id="adj-delta"
              type="number"
              step={1}
              value={delta}
              onChange={(e) => { setDelta(e.target.value); setConfirming(false); }}
              placeholder="e.g. -2 or 5"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adj-reason">Reason</Label>
            <Textarea
              id="adj-reason"
              value={reason}
              onChange={(e) => { setReason(e.target.value); setConfirming(false); }}
              rows={2}
            />
          </div>
          {locId > 0 && Number.isInteger(d) && d !== 0 ? (
            <dl className="rounded-md border border-gray-200 px-3 py-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Current physical</dt>
                <dd className="tabular-nums">{current}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Adjustment</dt>
                <dd className="tabular-nums">{d > 0 ? `+${d}` : d}</dd>
              </div>
              <div className="flex justify-between gap-2 font-medium">
                <dt>New physical</dt>
                <dd className="tabular-nums">{next}</dd>
              </div>
              {next < 0 ? (
                <p className="mt-2 text-sm text-destructive">New physical cannot be negative.</p>
              ) : null}
            </dl>
          ) : null}
          {confirming && loc ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              Confirm adjustment at {locationDisplayName(loc.code, loc.name)}: {current} → {next}.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canSubmit} onClick={() => void submit()}>
            {confirming ? 'Confirm adjustment' : 'Continue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
