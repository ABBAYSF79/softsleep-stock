import { CheckCircle2, Copy, MapPin, MessageCircle, MessageSquare, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { buildOrderCopyText, formatPrice, openWhatsAppLocationRequest } from "@/utils/order-utils";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface LivreurOrderCardProps {
  order: any;
  onOpen: (order: any) => void;
  onCall: (phone: string) => void;
  onMarkDelivered: (order: any) => void;
  isMarkingDelivered?: boolean;
}

export const LivreurOrderCard = ({
  order,
  onOpen,
  onCall,
  onMarkDelivered,
  isMarkingDelivered,
}: LivreurOrderCardProps) => {
  const phone = order.phone?.trim();
  const isPending = order.status === "PENDING";
  const isDelivered = order.status === "DELIVERED";

  const handleWhatsAppLocation = () => {
    if (!phone) {
      toast.error("Numéro client manquant");
      return;
    }
    if (!openWhatsAppLocationRequest(phone)) {
      toast.error("Numéro client invalide pour WhatsApp");
    }
  };

  const handleCopyOrder = async () => {
    const text = buildOrderCopyText(order);
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Commande copiée");
    } catch {
      toast.error("Impossible de copier");
    }
  };

  return (
    <Card
      className={cn(
        "overflow-hidden shadow-sm transition-shadow active:shadow-md",
        isDelivered
          ? "border-emerald-300/90 bg-gradient-to-b from-emerald-50/90 to-green-50/40"
          : "border-slate-200/90 bg-white"
      )}
      onClick={() => onOpen(order)}
    >
      <CardContent className="p-0">
        <div
          className={cn(
            "flex items-start justify-between gap-2 border-b px-4 py-3",
            isDelivered
              ? "border-emerald-200/80 bg-emerald-100/70"
              : "border-slate-100 bg-slate-50/80"
          )}
        >
          <div>
            <p
              className={cn(
                "text-xs font-medium uppercase tracking-wide",
                isDelivered ? "text-emerald-700" : "text-muted-foreground"
              )}
            >
              Commande
            </p>
            <p
              className={cn(
                "text-lg font-bold tabular-nums",
                isDelivered ? "text-emerald-800" : "text-matles-700"
              )}
            >
              #{order.id}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {isDelivered && <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />}
            <OrderStatusBadge status={order.status} />
          </div>
        </div>

        <div className="space-y-3 px-4 py-3">
          <div>
            <p className="text-base font-semibold text-slate-900">{order.customerName}</p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-800">
              {formatPrice(order.totalAmount)} <span className="text-sm font-medium text-muted-foreground">MAD</span>
            </p>
          </div>

          <div className="space-y-1.5 text-sm text-slate-600">
            {phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 shrink-0 text-matles-600" />
                <span className="tabular-nums">{phone}</span>
              </div>
            )}
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-matles-600" />
              <div>
                <p className="font-medium text-slate-800">{order.city || "—"}</p>
                {order.address && (
                  <p className="text-xs leading-relaxed text-muted-foreground">{order.address}</p>
                )}
              </div>
            </div>
            {order.deliveryService?.name && (
              <p className="text-xs text-muted-foreground">{order.deliveryService.name}</p>
            )}
            {order.note?.trim() && (
              <div className="flex items-start gap-1.5 rounded-lg bg-blue-50 px-2 py-1.5 text-xs text-blue-900">
                <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
                <p className="line-clamp-2">
                  <span className="font-semibold text-blue-700">Note commercial: </span>
                  {order.note}
                </p>
              </div>
            )}
            {order.livreurNote?.trim() && (
              <div className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <p className="line-clamp-2">{order.livreurNote}</p>
              </div>
            )}
          </div>

          <div
            className="grid grid-cols-3 gap-1.5 pt-1"
            onClick={(e) => e.stopPropagation()}
          >
            {phone && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-11 flex-col gap-0.5 px-1 text-[10px]"
                onClick={() => onCall(phone)}
              >
                <Phone className="h-4 w-4" />
                Appeler
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-11 flex-col gap-0.5 px-1 text-[10px] text-[#25D366] hover:text-[#1ebe57]"
              disabled={!phone}
              onClick={handleWhatsAppLocation}
            >
              <MessageCircle className="h-4 w-4" />
              Localisation
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-11 flex-col gap-0.5 px-1 text-[10px]"
              onClick={handleCopyOrder}
            >
              <Copy className="h-4 w-4" />
              Copier
            </Button>
          </div>

          {isPending && (
            <Button
              type="button"
              className="h-12 w-full bg-matles-600 text-base font-semibold hover:bg-matles-700"
              disabled={isMarkingDelivered}
              onClick={(e) => {
                e.stopPropagation();
                onMarkDelivered(order);
              }}
            >
              {isMarkingDelivered ? "En cours..." : "Marquer comme livré"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
