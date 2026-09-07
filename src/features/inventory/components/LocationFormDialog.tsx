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
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useCreateLocationMutation,
  useUpdateLocationMutation,
} from '../hooks/useInventoryQueries';
import type { InventoryLocation } from '../types';

type LocationType = 'WAREHOUSE' | 'SHOWROOM' | 'OTHER';

interface LocationFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  location?: InventoryLocation | null;
}

function previewCodeForType(type: LocationType): string {
  if (type === 'WAREHOUSE') return 'WH-…';
  if (type === 'SHOWROOM') return 'SR-…';
  return 'OT-…';
}

export function LocationFormDialog({ open, onOpenChange, location }: LocationFormDialogProps) {
  const isEdit = Boolean(location);
  const create = useCreateLocationMutation();
  const update = useUpdateLocationMutation();

  const [name, setName] = useState('');
  const [type, setType] = useState<LocationType>('WAREHOUSE');
  const [isSellable, setIsSellable] = useState(true);
  const [allowsPresentation, setAllowsPresentation] = useState(false);
  const [sortOrder, setSortOrder] = useState('100');
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    if (location) {
      setName(location.name);
      setType(location.type as LocationType);
      setIsSellable(location.isSellable);
      setAllowsPresentation(location.allowsPresentation);
      setSortOrder(String(location.sortOrder));
      setActive(location.active);
    } else {
      setName('');
      setType('WAREHOUSE');
      setIsSellable(true);
      setAllowsPresentation(false);
      setSortOrder('100');
      setActive(true);
    }
  }, [open, location]);

  useEffect(() => {
    if (type === 'WAREHOUSE') setAllowsPresentation(false);
    if (type === 'SHOWROOM' && !isEdit) setAllowsPresentation(true);
  }, [type, isEdit]);

  const sortNum = Number(sortOrder);
  const canSubmit =
    name.trim().length > 0 &&
    Number.isInteger(sortNum) &&
    !create.isPending &&
    !update.isPending;

  const submit = async () => {
    if (isEdit && location) {
      await update.mutateAsync({
        id: location.id,
        name: name.trim(),
        type,
        isSellable,
        allowsPresentation: type === 'WAREHOUSE' ? false : allowsPresentation,
        sortOrder: sortNum,
        active,
      });
    } else {
      await create.mutateAsync({
        name: name.trim(),
        type,
        isSellable,
        allowsPresentation: type === 'WAREHOUSE' ? false : allowsPresentation,
        sortOrder: sortNum,
      });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit location' : 'Add location'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Code is fixed after creation. You can update name, type, and flags.'
              : 'Code is generated automatically (WH-… / SR-… / OT-…).'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Code</Label>
            <Input
              value={isEdit && location ? location.code : previewCodeForType(type)}
              disabled
              className="bg-muted"
            />
            {!isEdit ? (
              <p className="text-xs text-muted-foreground">
                Assigned on save — e.g. WH-MAIN, WH-02, SR-02.
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loc-name">Name</Label>
            <Input
              id="loc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Entrepôt Casa / Showroom Ads"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as LocationType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="WAREHOUSE">Warehouse</SelectItem>
                <SelectItem value="SHOWROOM">Showroom</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loc-sort">Sort order</Label>
            <Input
              id="loc-sort"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
            <div>
              <p className="text-sm font-medium">Sellable</p>
              <p className="text-xs text-muted-foreground">Can fulfill / sell from this location</p>
            </div>
            <Switch checked={isSellable} onCheckedChange={setIsSellable} />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
            <div>
              <p className="text-sm font-medium">Allows presentation</p>
              <p className="text-xs text-muted-foreground">Showroom display allocation only</p>
            </div>
            <Switch
              checked={allowsPresentation}
              disabled={type === 'WAREHOUSE'}
              onCheckedChange={setAllowsPresentation}
            />
          </div>
          {isEdit ? (
            <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">
                  Inactive locations stay in history but cannot be used for new ops
                </p>
              </div>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canSubmit} onClick={() => void submit()}>
            {isEdit ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
