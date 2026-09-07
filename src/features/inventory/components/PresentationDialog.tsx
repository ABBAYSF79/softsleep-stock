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
import {
  useInventoryBalancesQuery,
  useSetPresentationMutation,
} from '../hooks/useInventoryQueries';
import { locationDisplayName } from '../utils/labels';

interface PresentationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pillowId: number;
  pillowName: string;
  locationId: number;
  locationCode: string;
  locationName: string;
}

export function PresentationDialog({
  open,
  onOpenChange,
  pillowId,
  pillowName,
  locationId,
  locationCode,
  locationName,
}: PresentationDialogProps) {
  const { data: balances = [] } = useInventoryBalancesQuery({ pillowId, locationId });
  const setPresentation = useSetPresentationMutation();
  const bal = balances[0];
  const physical = bal?.physical ?? 0;
  const current = bal?.presentation ?? 0;
  const [value, setValue] = useState('');

  useEffect(() => {
    if (!open) return;
    setValue(String(current));
  }, [open, current]);

  const next = Number(value);
  const valid = Number.isInteger(next) && next >= 0 && next <= physical;
  const canSubmit = valid && !setPresentation.isPending;

  const submit = async () => {
    await setPresentation.mutateAsync({
      pillowId,
      locationId,
      presentation: next,
      reason: next > current ? 'PRESENTATION_ALLOCATION' : 'PRESENTATION_RELEASE',
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change Presentation</DialogTitle>
          <DialogDescription>
            {pillowName} · {locationDisplayName(locationCode, locationName)}. Presentation is an
            allocation of physical stock (does not change company stock).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <dt>Physical</dt>
            <dd className="text-right tabular-nums text-foreground">{physical}</dd>
            <dt>Current presentation</dt>
            <dd className="text-right tabular-nums text-foreground">{current}</dd>
            <dt>Available after</dt>
            <dd className="text-right tabular-nums text-foreground">
              {valid ? physical - next - (bal?.reserved ?? 0) : '—'}
            </dd>
          </dl>
          <div className="space-y-1.5">
            <Label htmlFor="pres-qty">New presentation quantity</Label>
            <Input
              id="pres-qty"
              type="number"
              min={0}
              max={physical}
              step={1}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            {!valid && value !== '' ? (
              <p className="text-sm text-destructive">Must be between 0 and {physical}.</p>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canSubmit} onClick={() => void submit()}>
            Save presentation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
