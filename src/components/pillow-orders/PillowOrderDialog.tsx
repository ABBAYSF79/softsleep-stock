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
import { useCreatePillowOrder, useDeliveryServices, useInventoryLocations, usePillowStock } from "@/hooks/useApi";
import { useInventoryBalancesQuery, useInventoryMode } from "@/features/inventory/hooks/useInventoryQueries";
import { formatPrice } from "@/utils/order-utils";
import { MapPin, Package, Plus, Trash2, Truck } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

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

const fieldClass =
  "h-10 border-slate-200 bg-white shadow-none focus-visible:ring-matles-500/30 focus-visible:ring-offset-0";

export const PillowOrderDialog = ({ open, onOpenChange }: PillowOrderDialogProps) => {
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [deliveryServiceId, setDeliveryServiceId] = useState<string>("");
  const [locationId, setLocationId] = useState<string>("__none__");
  const [manualTotal, setManualTotal] = useState<string>("");

  const [selectedPillowId, setSelectedPillowId] = useState<string>("");
  const [quantity, setQuantity] = useState(1);
  const [items, setItems] = useState<OrderItemDraft[]>([]);

  const { user } = useAuth();
  const canOverrideTotal = user?.role === "ADMIN" || user?.role === "SALES";
  const { data: pillows = [] } = usePillowStock();
  const { data: deliveryServices = [] } = useDeliveryServices();
  const { data: inventoryLocations = [] } = useInventoryLocations();
  const { data: inventoryModeInfo } = useInventoryMode();
  const selectedLocationNum =
    locationId !== "__none__" ? Number(locationId) : undefined;
  const { data: locationBalances = [] } = useInventoryBalancesQuery(
    selectedLocationNum ? { locationId: selectedLocationNum } : undefined
  );
  const { mutate: createOrder, isPending } = useCreatePillowOrder();
  const inventoryActive =
    inventoryModeInfo?.mode === "INVENTORY" && Boolean(inventoryModeInfo?.initialized);

  useEffect(() => {
    if (!open) return;
    setCustomerName("");
    setPhone("");
    setAddress("");
    setCity("");
    setDeliveryServiceId("");
    setLocationId("__none__");
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

  const locationOptions = useMemo(() => {
    const opts = (inventoryLocations as any[])
      .filter((l) => l && l.active !== false && l.isSellable !== false)
      .slice()
      .sort(
        (a, b) =>
          Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0) ||
          String(a.code || "").localeCompare(String(b.code || ""))
      )
      .map((l) => ({
        label: `${l.name} (${l.code})`,
        value: String(l.id),
      }));
    return [{ label: "No location (legacy)", value: "__none__" }, ...opts];
  }, [inventoryLocations]);

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
    const availByPillow = new Map<number, number>();
    for (const b of locationBalances as Array<{ pillow: { id: number }; available: number }>) {
      availByPillow.set(b.pillow.id, b.available);
    }
    return (pillows as any[])
      .slice()
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
      .map((p) => {
        if (inventoryActive && selectedLocationNum) {
          const available = availByPillow.get(p.id) ?? 0;
          return {
            label: `${p.name} (Disponible: ${available})`,
            value: String(p.id),
            disabled: available <= 0,
          };
        }
        return {
          label: `${p.name} (Stock: ${p.stock ?? 0})`,
          value: String(p.id),
          disabled: (p.stock ?? 0) <= 0,
        };
      });
  }, [pillows, locationBalances, inventoryActive, selectedLocationNum]);

  const total = items.reduce((sum, i) => sum + Number(i.price) * i.quantity, 0);
  const manualTotalNumber =
    canOverrideTotal && manualTotal.trim() !== "" && Number.isFinite(Number(manualTotal))
      ? Number(manualTotal)
      : null;
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
      customerName: customerName.trim() || "Client",
      phone: phone.trim(),
      address: address.trim(),
      city: city.trim(),
      ...(deliveryServiceId ? { deliveryServiceId: Number(deliveryServiceId) } : {}),
      ...(locationId && locationId !== "__none__" ? { locationId: Number(locationId) } : {}),
      items: items.map((i) => ({ pillowId: i.pillowId, quantity: i.quantity })),
    };
    if (canOverrideTotal && manualTotalNumber !== null) payload.totalAmount = manualTotalNumber;

    if (payload.items.length === 0) return;

    createOrder(payload, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[min(92dvh,880px)] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] flex-col gap-0 overflow-hidden rounded-2xl border-slate-200 p-0 shadow-xl",
          "sm:w-[min(92vw,720px)] sm:max-w-[720px]"
        )}
      >
        <DialogHeader className="shrink-0 space-y-1 border-b border-slate-100 px-4 py-4 text-left sm:px-6 sm:py-5">
          <DialogTitle className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
            Create Accessoires Order
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            Commande accessoires séparée — client, livraison et stock.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
            <div className="space-y-5 sm:space-y-6">
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-600">
                    <Truck className="h-3.5 w-3.5" aria-hidden />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-800">Client & livraison</h3>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="po-name" className="text-slate-700">
                      Nom{" "}
                      <span className="font-normal text-slate-400">(optional)</span>
                    </Label>
                    <Input
                      id="po-name"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Client"
                      className={fieldClass}
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="po-phone" className="text-slate-700">
                      Téléphone{" "}
                      <span className="font-normal text-slate-400">(optional)</span>
                    </Label>
                    <Input
                      id="po-phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="06…"
                      className={fieldClass}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-slate-700">
                      Delivery service{" "}
                      <span className="font-normal text-slate-400">(optional)</span>
                    </Label>
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
                  <div className="space-y-1.5">
                    <Label className="text-slate-700">
                      Ville{" "}
                      <span className="font-normal text-slate-400">(optional)</span>
                    </Label>
                    <SearchableSelect
                      value={city}
                      onValueChange={setCity}
                      options={cityOptions}
                      placeholder={deliveryServiceId ? "Select city" : "Choose service first"}
                      searchPlaceholder="Search city..."
                      disabled={!deliveryServiceId}
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-slate-700">
                      Location{" "}
                      <span className="font-normal text-slate-400">
                        (optional — stock fulfillment)
                      </span>
                    </Label>
                    <SearchableSelect
                      value={locationId}
                      onValueChange={setLocationId}
                      options={locationOptions}
                      placeholder="No location (legacy)"
                      searchPlaceholder="Search location..."
                    />
                    <p className="flex items-start gap-1.5 text-xs text-slate-500">
                      <MapPin className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                      Choisissez l’emplacement pour réserver le stock accessoires.
                    </p>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="po-address" className="text-slate-700">
                      Adresse{" "}
                      <span className="font-normal text-slate-400">(optional)</span>
                    </Label>
                    <Textarea
                      id="po-address"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Adresse de livraison"
                      rows={2}
                      className="min-h-[72px] resize-none border-slate-200 shadow-none focus-visible:ring-matles-500/30 focus-visible:ring-offset-0"
                    />
                  </div>
                </div>
              </section>

              <section className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/60">
                <div className="flex items-center gap-2 border-b border-slate-200/80 bg-white/80 px-3 py-2.5 sm:px-4">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-matles-50 text-matles-700 ring-1 ring-inset ring-matles-100">
                    <Package className="h-3.5 w-3.5" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-800">Accessoires</h3>
                    <p className="text-xs text-slate-500">Ajoutez au moins un article</p>
                  </div>
                </div>

                <div className="space-y-3 p-3 sm:p-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_88px_auto] sm:items-end">
                    <div className="space-y-1.5">
                      <Label className="text-slate-700">Accessoire</Label>
                      <SearchableSelect
                        value={selectedPillowId}
                        onValueChange={setSelectedPillowId}
                        options={pillowOptions}
                        placeholder="Select accessoire"
                        searchPlaceholder="Search accessoire..."
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="po-qty" className="text-slate-700">
                        Qty
                      </Label>
                      <Input
                        id="po-qty"
                        type="number"
                        min={1}
                        step={1}
                        value={quantity}
                        onChange={(e) => setQuantity(parseInt(e.target.value || "1", 10))}
                        className={cn(fieldClass, "tabular-nums")}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={addItem}
                      className="h-10 border-slate-200 bg-white text-slate-700 hover:border-matles-300 hover:bg-matles-50 hover:text-matles-800"
                    >
                      <Plus className="mr-1.5 h-4 w-4" aria-hidden />
                      Add
                    </Button>
                  </div>

                  {items.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-white/70 px-3 py-6 text-center text-sm text-slate-500">
                      Aucun accessoire ajouté pour le moment.
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                      <div className="hidden grid-cols-[minmax(0,1fr)_72px_56px_40px] gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-500 sm:grid">
                        <div>Accessoire</div>
                        <div className="text-right">Prix</div>
                        <div className="text-right">Qty</div>
                        <div />
                      </div>
                      <ul className="divide-y divide-slate-100">
                        {items.map((i) => (
                          <li
                            key={i.pillowId}
                            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_72px_56px_40px]"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-800">
                                {i.pillowName}
                              </p>
                              <p className="text-xs text-slate-500 sm:hidden">
                                {formatPrice(i.price)} MAD · qty {i.quantity}
                                <span className="text-slate-400"> · stock {i.stock}</span>
                              </p>
                              <p className="hidden text-xs text-slate-400 sm:block">
                                stock {i.stock}
                              </p>
                            </div>
                            <div className="hidden text-right text-sm tabular-nums text-slate-700 sm:block">
                              {formatPrice(i.price)}
                            </div>
                            <div className="hidden text-right text-sm font-semibold tabular-nums text-slate-900 sm:block">
                              {i.quantity}
                            </div>
                            <div className="flex justify-end">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                onClick={() => removeItem(i.pillowId)}
                                aria-label={`Remove ${i.pillowName}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Total
                      </p>
                      <p className="text-xl font-semibold tabular-nums tracking-tight text-slate-900">
                        {formatPrice(displayedTotal)}{" "}
                        <span className="text-sm font-medium text-slate-500">MAD</span>
                      </p>
                    </div>
                    {canOverrideTotal && (
                      <div className="w-full space-y-1.5 sm:max-w-[200px]">
                        <Label htmlFor="po-manual-total" className="text-slate-700">
                          Manual total
                        </Label>
                        <Input
                          id="po-manual-total"
                          type="number"
                          min={0}
                          step={1}
                          value={manualTotal}
                          onChange={(e) => setManualTotal(e.target.value)}
                          placeholder="Optional"
                          className={cn(fieldClass, "tabular-nums")}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </div>
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-slate-100 bg-white px-4 py-3 sm:flex-row sm:justify-end sm:space-x-0 sm:px-6 sm:py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-10 border-slate-200"
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending || items.length === 0}
              className="h-10 bg-matles-600 hover:bg-matles-700 active:scale-[0.98]"
            >
              {isPending ? "Saving..." : "Create Order"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
