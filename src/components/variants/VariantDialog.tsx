import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const VariantDialog = ({ open, onOpenChange, variant, productId, createVariant, updateVariant }) => {
  const [name, setName] = useState("");
  const [skuExt, setSkuExt] = useState("");
  const [price, setPrice] = useState<number | null>(null);
  const [size, setSize] = useState<string>("120X20X15");
  const [stock, setStock] = useState<number | null>(null);
  const [commission, setCommission] = useState<number | null>(null);

  useEffect(() => {
    if (variant) {
      setName(variant.name);
      setSkuExt(variant.skuExt);
      setPrice(parseFloat(variant.price.toString()));
      setSize(variant.size || "120X20X15");
      setStock(variant.stock);
      setCommission(variant.commission ? parseFloat(variant.commission.toString()) : null);
    } else {
      setName("");
      setSkuExt("");
      setPrice(null);
      setSize("120X20X15");
      setStock(null);
      setCommission(null);
    }
  }, [variant]);

  const handleSave = async () => {
    if (!name || !skuExt || price === null || !size || stock === null) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (!/^\d+X\d+X\d+$/.test(size)) {
      toast.error("Size must be in the format: 120X20X15");
      return;
    }

    try {
      const variantData = {
        name,
        skuExt,
        price,
        size,
        stock,
        commission,
      };

      if (variant) {
        await updateVariant.mutateAsync({ id: variant.id, ...variantData });
      } else {
        await createVariant.mutateAsync({ productId, ...variantData });
      }
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving variant:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{variant ? "Edit Variant" : "Create Variant"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Variant name" />
          </div>
          <div className="space-y-2">
            <Label>SKU Extension</Label>
            <Input value={skuExt} onChange={(e) => setSkuExt(e.target.value)} placeholder="SKU extension" />
          </div>
          <div className="space-y-2">
            <Label>Price</Label>
            <Input type="number" value={price || ""} onChange={(e) => setPrice(e.target.value ? parseFloat(e.target.value) : null)} placeholder="Price" />
          </div>
          <div className="space-y-2">
            <Label>Size (LxWxH)</Label>
            <Input value={size} onChange={(e) => setSize(e.target.value)} placeholder="e.g., 120X20X15" />
          </div>
          <div className="space-y-2">
            <Label>Stock</Label>
            <Input type="number" value={stock || ""} onChange={(e) => setStock(e.target.value ? parseInt(e.target.value) : null)} placeholder="Stock" />
          </div>
          <div className="space-y-2">
            <Label>Commission (Optional)</Label>
            <Input type="number" value={commission || ""} onChange={(e) => setCommission(e.target.value ? parseFloat(e.target.value) : null)} placeholder="Commission" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave}>{variant ? "Update" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default VariantDialog; 