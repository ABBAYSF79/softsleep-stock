import { useEffect, useState } from "react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ORDER_STATUSES, formatPrice } from "@/utils/order-utils";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { useUpdatePillowOrderPaymentStatus } from "@/hooks/useApi";
import { Printer } from "lucide-react";

interface PillowOrderPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any | null;
  onStatusChange: (status: string) => void;
  onOpenTicket?: (order: any) => void;
  statusBusy?: boolean;
}

export const PillowOrderPreviewDialog = ({
  open,
  onOpenChange,
  order,
  onStatusChange,
  onOpenTicket,
  statusBusy,
}: PillowOrderPreviewDialogProps) => {
  if (!order) return null;
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const { mutate: updatePayment, isPending: isPaymentPending } = useUpdatePillowOrderPaymentStatus();
  const [localOrder, setLocalOrder] = useState<any>(order);

  useEffect(() => {
    setLocalOrder(order);
  }, [order]);

  const statusKey = localOrder.status as keyof typeof ORDER_STATUSES;
  const statusConfig = (ORDER_STATUSES as any)[statusKey];
  const badgeClass = statusConfig?.color || "";
  const badgeLabel = statusConfig?.label || localOrder.status;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px]">
        <DialogHeader>
          <DialogTitle className="pr-10">
            <div className="flex items-center gap-3 min-w-0">
              <div className="truncate">Accessoires Order #{localOrder.id}</div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" disabled={statusBusy} className="shrink-0">
                    <Badge className={badgeClass}>{badgeLabel}</Badge>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {Object.values(ORDER_STATUSES).map((s) => (
                    <DropdownMenuItem
                      key={s.value}
                      onSelect={() => {
                        setLocalOrder((prev: any) => ({ ...prev, status: s.value }));
                        onStatusChange(s.value);
                      }}
                    >
                      {s.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="flex items-center gap-2 shrink-0">
                <Badge className={localOrder.isPaid ? "bg-green-100 text-green-800 hover:bg-green-100" : "bg-gray-100 text-gray-800 hover:bg-gray-100"}>
                  {localOrder.isPaid ? "Paid" : "Not Paid"}
                </Badge>
                {isAdmin && (
                  <Switch
                    checked={Boolean(localOrder.isPaid)}
                    disabled={isPaymentPending}
                    onCheckedChange={(checked) =>
                      updatePayment(
                        { id: localOrder.id, isPaid: checked },
                        { onSuccess: () => setLocalOrder((prev: any) => ({ ...prev, isPaid: checked })) }
                      )
                    }
                  />
                )}
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="text-sm text-gray-500">Customer</div>
            <div className="font-medium">{localOrder.customerName}</div>
            <div className="text-sm text-gray-500">Phone</div>
            <div className="font-medium">{localOrder.phone || "-"}</div>
            <div className="text-sm text-gray-500">Address</div>
            <div className="font-medium whitespace-pre-wrap">{localOrder.address || "-"}</div>
          </div>
          <div className="space-y-3">
            <div className="text-sm text-gray-500">City</div>
            <div className="font-medium">{localOrder.city || "-"}</div>
            <div className="text-sm text-gray-500">Delivery Service</div>
            <div className="font-medium">{localOrder.deliveryService?.name || "-"}</div>
            <div className="text-sm text-gray-500">Created</div>
            <div className="font-medium">
              {localOrder.createdAt ? format(new Date(localOrder.createdAt), "dd/MM/yy HH:mm") : "-"}
            </div>
          </div>
        </div>

        <div className="mt-6 border rounded-md overflow-hidden">
          <div className="grid grid-cols-[1fr_120px_120px] gap-2 px-3 py-2 text-xs text-gray-500 bg-gray-50">
            <div>Accessoire</div>
            <div className="text-right">Price</div>
            <div className="text-right">Qty</div>
          </div>
          {(localOrder.items || []).map((i: any) => (
            <div key={i.id} className="grid grid-cols-[1fr_120px_120px] gap-2 px-3 py-2 items-center">
              <div className="text-sm">{i.pillowName}</div>
              <div className="text-right text-sm">{formatPrice(i.price)}</div>
              <div className="text-right text-sm font-medium">{i.quantity}</div>
            </div>
          ))}
          <div className="flex items-center justify-between px-3 py-3 border-t bg-white">
            <div className="text-sm text-gray-500">Total</div>
            <div className="text-lg font-bold">{formatPrice(localOrder.totalAmount)} MAD</div>
          </div>
        </div>
        {onOpenTicket && (
          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => onOpenTicket(localOrder)}
            >
              <Printer className="h-4 w-4" />
              Ticket PDF / Print
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};
