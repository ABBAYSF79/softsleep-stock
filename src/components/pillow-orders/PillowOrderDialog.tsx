import { useEffect, useMemo, useState } from "react";
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
import { useCreatePillowOrder, useDeliveryServices, usePillowStock } from "@/hooks/useApi";
import { formatPrice } from "@/utils/order-utils";
import { Trash2 } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useAuth } from "@/contexts/AuthContext";

interface PillowOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type OrderItemDraft = {
  pillowId: number;
  pillowName: string;
  price: any;
  stock: number;
  quantity: number;
};

export const PillowOrderDialog = ({ open, onOpenChange }: PillowOrderDialogProps) => {
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [deliveryServiceId, setDeliveryServiceId] = useState<string>("");
  const [manualTotal, setManualTotal] = useState<string>("");

  const [selectedPillowId, setSelectedPillowId] = useState<string>("");
  const [quantity, setQuantity] = useState(1);
  const [items, setItems] = useState<OrderItemDraft[]>([]);

  const { user } = useAuth();
  const canOverrideTotal = user?.role === "ADMIN" || user?.role === "SALES";
  const { data: pillows = [] } = usePillowStock();
  const { data: deliveryServices = [] } = useDeliveryServices();
  const { mutate: createOrder, isPending } = useCreatePillowOrder();

  useEffect(() => {
    if (!open) return;
    setCustomerName("");
    setPhone("");
    setAddress("");
    setCity("");
    setDeliveryServiceId("");
    setManualTotal("");
    setSelectedPillowId("");
    setQuantity(1);
    setItems([]);
  }, [open]);

  const pillowById = useMemo(() => {
    const map = new Map<number, any>();
    (pillows as any[]).forEach((p) => map.set(p.id, p));
    return map;
  }, [pillows]);

  const deliveryServiceOptions = useMemo(() => {
    return (deliveryServices as any[])
      .filter((s) => s && s.active !== false)
      .slice()
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
      .map((s) => ({ label: s.name, value: String(s.id) }));
  }, [deliveryServices]);

  const selectedServiceCities = useMemo(() => {
    return (
      (deliveryServices as any[]).find((s) => String(s.id) === deliveryServiceId)?.cities ||
      []
    );
  }, [deliveryServices, deliveryServiceId]);

  const cityOptions = useMemo(() => {
    return (selectedServiceCities as any[]).map((c) => ({ label: String(c), value: String(c) }));
  }, [selectedServiceCities]);

  const pillowOptions = useMemo(() => {
    return (pillows as any[])
      .slice()
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
      .map((p) => ({
        label: `${p.name} (Stock: ${p.stock ?? 0})`,
        value: String(p.id),
        disabled: (p.stock ?? 0) <= 0,
      }));
  }, [pillows]);

  const total = items.reduce((sum, i) => sum + Number(i.price) * i.quantity, 0);
  const manualTotalNumber =
    canOverrideTotal && manualTotal.trim() !== "" && Number.isFinite(Number(manualTotal)) ? Number(manualTotal) : null;
  const displayedTotal = manualTotalNumber ?? total;

  const addItem = () => {
    const pillowId = Number(selectedPillowId);
    if (!Number.isInteger(pillowId) || pillowId <= 0) return;

    const pillow = pillowById.get(pillowId);
    if (!pillow) return;

    if (!Number.isInteger(quantity) || quantity <= 0) return;

    setItems((prev) => {
      const next = prev.slice();
      const idx = next.findIndex((i) => i.pillowId === pillowId);
      const existingQty = idx >= 0 ? next[idx].quantity : 0;
      const newQty = existingQty + quantity;

      if (newQty > (pillow.stock || 0)) return prev;

      const row: OrderItemDraft = {
        pillowId,
        pillowName: pillow.name,
        price: pillow.price,
        stock: pillow.stock || 0,
        quantity: newQty,
      };

      if (idx >= 0) next[idx] = row;
      else next.push(row);
      return next;
    });
  };

  const removeItem = (pillowId: number) => {
    setItems((prev) => prev.filter((i) => i.pillowId !== pillowId));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending) return;

    const payload: any = {
      customerName: customerName.trim(),
      phone: phone.trim(),
      address: address.trim(),
      city: city.trim(),
      deliveryServiceId: Number(deliveryServiceId),
      items: items.map((i) => ({ pillowId: i.pillowId, quantity: i.quantity })),
    };
    if (canOverrideTotal && manualTotalNumber !== null) payload.totalAmount = manualTotalNumber;

    if (!payload.customerName) return;
    if (!payload.phone) return;
    if (!payload.address) return;
    if (!payload.city) return;
    if (!Number.isInteger(payload.deliveryServiceId)) return;
    if (payload.items.length === 0) return;

    createOrder(payload, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle>Create Accessoires Order</DialogTitle>
          <DialogDescription>Separate order flow for accessoires only.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="po-name">Nom</Label>
                <Input id="po-name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="po-phone">Téléphone</Label>
                <Input id="po-phone" value={phone} onChange={(e) => setPhone(e.target.value)} required />
              </div>
              <div className="grid gap-2">
                <Label>Ville</Label>
                <SearchableSelect
                  value={city}
                  onValueChange={setCity}
                  options={cityOptions}
                  placeholder="Select city"
                  searchPlaceholder="Search city..."
                  disabled={!deliveryServiceId}
                />
              </div>
              <div className="grid gap-2">
                <Label>Delivery service</Label>
                <SearchableSelect
                  value={deliveryServiceId}
                  onValueChange={(value) => {
                    setDeliveryServiceId(value);
                    setCity("");
                  }}
                  options={deliveryServiceOptions}
                  placeholder="Select delivery service"
                  searchPlaceholder="Search service..."
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="po-address">Adresse</Label>
              <Textarea id="po-address" value={address} onChange={(e) => setAddress(e.target.value)} required />
            </div>

            <div className="border rounded-md p-4">
              <div className="font-medium mb-3">Accessoires</div>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_140px] gap-3 items-end">
                <div className="grid gap-2">
                  <Label>Accessoire</Label>
                  <SearchableSelect
                    value={selectedPillowId}
                    onValueChange={setSelectedPillowId}
                    options={pillowOptions}
                    placeholder="Select accessoire"
                    searchPlaceholder="Search accessoire..."
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Qty</Label>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value || "1", 10))}
                  />
                </div>
                <Button type="button" variant="outline" onClick={addItem}>
                  Add
                </Button>
              </div>

              {items.length > 0 && (
                <div className="mt-4 border rounded-md overflow-hidden">
                  <div className="grid grid-cols-[1fr_110px_110px_44px] gap-2 px-3 py-2 text-xs text-gray-500 bg-gray-50">
                    <div>Accessoire</div>
                    <div className="text-right">Price</div>
                    <div className="text-right">Qty</div>
                    <div />
                  </div>
                  {items.map((i) => (
                    <div key={i.pillowId} className="grid grid-cols-[1fr_110px_110px_44px] gap-2 px-3 py-2 items-center">
                      <div className="text-sm">
                        {i.pillowName} <span className="text-xs text-gray-500">(stock {i.stock})</span>
                      </div>
                      <div className="text-right text-sm">{formatPrice(i.price)}</div>
                      <div className="text-right text-sm font-medium">{i.quantity}</div>
                      <div className="flex justify-end">
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(i.pillowId)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 flex items-center justify-between">
                <div className="text-sm text-gray-500">Total</div>
                <div className="text-lg font-bold">{formatPrice(displayedTotal)} MAD</div>
              </div>

              {canOverrideTotal && (
                <div className="mt-4 grid gap-2">
                  <Label>Manual total</Label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={manualTotal}
                    onChange={(e) => setManualTotal(e.target.value)}
                    placeholder="Optional"
                  />
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} className="bg-matles-600 hover:bg-matles-700">
              {isPending ? "Saving..." : "Create Order"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
