import { useState, useEffect, useMemo, type ReactNode } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  OrderStatusUpdate,
  useCreateOrder,
  useDeliveryServices,
  useInventoryLocations,
  usePillowStock,
  useProducts,
  useUpdateOrderDelivery,
  useUpdateOrderStatus,
} from "@/hooks/useApi";
import { useInventoryMode } from "@/features/inventory/hooks/useInventoryQueries";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  CalendarDays,
  Car,
  MapPin,
  MessageSquare,
  Package,
  Plus,
  Trash2,
  Truck,
  UserRound,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { ORDER_STATUSES, formatPrice, generateAmanaTrackingCode, sanitizePhoneInput, validatePhone } from "@/utils/order-utils";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const fieldClass =
  "h-10 border-slate-200 bg-white shadow-none focus-visible:ring-matles-500/30 focus-visible:ring-offset-0";

const fieldDisabledClass =
  "h-10 border-slate-200 bg-slate-50 text-slate-700 shadow-none disabled:cursor-default disabled:opacity-100";

function InfoField({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <div className="min-h-[28px] text-sm font-medium text-slate-900 break-words">
        {value || <span className="font-normal text-slate-400">—</span>}
      </div>
    </div>
  );
}

interface OrderManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order?: any;
  onStatusUpdate?: (orderId: number, status: string) => void;
}

interface ConfirmationUser {
  id: number;
  name: string;
  phone?: string;
  email?: string;
  active: boolean;
  linkedSalesUser?: {
    id: number;
    name: string;
    email: string;
  };
}

