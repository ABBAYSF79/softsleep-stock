import { useEffect, useState } from "react";
import { usePillowOutgoing, usePillowSupply } from "@/hooks/useApi";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface PillowOperationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pillow: {
    id: number;
    name: string;
    stock: number;
  } | null;
}

type OperationType = "supply" | "outgoing";

export const PillowOperationDialog = ({ open, onOpenChange, pillow }: PillowOperationDialogProps) => {
  const [operationType, setOperationType] = useState<OperationType>("supply");
  const [quantity, setQuantity] = useState<string>("");
  const [reason, setReason] = useState<string>("");

  const { mutate: supply, isPending: isSupplyPending } = usePillowSupply();
  const { mutate: outgoing, isPending: isOutgoingPending } = usePillowOutgoing();

  const isPending = isSupplyPending || isOutgoingPending;

  useEffect(() => {
    if (open) {
      setOperationType("supply");
      setQuantity("");
      setReason("");
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pillow || !quantity) return;

    const qty = parseInt(quantity, 10);
    if (!Number.isFinite(qty) || qty <= 0) return;

    const payload = {
      id: pillow.id,
      quantity: qty,
      reason: reason.trim() || (operationType === "supply" ? "Supply restock" : "Outgoing"),
    };

    const callbacks = { onSuccess: () => onOpenChange(false) };

    if (operationType === "supply") {
      supply(payload, callbacks);
      return;
    }

    outgoing(payload, callbacks);
  };

  if (!pillow) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Accessoires Stock Operation</DialogTitle>
          <DialogDescription>
            {pillow.name}
            <br />
            Current Stock: <span className="font-bold text-black">{pillow.stock}</span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-6 py-4">
            <div className="space-y-3">
              <Label>Operation Type</Label>
              <RadioGroup
                value={operationType}
                onValueChange={(val) => setOperationType(val as OperationType)}
                className="grid grid-cols-2 gap-4"
              >
                <div>
                  <RadioGroupItem value="supply" id="pillow-supply" className="peer sr-only" />
                  <Label
                    htmlFor="pillow-supply"
                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-green-600 peer-data-[state=checked]:text-green-600 cursor-pointer"
                  >
                    <span className="text-lg font-bold">+ Entrée</span>
                    <span className="text-xs text-muted-foreground mt-1">Add stock</span>
                  </Label>
                </div>
                <div>
                  <RadioGroupItem value="outgoing" id="pillow-outgoing" className="peer sr-only" />
                  <Label
                    htmlFor="pillow-outgoing"
                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-red-600 peer-data-[state=checked]:text-red-600 cursor-pointer"
                  >
                    <span className="text-lg font-bold">- Sortie</span>
                    <span className="text-xs text-muted-foreground mt-1">Remove stock</span>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="pillow-qty">Quantity</Label>
              <Input
                id="pillow-qty"
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="e.g. 10"
                required
                className="text-lg"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="pillow-reason">Note / Reason</Label>
              <Textarea
                id="pillow-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={operationType === "supply" ? "e.g. Supplier delivery" : "e.g. Sold / damaged / transfer"}
                required
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className={operationType === "supply" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
            >
              {isPending ? "Processing..." : "Confirm"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
