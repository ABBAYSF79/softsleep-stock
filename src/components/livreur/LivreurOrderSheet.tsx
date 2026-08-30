import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { formatPrice, formatVariantDetails, getProductName } from "@/utils/order-utils";
import { BadgeCheck, Barcode, MapPin, MessageSquare, Phone, Printer } from "lucide-react";
import { format } from "date-fns";

interface LivreurOrderSheetProps {
  order: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCall: (phone: string) => void;
  onPrintTicket: (order: any) => void;
  onOpenGuarantee: (order: any) => void;
  onOpenTracking: (code: string) => void;
  onMarkDelivered: (order: any) => void;
  onSaveNote: (orderId: number, note: string) => Promise<void>;
  isMarkingDelivered?: boolean;
  isSavingNote?: boolean;
}

export const LivreurOrderSheet = ({
  order,
  open,
  onOpenChange,
  onCall,
  onPrintTicket,
  onOpenGuarantee,
  onOpenTracking,
  onMarkDelivered,
  onSaveNote,
  isMarkingDelivered,
  isSavingNote,
}: LivreurOrderSheetProps) => {
  const [note, setNote] = useState("");

  useEffect(() => {
    if (order) {
      setNote(order.livreurNote ?? "");
    }
  }, [order]);

  if (!order) return null;

  const phone = order.phone?.trim();
  const items = Array.isArray(order.items) ? order.items : [];
  const pillowItems = Array.isArray(order.pillowItems) ? order.pillowItems : [];
  const noteChanged = note !== (order.livreurNote ?? "");

  const handleSaveNote = async () => {
    await onSaveNote(order.id, note.trim());
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl px-4 pb-8">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center justify-between gap-2 pr-6">
            <span>Commande #{order.id}</span>
            <OrderStatusBadge status={order.status} />
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-5">
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-lg font-semibold text-slate-900">{order.customerName}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-matles-700">
              {formatPrice(order.totalAmount)} MAD
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {format(new Date(order.createdAt), "dd MMM yyyy · HH:mm")}
            </p>
          </div>

          <div className="space-y-3 text-sm">
            {phone && (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-slate-700">
                  <Phone className="h-4 w-4 text-matles-600" />
                  <span className="tabular-nums font-medium">{phone}</span>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={() => onCall(phone)}>
                  Appeler
                </Button>
              </div>
            )}
            <div className="flex items-start gap-2 text-slate-700">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-matles-600" />
              <div>
                <p className="font-medium">{order.city || "—"}</p>
                {order.address && <p className="text-muted-foreground">{order.address}</p>}
                {order.deliveryService?.name && (
                  <p className="mt-1 text-xs text-muted-foreground">{order.deliveryService.name}</p>
                )}
              </div>
            </div>
            {order.trackingCode && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-slate-200 px-3 py-2">
                <div>
                  <p className="text-xs text-muted-foreground">Code suivi</p>
                  <p className="font-mono text-sm font-medium">{order.trackingCode}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onOpenTracking(order.trackingCode)}
                >
                  <Barcode className="mr-1 h-4 w-4" />
                  Voir
                </Button>
              </div>
            )}
          </div>

          {order.note?.trim() && (
            <div className="space-y-1.5 rounded-xl border border-blue-200/80 bg-blue-50/70 p-3">
              <Label className="flex items-center gap-1.5 text-sm font-semibold text-blue-900">
                <MessageSquare className="h-4 w-4 text-blue-600" />
                Note commercial
              </Label>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-blue-900">
                {order.note}
              </p>
            </div>
          )}

          <div className="space-y-2 rounded-xl border border-amber-200/80 bg-amber-50/50 p-3">
            <Label htmlFor="livreur-note" className="flex items-center gap-1.5 text-sm font-semibold text-amber-950">
              <MessageSquare className="h-4 w-4" />
              Note livreur
            </Label>
            <Textarea
              id="livreur-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Remarque, problème de livraison, client absent..."
              className="min-h-[88px] resize-none border-amber-200 bg-white text-base"
            />
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full border-amber-300 bg-white hover:bg-amber-50"
              disabled={!noteChanged || isSavingNote}
              onClick={handleSaveNote}
            >
              {isSavingNote ? "Enregistrement..." : "Enregistrer la note"}
            </Button>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Produits
            </p>
            <ul className="space-y-2 rounded-xl border border-slate-200 p-3">
              {items.map((item: any) => (
                <li key={item.id ?? `${item.variantId}-${item.quantity}`} className="text-sm">
                  <span className="font-medium">{item.quantity}x</span>{" "}
                  {getProductName(item)}{" "}
                  <span className="text-muted-foreground">({formatVariantDetails(item)})</span>
                </li>
              ))}
              {pillowItems.map((item: any) => (
                <li key={item.id ?? item.pillowId} className="text-sm">
                  <span className="font-medium">{item.quantity}x</span>{" "}
                  {item.pillowName || "Accessoire"}
                </li>
              ))}
              {items.length === 0 && pillowItems.length === 0 && (
                <li className="text-sm text-muted-foreground">Aucun détail produit</li>
              )}
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" className="h-11" onClick={() => onPrintTicket(order)}>
              <Printer className="mr-2 h-4 w-4" />
              Ticket
            </Button>
            <Button type="button" variant="outline" className="h-11" onClick={() => onOpenGuarantee(order)}>
              <BadgeCheck className="mr-2 h-4 w-4" />
              Garantie
            </Button>
          </div>

          {order.status === "PENDING" && (
            <Button
              type="button"
              className="h-12 w-full bg-matles-600 text-base font-semibold hover:bg-matles-700"
              disabled={isMarkingDelivered}
              onClick={() => onMarkDelivered(order)}
            >
              {isMarkingDelivered ? "En cours..." : "Marquer comme livré"}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
