import { useEffect, useState } from "react";
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
import { Copy } from "lucide-react";
import { formatPrice } from "@/utils/order-utils";

interface DuplicateOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any | null;
  onConfirm: (count: number) => void;
  isPending?: boolean;
}

export function DuplicateOrderDialog({
  open,
  onOpenChange,
  order,
  onConfirm,
  isPending = false,
}: DuplicateOrderDialogProps) {
  const [count, setCount] = useState(1);

  useEffect(() => {
    if (open) setCount(1);
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Math.min(20, Math.max(1, Math.floor(Number(count) || 1)));
    onConfirm(n);
  };

  if (!order) return null;

  const itemCount = Array.isArray(order.items) ? order.items.length : 0;
  const suppCount = Array.isArray(order.pillowItems) ? order.pillowItems.length : 0;

  return (
    <Dialog open={open} onOpenChange={(val) => !isPending && onOpenChange(val)}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            Duplicate order
          </DialogTitle>
          <DialogDescription>
            Create new PENDING order(s) with the same customer, products, prices,
            supplement, and note. Tracking code is not copied.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <div className="font-medium">
              #{order.id} — {order.customerName}
            </div>
            <div className="mt-1 text-muted-foreground">
              {order.phone || "—"} · {order.city || "—"}
            </div>
            <div className="mt-1 text-muted-foreground">
              {itemCount} product(s)
              {suppCount > 0 ? ` · ${suppCount} supplement(s)` : ""}
              {" · "}
              MAD {formatPrice(order.totalAmount)}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="duplicate-count">Number of copies</Label>
            <Input
              id="duplicate-count"
              type="number"
              min={1}
              max={20}
              value={count}
              onChange={(e) => setCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">Default 1 · max 20</p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? "Creating..."
                : count === 1
                  ? "Create 1 order"
                  : `Create ${count} orders`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
