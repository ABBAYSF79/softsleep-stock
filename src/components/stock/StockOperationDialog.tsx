import { useState, useEffect } from "react";
import { useAddSupply, useAddCorrection } from "@/hooks/useApi";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface StockOperationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant: {
    id: number;
    product: string;
    variant: string;
    sku: string;
    currentStock: number;
  } | null;
}

type OperationType = "supply" | "found" | "damaged";

export const StockOperationDialog = ({
  open,
  onOpenChange,
  variant,
}: StockOperationDialogProps) => {
  const [operationType, setOperationType] = useState<OperationType>("supply");
  const [quantity, setQuantity] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  
  const { mutate: addSupply, isPending: isSupplyPending } = useAddSupply();
  const { mutate: addCorrection, isPending: isCorrectionPending } = useAddCorrection();

  const isPending = isSupplyPending || isCorrectionPending;

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setOperationType("supply");
      setQuantity("");
      setReason("");
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!variant || !quantity) return;

    const qty = parseInt(quantity);
    if (qty <= 0) return;

    const successCallback = {
      onSuccess: () => {
        onOpenChange(false);
      },
    };

    if (operationType === "supply") {
      addSupply(
        {
          id: variant.id,
          quantity: qty,
          reason: reason || "Supply restock",
        },
        successCallback
      );
    } else if (operationType === "found") {
      addCorrection(
        {
          id: variant.id,
          quantity: qty,
          reason: reason || "Correction (Found items)",
          type: "ADJUSTMENT",
        },
        successCallback
      );
    } else if (operationType === "damaged") {
      addCorrection(
        {
          id: variant.id,
          quantity: -qty, // Negative for damaged/lost
          reason: reason || "Correction (Damaged/Lost items)",
          type: "ADJUSTMENT",
        },
        successCallback
      );
    }
  };

  if (!variant) return null;

  const getDialogTitle = () => {
    switch (operationType) {
      case "supply": return "Add Supply";
      case "found": return "Stock Correction (Found)";
      case "damaged": return "Stock Correction (Damaged/Lost)";
      default: return "Stock Operation";
    }
  };

  const getActionColor = () => {
    switch (operationType) {
      case "supply": return "bg-green-600 hover:bg-green-700";
      case "found": return "bg-blue-600 hover:bg-blue-700";
      case "damaged": return "bg-red-600 hover:bg-red-700";
      default: return "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{getDialogTitle()}</DialogTitle>
          <DialogDescription>
            {variant.product} - {variant.variant} (SKU: {variant.sku})<br/>
            Current Stock: <span className="font-bold text-black">{variant.currentStock}</span>
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit}>
          <div className="grid gap-6 py-4">
            <div className="space-y-3">
              <Label>Operation Type</Label>
              <RadioGroup 
                value={operationType} 
                onValueChange={(val) => setOperationType(val as OperationType)}
                className="grid grid-cols-3 gap-4"
              >
                <div>
                  <RadioGroupItem value="supply" id="supply" className="peer sr-only" />
                  <Label
                    htmlFor="supply"
                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-green-600 peer-data-[state=checked]:text-green-600 cursor-pointer"
                  >
                    <span className="text-lg font-bold">+ Supply</span>
                    <span className="text-xs text-muted-foreground mt-1">New Arrival</span>
                  </Label>
                </div>
                <div>
                  <RadioGroupItem value="found" id="found" className="peer sr-only" />
                  <Label
                    htmlFor="found"
                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-blue-600 peer-data-[state=checked]:text-blue-600 cursor-pointer"
                  >
                    <span className="text-lg font-bold">+ Found</span>
                    <span className="text-xs text-muted-foreground mt-1">Inventory Fix</span>
                  </Label>
                </div>
                <div>
                  <RadioGroupItem value="damaged" id="damaged" className="peer sr-only" />
                  <Label
                    htmlFor="damaged"
                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-red-600 peer-data-[state=checked]:text-red-600 cursor-pointer"
                  >
                    <span className="text-lg font-bold">- Lost</span>
                    <span className="text-xs text-muted-foreground mt-1">Damaged/Lost</span>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="quantity">
                Quantity {operationType === "damaged" ? "(to remove)" : "(to add)"}
              </Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="e.g. 10"
                required
                className="text-lg"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="reason">Note / Reason</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={
                  operationType === "supply" 
                    ? "e.g. Container #44 from Supplier X" 
                    : "e.g. Annual inventory count correction"
                }
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
              className={getActionColor()}
            >
              {isPending ? "Processing..." : "Confirm Operation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