export const OrderManagementDialog = ({
  open,
  onOpenChange,
  order,
  onStatusUpdate,
}: OrderManagementDialogProps) => {
  const isViewing = !!order;
  const [status, setStatus] = useState(order?.status || "PENDING");
  const [originalStatus, setOriginalStatus] = useState(order?.status || "PENDING");
  const [customerName, setCustomerName] = useState("");
  const [selectedVariant, setSelectedVariant] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [selectedPillowId, setSelectedPillowId] = useState<string>("");
  const [pillowQty, setPillowQty] = useState(1);
  const [pillowItems, setPillowItems] = useState<any[]>([]);
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [manualTotal, setManualTotal] = useState<number | null>(null);
  const [selectedDeliveryService, setSelectedDeliveryService] = useState<string>("");
  const [selectedCity, setSelectedCity] = useState<string>("");
  const [locationId, setLocationId] = useState<string>("__none__");
  const [selectedConfirmationUser, setSelectedConfirmationUser] = useState<string>("none");
  const [note, setNote] = useState<string>("");
  const [trackingCode, setTrackingCode] = useState<string>("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [deliveryChanged, setDeliveryChanged] = useState(false);
  const [lowStockWarning, setLowStockWarning] = useState<string | null>(null);

  const { user } = useAuth();
  const { data: products } = useProducts();
  const { data: deliveryServices } = useDeliveryServices();
  const { data: pillows } = usePillowStock();
  const { data: inventoryLocations = [] } = useInventoryLocations();
  const { data: inventoryModeInfo } = useInventoryMode();
  const createOrder = useCreateOrder();
  const updateOrderStatus = useUpdateOrderStatus();
  const updateOrderDelivery = useUpdateOrderDelivery();
  const queryClient = useQueryClient();

  const inventoryActive =
    inventoryModeInfo?.mode === "INVENTORY" && Boolean(inventoryModeInfo?.initialized);

  const isAdmin = user?.role === "ADMIN";
  const isLivreur = user?.role === "LIVREUR";
  const isSuivi = user?.role === "SUIVI";
  const canOverrideTotal =
    user?.role === "ADMIN" || user?.role === "SALES" || user?.role === "SUIVI";
  const canEditTrackingCode = isViewing && (isAdmin || isSuivi) && status === "IN_PROCESS";
  const canLivreurMarkDelivered = isViewing && isLivreur && originalStatus === "PENDING";
  const canSuiviUpdateStatus =
    isViewing && isSuivi && (originalStatus === "PENDING" || originalStatus === "IN_PROCESS");
  const savedLivreurNote = (order?.livreurNote ?? "").trim();
  const savedSalesNote = (order?.note ?? "").trim();
  const canEditSalesNote =
    !isLivreur &&
    (isAdmin ||
      user?.role === "SALES" ||
      (isSuivi && (originalStatus === "PENDING" || originalStatus === "IN_PROCESS")));
  const showLivreurNoteSection =
    isViewing && !isLivreur && (isAdmin || user?.role === "SALES" || isSuivi);

  const { data: confirmationUsers = [] } = useQuery<ConfirmationUser[]>({
    queryKey: ["confirmationUsers", user?.role],
    queryFn: async () => {
      const { data } = await api.get(
        user?.role === "ADMIN" || user?.role === "SUIVI"
          ? "/confirmation-users"
          : "/confirmation-users/my-team"
      );
      return data || [];
    },
    enabled: !order,
  });

  useEffect(() => {
    if (!open) return;

    if (order) {
      setStatus(order.status);
      setOriginalStatus(order.status);
      setCustomerName(order.customerName);
      setOrderItems(
        order.items.map((item: any) => ({
          variantId: item.variantId,
          quantity: item.quantity,
          price: item.price,
          product: item.product,
          variant: item.variant,
        }))
      );
      setPillowItems(
        Array.isArray(order.pillowItems)
          ? order.pillowItems.map((pi: any) => ({
              pillowId: pi.pillowId,
              pillowName: pi.pillowName,
              quantity: pi.quantity,
              price: pi.price,
            }))
          : []
      );
      setAddress(order.address || "");
      setPhone(order.phone || "");
      setSelectedDeliveryService(order.deliveryServiceId?.toString() || "");
      setSelectedCity(order.city || "");
      setLocationId(order.locationId ? String(order.locationId) : "__none__");
      setSelectedConfirmationUser(order.confirmationUserId?.toString() || "none");
      setNote(order.note || "");
      setTrackingCode(order.trackingCode || "");
      setManualTotal(order.totalAmount !== undefined && order.totalAmount !== null ? parseFloat(String(order.totalAmount)) : null);
    } else {
      setStatus("PENDING");
      setOriginalStatus("PENDING");
      setCustomerName("");
      setOrderItems([]);
      setSelectedPillowId("");
      setPillowQty(1);
      setPillowItems([]);
      setAddress("");
      setPhone("");
      setSelectedDeliveryService("");
      setSelectedCity("");
      setLocationId("__none__");
      setSelectedConfirmationUser("none");
      setNote("");
      setTrackingCode("");
      setLowStockWarning(null);
      setSelectedVariant("");
      setQuantity(1);
      setManualTotal(null);
      setPhoneError(null);
    }
  }, [order, open]);

  // When inventory mode is on, default to Warehouse (WH-MAIN) for new orders.
  useEffect(() => {
    if (!open || order || !inventoryActive) return;
    if (locationId !== "__none__") return;
    const sellable = (inventoryLocations as any[]).filter(
      (l) => l && l.active !== false && l.isSellable !== false
    );
    const preferred =
      sellable.find((l) => String(l.code).toUpperCase() === "WH-MAIN") ||
      sellable.find((l) => String(l.type).toUpperCase() === "WAREHOUSE") ||
      sellable
        .slice()
        .sort(
          (a, b) =>
            Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0) ||
            String(a.code || "").localeCompare(String(b.code || ""))
        )[0];
    if (preferred?.id) setLocationId(String(preferred.id));
  }, [open, order, inventoryActive, inventoryLocations, locationId]);

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
    if (inventoryActive) return opts;
    return [{ label: "No location (legacy)", value: "__none__" }, ...opts];
  }, [inventoryLocations, inventoryActive]);

  const handlePhoneChange = (value: string) => {
    const sanitized = sanitizePhoneInput(value);
    setPhone(sanitized);
    if (phoneError) {
      const result = validatePhone(sanitized);
      setPhoneError(result.valid ? null : result.message ?? null);
    }
  };

  const handlePhoneBlur = () => {
    if (!phone.trim()) {
      setPhoneError(null);
      return;
    }
    const result = validatePhone(phone);
    setPhoneError(result.valid ? null : result.message ?? null);
  };

  useEffect(() => {
    if (isViewing && order) {
      const changed =
        selectedDeliveryService !== (order.deliveryServiceId?.toString() || "") ||
        selectedCity !== (order.city || "");
      setDeliveryChanged(changed);
    } else {
      setDeliveryChanged(false);
    }
  }, [isViewing, order, selectedDeliveryService, selectedCity]);

  const selectedServiceCities =
    deliveryServices?.find((service: any) => service.id.toString() === selectedDeliveryService)?.cities || [];

  const selectableDeliveryServices = useMemo(() => {
    let services =
      deliveryServices?.filter(
        (service: any) =>
          service.active !== false || service.id.toString() === selectedDeliveryService
      ) ?? [];

    if (isSuivi && user?.deliveryServiceIds?.length) {
      services = services.filter((service: any) => user.deliveryServiceIds!.includes(service.id));
    }

    return services;
  }, [deliveryServices, selectedDeliveryService, isSuivi, user?.deliveryServiceIds]);

  const deliveryServiceName = isViewing
    ? deliveryServices?.find((service: any) => service.id.toString() === order?.deliveryServiceId?.toString())?.name
    : deliveryServices?.find((service: any) => service.id.toString() === selectedDeliveryService)?.name;

  const handleStatusChange = (newStatus: string) => {
    setStatus(newStatus);
  };

  const checkStockLevel = (variantId: string) => {
    if (!products) return;

    let selected: any = null;
    let productName = "";

    products.forEach((product: any) => {
      product.variants.forEach((variant: any) => {
        if (variant.id.toString() === variantId) {
          selected = variant;
          productName = product.name;
        }
      });
    });

    if (selected && selected.stock <= 1) {
      if (selected.stock === 0) {
        setLowStockWarning(
          `🚫 Out of stock: ${productName} - ${selected.name} is currently out of stock. Please select a different product.`
        );
      } else {
        setLowStockWarning(
          `⚠️ Low stock warning: ${productName} - ${selected.name} has only ${selected.stock} item(s) left in stock. Consider choosing another product to avoid stock issues.`
        );
      }
    } else {
      setLowStockWarning(null);
    }
  };

  const handleAddItem = () => {
    if (!selectedVariant) {
      toast.error("Please select a product variant");
      return;
    }

    if (quantity < 1) {
      toast.error("Quantity must be at least 1");
      return;
    }

    let variantInfo: any = null;
    let productInfo: any = null;

    products?.forEach((product: any) => {
      product.variants.forEach((variant: any) => {
        if (variant.id.toString() === selectedVariant) {
          variantInfo = variant;
          productInfo = product;
        }
      });
    });

    if (!variantInfo) return;

    if (variantInfo.stock === 0) {
      toast.error("This product variant is out of stock");
      return;
    }

    const newItem = {
      variantId: variantInfo.id,
      quantity: quantity,
      price: parseFloat(variantInfo.price.toString()),
      variant: variantInfo,
      product: productInfo,
    };

    setOrderItems([...orderItems, newItem]);
    setSelectedVariant("");
    setQuantity(1);
    setLowStockWarning(null);
  };

  const handleRemoveItem = (index: number) => {
    const newItems = orderItems.filter((_: any, i: number) => i !== index);
    setOrderItems(newItems);
  };

  const handleAddPillow = () => {
    const pillowId = Number(selectedPillowId);
    if (!Number.isInteger(pillowId) || pillowId <= 0) return;
    if (!Number.isInteger(pillowQty) || pillowQty <= 0) return;

    const pillow = (pillows as any[])?.find((p: any) => Number(p.id) === pillowId);
    if (!pillow) return;

    setPillowItems((prev) => {
      const next = prev.slice();
      const idx = next.findIndex((x) => Number(x.pillowId) === pillowId);
      const existingQty = idx >= 0 ? Number(next[idx].quantity || 0) : 0;
      const newQty = existingQty + pillowQty;

      if (newQty > Number(pillow.stock || 0)) {
        toast.error("Insufficient pillow stock");
        return prev;
      }

      const row = {
        pillowId,
        pillowName: pillow.name,
        quantity: newQty,
        price: pillow.price,
      };

      if (idx >= 0) next[idx] = row;
      else next.push(row);

      return next;
    });

    setSelectedPillowId("");
    setPillowQty(1);
  };

  const handleRemovePillow = (pillowId: number) => {
    setPillowItems((prev) => prev.filter((x) => Number(x.pillowId) !== Number(pillowId)));
  };

  const calculateTotal = () => {
    return orderItems.reduce((sum: number, item: any) => {
      const price = typeof item.price === "object" ? parseFloat(item.price.toString()) : item.price;
      return sum + price * item.quantity;
    }, 0);
  };

  const calculatePillowTotal = () => {
    return pillowItems.reduce((sum: number, item: any) => {
      const price = typeof item.price === "object" ? parseFloat(item.price.toString()) : item.price;
      return sum + price * Number(item.quantity ?? 0);
    }, 0);
  };

  const calculateGrandTotal = () => {
    return calculateTotal() + calculatePillowTotal();
  };

  const calculateCommission = (total: number) => {
    return total * 0.1;
  };

  const manualTotalNumber = canOverrideTotal
    ? manualTotal === null
      ? null
      : Number.isFinite(parseFloat(String(manualTotal)))
        ? parseFloat(String(manualTotal))
        : null
    : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isViewing) {
      if (isLivreur) {
        if (status !== "DELIVERED" || originalStatus !== "PENDING") {
          toast.error("Livreur can only mark pending orders as delivered");
          return;
        }

        try {
          await updateOrderStatus.mutateAsync({
            id: order!.id,
            status: "DELIVERED",
          });
          toast.success("Order marked as delivered");
          onOpenChange(false);
          queryClient.invalidateQueries({ queryKey: ["orders"] });
        } catch (error: any) {
          toast.error(error.response?.data?.error || "Failed to update order");
        }
        return;
      }

      if (status === "IN_PROCESS" && !trackingCode.trim()) {
        toast.error("Tracking code is required when status is In Process");
        return;
      }

      const changed =
        !isSuivi &&
        (selectedDeliveryService !== (order.deliveryServiceId?.toString() || "") ||
          selectedCity !== (order.city || ""));
      if (changed) {
        try {
          await updateOrderDelivery.mutateAsync({
            id: order.id,
            deliveryServiceId: selectedDeliveryService,
            city: selectedCity,
          });
          toast.success("Order delivery service/city updated successfully");
          onOpenChange(false);
          queryClient.invalidateQueries({ queryKey: ["orders"] });
          return;
        } catch {
          toast.error("Failed to update delivery service/city");
          return;
        }
      }

      if (status === originalStatus && note === order?.note && trackingCode === order?.trackingCode) {
        toast.info("No changes were made");
        onOpenChange(false);
        return;
      }

      try {
        const updateData: OrderStatusUpdate = {
          id: order!.id,
          status: status,
          note: note || undefined,
          trackingCode: trackingCode || undefined,
        };

        if (status === originalStatus) {
          delete (updateData as any).status;
        }

        await updateOrderStatus.mutateAsync(updateData);

        if (status !== originalStatus && onStatusUpdate) {
          onStatusUpdate(order.id, status);
        }

        toast.success("Order updated successfully");
        onOpenChange(false);
        queryClient.invalidateQueries({ queryKey: ["orders"] });
      } catch (error: any) {
        toast.error(error.response?.data?.error || "Failed to update order");
      }
    } else {
      if (!customerName) {
        toast.error("Please enter customer name");
        return;
      }

      const phoneValidation = validatePhone(phone);
      if (!phoneValidation.valid) {
        setPhoneError(phoneValidation.message ?? "Invalid phone number");
        toast.error(phoneValidation.message ?? "Invalid phone number");
        return;
      }
      setPhoneError(null);

      if (orderItems.length === 0) {
        toast.error("Please add at least one item to the order");
        return;
      }

      if (!selectedDeliveryService) {
        toast.error("Please select a delivery service");
        return;
      }

      if (!selectedCity) {
        toast.error("Please select a delivery city");
        return;
      }

      if (inventoryActive && pillowItems.length > 0 && (locationId === "__none__" || !locationId)) {
        toast.error("Select a fulfillment location for accessories (inventory mode)");
        return;
      }

      try {
        const orderData: Record<string, unknown> = {
          customerName,
          address,
          phone: phone.trim(),
          city: selectedCity,
          deliveryServiceId: parseInt(selectedDeliveryService),
          items: orderItems.map((item: any) => ({
            variantId: item.variantId,
            quantity: item.quantity,
          })),
          pillowItems: pillowItems.map((pi: any) => ({
            pillowId: pi.pillowId,
            quantity: pi.quantity,
          })),
          confirmationUserId:
            selectedConfirmationUser === "none" ? null : parseInt(selectedConfirmationUser),
          note,
          status: "PENDING",
          trackingCode: undefined,
          ...(locationId && locationId !== "__none__"
            ? { locationId: Number(locationId) }
            : {}),
        };

        if (manualTotalNumber !== null) {
          orderData.totalAmount = manualTotalNumber;
        }

        await createOrder.mutateAsync(orderData);
        onOpenChange(false);
        queryClient.invalidateQueries({ queryKey: ["orders"] });
      } catch (error: any) {
        toast.error(error.response?.data?.error || "Failed to create order");
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[min(92dvh,920px)] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] flex-col gap-0 overflow-hidden rounded-2xl border-slate-200 p-0 shadow-xl",
          isViewing
            ? "sm:w-[min(94vw,1100px)] sm:max-w-[1100px]"
            : "sm:w-[min(94vw,920px)] sm:max-w-[920px]"
        )}
      >
        <DialogHeader className="shrink-0 space-y-1 border-b border-slate-100 px-4 py-4 pr-12 text-left sm:px-6 sm:py-5">
          <DialogTitle className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
            {isViewing ? `Order #${order.id}` : "Create New Order"}
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            {isViewing
              ? "Détails structurés — client, livraison, articles."
              : "Client, livraison, produits et accessoires."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 sm:px-6">
          {isViewing ? (
          <div className="space-y-5 py-4 sm:space-y-6 sm:py-5">
            <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
              <div className="flex flex-wrap items-center gap-2">
                <OrderStatusBadge status={status} />
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                  {order?.createdAt
                    ? format(new Date(order.createdAt), "dd MMM yyyy · HH:mm")
                    : "—"}
                </span>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Total
                </p>
                <p className="text-lg font-semibold tabular-nums tracking-tight text-slate-900">
                  MAD {formatPrice(manualTotalNumber ?? calculateGrandTotal())}
                </p>
              </div>
            </div>

            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-600">
                  <UserRound className="h-3.5 w-3.5" aria-hidden />
                </div>
                <h3 className="text-sm font-semibold text-slate-800">Client</h3>
              </div>
              <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2 sm:gap-5 sm:p-4">
                <InfoField label="Customer" value={customerName} />
                <InfoField label="Phone" value={phone} />
                <InfoField label="Address" value={address} className="sm:col-span-2" />
                <InfoField label="Sales person" value={order?.user?.name} />
                <InfoField
                  label="Confirmation user"
                  value={
                    order?.confirmationUser?.name
                      ? `${order.confirmationUser.name}${
                          order.confirmationUser.phone
                            ? ` (${order.confirmationUser.phone})`
                            : ""
                        }`
                      : null
                  }
                />
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-600">
                  <Truck className="h-3.5 w-3.5" aria-hidden />
                </div>
                <h3 className="text-sm font-semibold text-slate-800">Livraison & statut</h3>
              </div>

              <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-slate-700">Status</Label>
                      {isAdmin ? (
                        <Select value={status} onValueChange={handleStatusChange}>
                          <SelectTrigger className={fieldClass}>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.values(ORDER_STATUSES)
                              .filter((s) => {
                                // PENDING has no stock reservation — cannot return
                                if (
                                  originalStatus === "PENDING" &&
                                  s.value === "RETURNED"
                                ) {
                                  return false;
                                }
                                return true;
                              })
                              .map((s) => (
                              <SelectItem key={s.value} value={s.value}>
                                {s.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : canLivreurMarkDelivered ? (
                      <Select value={status} onValueChange={handleStatusChange}>
                        <SelectTrigger className={fieldClass}>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PENDING">Pending</SelectItem>
                          <SelectItem value="DELIVERED">Delivered</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : canSuiviUpdateStatus ? (
                      <Select value={status} onValueChange={handleStatusChange}>
                        <SelectTrigger className={fieldClass}>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          {originalStatus === "PENDING" && (
                            <>
                              <SelectItem value="PENDING">Pending</SelectItem>
                              <SelectItem value="IN_PROCESS">In Process</SelectItem>
                              <SelectItem value="DELIVERED">Delivered</SelectItem>
                            </>
                          )}
                          {originalStatus === "IN_PROCESS" && (
                            <>
                              <SelectItem value="IN_PROCESS">In Process</SelectItem>
                              <SelectItem value="DELIVERED">Delivered</SelectItem>
                              <SelectItem value="RETURNED">Returned</SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex h-10 items-center">
                        <OrderStatusBadge status={status} />
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      className={cn(
                        "text-slate-700",
                        status === "IN_PROCESS" &&
                          !trackingCode &&
                          "flex items-center gap-2 text-red-600"
                      )}
                    >
                      Tracking code
                      {status === "IN_PROCESS" && !trackingCode && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-normal text-red-600 animate-pulse">
                          <AlertTriangle className="h-3 w-3" />
                          Required
                        </span>
                      )}
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        value={trackingCode}
                        onChange={(e) => setTrackingCode(e.target.value)}
                        placeholder="Tracking code"
                        disabled={!canEditTrackingCode}
                        className={cn(
                          canEditTrackingCode ? fieldClass : fieldDisabledClass,
                          status === "IN_PROCESS" &&
                            !trackingCode &&
                            "border-red-300 bg-red-50/30 focus-visible:ring-red-500/40"
                        )}
                      />
                      {canEditTrackingCode && order?.id != null && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-10 w-10 shrink-0 border-slate-200"
                              onClick={() => {
                                const code = generateAmanaTrackingCode(order.id);
                                setTrackingCode(code);
                                toast.success(`Tracking code generated: ${code}`);
                              }}
                              aria-label="Generate Amana tracking code"
                            >
                              <Car className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Generate Amana tracking code</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="deliveryService" className="text-slate-700">
                      Delivery service
                    </Label>
                    {isAdmin ? (
                      <SearchableSelect
                        value={selectedDeliveryService}
                        onValueChange={(value) => {
                          setSelectedDeliveryService(value);
                          setSelectedCity("");
                        }}
                        options={selectableDeliveryServices.map((service: any) => ({
                          label: service.name,
                          value: service.id.toString(),
                        }))}
                        placeholder="Select delivery service"
                        searchPlaceholder="Search service..."
                      />
                    ) : (
                      <Input
                        value={deliveryServiceName || ""}
                        readOnly
                        className={fieldDisabledClass}
                      />
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-slate-700">Delivery city</Label>
                    <SearchableSelect
                      value={selectedCity}
                      onValueChange={setSelectedCity}
                      options={
                        selectedServiceCities.map((city: string) => ({
                          label: city,
                          value: city,
                        })) || []
                      }
                      placeholder="Select city"
                      searchPlaceholder="Search city..."
                      disabled={!isAdmin}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 sm:gap-4">
                  {showLivreurNoteSection && (
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label className="flex items-center gap-1.5 text-amber-950">
                        <MessageSquare className="h-4 w-4" />
                        Note livreur
                      </Label>
                      {savedLivreurNote ? (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm whitespace-pre-wrap text-amber-900">
                          {savedLivreurNote}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2.5 text-sm text-slate-400">
                          —
                        </div>
                      )}
                    </div>
                  )}

                  {canEditSalesNote ? (
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label className="text-slate-700">Note sales</Label>
                      <Input
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Note de l'équipe commerciale"
                        className={fieldClass}
                      />
                    </div>
                  ) : (
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label className="text-slate-700">Note sales</Label>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm whitespace-pre-wrap text-slate-800">
                        {savedSalesNote || "—"}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/60">
              <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 bg-white/80 px-3 py-2.5 sm:px-4">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-matles-50 text-matles-700 ring-1 ring-inset ring-matles-100">
                    <Package className="h-3.5 w-3.5" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-800">Articles</h3>
                    <p className="text-xs text-slate-500">Produits et accessoires</p>
                  </div>
                </div>
                <Badge variant="secondary" className="shrink-0 tabular-nums">
                  {orderItems.length + pillowItems.length}
                </Badge>
              </div>

              <div className="space-y-3 p-3 sm:p-4">
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <div className="hidden grid-cols-[minmax(0,1fr)_56px_88px_96px] gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-500 sm:grid">
                    <div>Produit</div>
                    <div className="text-right">Qty</div>
                    <div className="text-right">Prix</div>
                    <div className="text-right">Total</div>
                  </div>
                  {orderItems.length ? (
                    <ul className="divide-y divide-slate-100">
                      {orderItems.map((it: any, idx: number) => {
                        const unit =
                          typeof it?.price === "object"
                            ? parseFloat(String(it.price?.toString?.() ?? 0))
                            : Number(it?.price ?? 0);
                        const qty = Number(it?.quantity ?? 0);
                        const lineTotal = unit * qty;
                        const productName =
                          it?.product?.name ||
                          it?.variant?.product?.name ||
                          it?.productName ||
                          "-";
                        const variantLabel = it?.variant?.name || "-";

                        return (
                          <li
                            key={`${it?.variantId ?? "v"}-${idx}`}
                            className="grid grid-cols-1 gap-1 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_56px_88px_96px] sm:items-center sm:gap-2"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-800">
                                {productName}
                              </p>
                              <p className="truncate text-xs text-slate-500">{variantLabel}</p>
                              <p className="text-xs text-slate-500 sm:hidden">
                                qty {qty} · MAD {formatPrice(unit)} · MAD {formatPrice(lineTotal)}
                              </p>
                            </div>
                            <div className="hidden text-right text-sm tabular-nums text-slate-700 sm:block">
                              {qty}
                            </div>
                            <div className="hidden text-right text-sm tabular-nums text-slate-700 sm:block">
                              {formatPrice(unit)}
                            </div>
                            <div className="hidden text-right text-sm font-semibold tabular-nums text-slate-900 sm:block">
                              {formatPrice(lineTotal)}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className="px-3 py-6 text-center text-sm text-slate-500">
                      No products
                    </div>
                  )}
                </div>

                {pillowItems.length > 0 && (
                  <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                    <div className="hidden grid-cols-[minmax(0,1fr)_56px_88px_96px] gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-500 sm:grid">
                      <div>Accessoire</div>
                      <div className="text-right">Qty</div>
                      <div className="text-right">Prix</div>
                      <div className="text-right">Total</div>
                    </div>
                    <ul className="divide-y divide-slate-100">
                      {pillowItems.map((pi: any, idx: number) => {
                        const unit =
                          typeof pi?.price === "object"
                            ? parseFloat(String(pi.price?.toString?.() ?? 0))
                            : Number(pi?.price ?? 0);
                        const qty = Number(pi?.quantity ?? 0);
                        const lineTotal = unit * qty;
                        return (
                          <li
                            key={`${pi?.pillowId ?? "p"}-${idx}`}
                            className="grid grid-cols-1 gap-1 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_56px_88px_96px] sm:items-center sm:gap-2"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-800">
                                {pi?.pillowName || "-"}
                              </p>
                              <p className="text-xs text-slate-500">Supplement</p>
                              <p className="text-xs text-slate-500 sm:hidden">
                                qty {qty} · MAD {formatPrice(unit)} · MAD {formatPrice(lineTotal)}
                              </p>
                            </div>
                            <div className="hidden text-right text-sm tabular-nums text-slate-700 sm:block">
                              {qty}
                            </div>
                            <div className="hidden text-right text-sm tabular-nums text-slate-700 sm:block">
                              {formatPrice(unit)}
                            </div>
                            <div className="hidden text-right text-sm font-semibold tabular-nums text-slate-900 sm:block">
                              {formatPrice(lineTotal)}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-3 sm:px-4">
                  <span className="text-sm font-medium text-slate-600">Order total</span>
                  <span className="text-base font-semibold tabular-nums text-slate-900">
                    MAD {formatPrice(manualTotalNumber ?? calculateGrandTotal())}
                  </span>
                </div>
              </div>
            </section>
          </div>
        ) : (
          <div className="space-y-5 py-4 sm:space-y-6 sm:py-5">
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-600">
                  <Truck className="h-3.5 w-3.5" aria-hidden />
                </div>
                <h3 className="text-sm font-semibold text-slate-800">Client & livraison</h3>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                <div className="space-y-1.5">
                  <Label className="text-slate-700">Customer name</Label>
                  <Input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Customer name"
                    autoFocus
                    className={fieldClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone" className={cn("text-slate-700", phoneError && "text-red-600")}>
                    Phone <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    onBlur={handlePhoneBlur}
                    placeholder="+212 6XX XXX XXX"
                    className={cn(
                      fieldClass,
                      phoneError && "border-red-300 bg-red-50/30 focus-visible:ring-red-500/40"
                    )}
                    aria-invalid={Boolean(phoneError)}
                    aria-describedby={phoneError ? "phone-error" : undefined}
                  />
                  {phoneError ? (
                    <p id="phone-error" className="text-xs text-red-600">
                      {phoneError}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500">Required — numbers, spaces, and + only</p>
                  )}
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="address" className="text-slate-700">
                    Address
                  </Label>
                  <Input
                    id="address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Address"
                    className={fieldClass}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="deliveryService" className="text-slate-700">
                    Delivery service
                  </Label>
                  <SearchableSelect
                    value={selectedDeliveryService}
                    onValueChange={(value) => {
                      setSelectedDeliveryService(value);
                      setSelectedCity("");
                    }}
                    options={
                      selectableDeliveryServices.map((service: any) => ({
                        label: service.name,
                        value: service.id.toString(),
                      }))
                    }
                    placeholder="Select delivery service"
                    searchPlaceholder="Search service..."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-700">City</Label>
                  <SearchableSelect
                    value={selectedCity}
                    onValueChange={setSelectedCity}
                    options={
                      selectedServiceCities.map((city: string) => ({ label: city, value: city })) ||
                      []
                    }
                    placeholder={
                      selectedDeliveryService ? "Select city" : "Choose service first"
                    }
                    searchPlaceholder="Search city..."
                    disabled={!selectedDeliveryService}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-slate-700">Confirmation user</Label>
                  <SearchableSelect
                    value={selectedConfirmationUser}
                    onValueChange={setSelectedConfirmationUser}
                    options={[
                      { label: "None", value: "none" },
                      ...(Array.isArray(confirmationUsers)
                        ? confirmationUsers
                            .filter((u) => u.active)
                            .map((u) => ({
                              label: `${u.name}${u.linkedSalesUser ? ` (Linked to ${u.linkedSalesUser.name})` : ""}`,
                              value: u.id.toString(),
                            }))
                        : []),
                    ]}
                    placeholder="None"
                    searchPlaceholder="Search confirmation user..."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-700">Note sales</Label>
                  <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Note de l'équipe commerciale"
                    className={fieldClass}
                  />
                </div>
              </div>
            </section>

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/60">
              <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 bg-white/80 px-3 py-2.5 sm:px-4">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-matles-50 text-matles-700 ring-1 ring-inset ring-matles-100">
                    <Package className="h-3.5 w-3.5" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-800">Produits & accessoires</h3>
                    <p className="text-xs text-slate-500">Ajoutez au moins un produit</p>
                  </div>
                </div>
                <Badge variant="secondary" className="shrink-0 tabular-nums">
                  {orderItems.length + pillowItems.length}
                </Badge>
              </div>

              <div className="space-y-4 p-3 sm:p-4">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleAddItem();
                  }}
                  className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_88px_auto] sm:items-end"
                >
                  <div className="space-y-1.5">
                    <Label className="text-slate-700">Product</Label>
                    <SearchableSelect
                      value={selectedVariant}
                      onValueChange={(value) => {
                        setSelectedVariant(value);
                        checkStockLevel(value);
                      }}
                      options={
                        products?.flatMap((product: any) =>
                          product.variants.map((variant: any) => {
                            const stockStatus =
                              variant.stock === 0
                                ? " - OUT OF STOCK"
                                : variant.stock <= 1
                                  ? ` - LOW STOCK (${variant.stock})`
                                  : ` - Stock: ${variant.stock}`;

                            return {
                              label: `${product.name} - ${variant.name} (MAD ${formatPrice(variant.price)})${stockStatus}`,
                              value: variant.id.toString(),
                              disabled: variant.stock === 0,
                            };
                          })
                        ) || []
                      }
                      placeholder="Select product variant"
                      searchPlaceholder="Search product..."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-slate-700">Qty</Label>
                    <Input
                      type="number"
                      min={1}
                      value={quantity}
                      onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                      className={cn(fieldClass, "tabular-nums")}
                    />
                  </div>
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={!selectedVariant}
                    className="h-10 border-slate-200 bg-white text-slate-700 hover:border-matles-300 hover:bg-matles-50 hover:text-matles-800"
                  >
                    <Plus className="mr-1.5 h-4 w-4" aria-hidden />
                    Add
                  </Button>
                </form>

                {lowStockWarning && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                    <p className="text-sm font-medium text-red-800">{lowStockWarning}</p>
                  </div>
                )}

                {orderItems.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-white/70 px-3 py-6 text-center text-sm text-slate-500">
                    Aucun produit ajouté pour le moment.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                    <div className="hidden grid-cols-[minmax(0,1fr)_56px_88px_88px_40px] gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-500 sm:grid">
                      <div>Produit</div>
                      <div className="text-right">Qty</div>
                      <div className="text-right">Prix</div>
                      <div className="text-right">Ligne</div>
                      <div />
                    </div>
                    <ul className="divide-y divide-slate-100">
                      {orderItems.map((item, index) => (
                        <li
                          key={index}
                          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_56px_88px_88px_40px]"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-800">
                              {item.product?.name}
                            </p>
                            <p className="truncate text-xs text-slate-500">{item.variant?.name}</p>
                            <p className="text-xs text-slate-500 sm:hidden">
                              qty {item.quantity} · MAD {formatPrice(item.price)} · MAD{" "}
                              {formatPrice(item.price * item.quantity)}
                            </p>
                          </div>
                          <div className="hidden text-right text-sm tabular-nums text-slate-700 sm:block">
                            {item.quantity}
                          </div>
                          <div className="hidden text-right text-sm tabular-nums text-slate-700 sm:block">
                            {formatPrice(item.price)}
                          </div>
                          <div className="hidden text-right text-sm font-semibold tabular-nums text-slate-900 sm:block">
                            {formatPrice(item.price * item.quantity)}
                          </div>
                          <div className="flex justify-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveItem(index)}
                              className="h-8 w-8 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                              aria-label="Remove product"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="rounded-lg border border-slate-200 bg-white p-3 sm:p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">Accessoires</p>
                      <p className="text-xs text-slate-500">Supplement (optional)</p>
                    </div>
                    <Badge variant="secondary" className="tabular-nums">
                      {pillowItems.length}
                    </Badge>
                  </div>

                  {(inventoryActive || locationOptions.length > 1) && (
                    <div className="mb-3 space-y-1.5">
                      <Label className="text-slate-700">
                        Location
                        {inventoryActive && pillowItems.length > 0 ? (
                          <span className="text-red-500"> *</span>
                        ) : (
                          <span className="font-normal text-slate-400">
                            {" "}
                            (stock accessoires)
                          </span>
                        )}
                      </Label>
                      <SearchableSelect
                        value={locationId}
                        onValueChange={setLocationId}
                        options={
                          locationOptions.length
                            ? locationOptions
                            : [{ label: "No sellable location configured", value: "__none__" }]
                        }
                        placeholder="Select location"
                        searchPlaceholder="Search location..."
                      />
                      <p className="flex items-start gap-1.5 text-xs text-slate-500">
                        <MapPin className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                        Emplacement pour réserver le stock accessoires (défaut: Warehouse).
                      </p>
                    </div>
                  )}

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleAddPillow();
                    }}
                    className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_88px_auto] sm:items-end"
                  >
                    <div className="space-y-1.5">
                      <Label className="text-slate-700">Accessoire</Label>
                      <SearchableSelect
                        value={selectedPillowId}
                        onValueChange={setSelectedPillowId}
                        options={
                          (pillows as any[])?.map((p: any) => ({
                            label: `${p.name} (Stock: ${p.stock ?? 0})`,
                            value: String(p.id),
                            disabled: Number(p.stock ?? 0) <= 0,
                          })) || []
                        }
                        placeholder="Select accessoire"
                        searchPlaceholder="Search accessoire..."
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-slate-700">Qty</Label>
                      <Input
                        type="number"
                        min={1}
                        value={pillowQty}
                        onChange={(e) => setPillowQty(parseInt(e.target.value) || 1)}
                        className={cn(fieldClass, "tabular-nums")}
                      />
                    </div>
                    <Button
                      type="submit"
                      variant="outline"
                      disabled={!selectedPillowId}
                      className="h-10 border-slate-200 bg-white text-slate-700 hover:border-matles-300 hover:bg-matles-50 hover:text-matles-800"
                    >
                      <Plus className="mr-1.5 h-4 w-4" aria-hidden />
                      Add
                    </Button>
                  </form>

                  {pillowItems.length > 0 && (
                    <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
                      {pillowItems.map((pi: any) => (
                        <li
                          key={pi.pillowId}
                          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_56px_88px_40px]"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-800">
                              {pi.pillowName}
                            </p>
                            <p className="text-xs text-slate-500 sm:hidden">
                              qty {pi.quantity} · MAD {formatPrice(pi.price)}
                            </p>
                          </div>
                          <div className="hidden text-right text-sm tabular-nums text-slate-700 sm:block">
                            {pi.quantity}
                          </div>
                          <div className="hidden text-right text-sm tabular-nums text-slate-700 sm:block">
                            {formatPrice(pi.price)}
                          </div>
                          <div className="flex justify-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemovePillow(pi.pillowId)}
                              className="h-8 w-8 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                              aria-label="Remove accessoire"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3 sm:flex-row sm:items-end sm:justify-between sm:px-4">
                  {canOverrideTotal ? (
                    <div className="w-full space-y-1.5 sm:max-w-[200px]">
                      <Label className="text-slate-700">Override total</Label>
                      <Input
                        type="number"
                        value={manualTotal !== null ? manualTotal : ""}
                        onChange={(e) =>
                          setManualTotal(e.target.value !== "" ? parseFloat(e.target.value) : null)
                        }
                        placeholder="Optional"
                        className={cn(fieldClass, "tabular-nums")}
                      />
                    </div>
                  ) : (
                    <div />
                  )}
                  <div className="w-full space-y-1.5 sm:w-auto sm:min-w-[220px] sm:text-right">
                    <div className="flex justify-between gap-6 text-sm sm:justify-end">
                      <span className="text-slate-500">Subtotal</span>
                      <span className="font-medium tabular-nums text-slate-800">
                        MAD {calculateGrandTotal().toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-6 text-sm sm:justify-end">
                      <span className="text-slate-500">Commission</span>
                      <span className="font-medium tabular-nums text-slate-800">
                        MAD {calculateCommission(calculateTotal()).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-6 border-t border-slate-100 pt-2 sm:justify-end">
                      <span className="text-sm font-semibold text-slate-800">Total</span>
                      <span className="text-lg font-semibold tabular-nums tracking-tight text-slate-900">
                        MAD {(manualTotalNumber ?? calculateGrandTotal()).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-slate-100 bg-white px-4 py-3 sm:flex-row sm:justify-end sm:space-x-0 sm:px-6 sm:py-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-10 border-slate-200"
          >
            {isViewing ? "Close" : "Cancel"}
          </Button>
          {(!isViewing ||
            (isViewing &&
              !isLivreur &&
              (status !== originalStatus ||
                note !== order?.note ||
                trackingCode !== order?.trackingCode ||
                (!isSuivi && deliveryChanged)))) && (
            <Button
              onClick={handleSubmit}
              className="h-10 bg-matles-600 hover:bg-matles-700 active:scale-[0.98]"
            >
              {isViewing ? "Update Order" : "Create Order"}
            </Button>
          )}
          {isViewing && canLivreurMarkDelivered && status === "DELIVERED" && (
            <Button
              onClick={handleSubmit}
              className="h-10 bg-matles-600 hover:bg-matles-700 active:scale-[0.98]"
            >
              Mark as delivered
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

