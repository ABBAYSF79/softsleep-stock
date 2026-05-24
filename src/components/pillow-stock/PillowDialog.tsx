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
import { useCreatePillow } from "@/hooks/useApi";

interface PillowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const PillowDialog = ({ open, onOpenChange }: PillowDialogProps) => {
  const [name, setName] = useState("");
  const [price, setPrice] = useState<string>("");
  const [stock, setStock] = useState<string>("0");

  const { mutate: createPillow, isPending } = useCreatePillow();

  useEffect(() => {
    if (open) {
      setName("");
      setPrice("");
      setStock("0");
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const payload = {
      name: name.trim(),
      price: Number(price),
      stock: Number(stock),
    };

    if (!payload.name) return;
    if (!Number.isFinite(payload.price) || payload.price < 0) return;
    if (!Number.isInteger(payload.stock) || payload.stock < 0) return;

    createPillow(payload, {
      onSuccess: () => onOpenChange(false),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Create Accessoire</DialogTitle>
          <DialogDescription>New accessoire item with independent stock.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="pillow-name">Accessoire name</Label>
              <Input
                id="pillow-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Accessoire Premium"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pillow-price">Price</Label>
              <Input
                id="pillow-price"
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="e.g. 120.00"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pillow-stock">Initial quantity</Label>
              <Input
                id="pillow-stock"
                type="number"
                min="0"
                step="1"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                required
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} className="bg-matles-600 hover:bg-matles-700">
              {isPending ? "Saving..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
