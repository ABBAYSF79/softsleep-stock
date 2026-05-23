import { useState, useEffect } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  OrderStatusUpdate,
  useCreateOrder,
  useDeliveryServices,
  usePillowStock,
  useProducts,
  useUpdateOrderDelivery,
  useUpdateOrderStatus,
} from "@/hooks/useApi";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { ORDER_STATUSES, formatPrice } from "@/utils/order-utils";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";

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
  const [selectedConfirmationUser, setSelectedConfirmationUser] = useState<string>("none");
  const [note, setNote] = useState<string>("");
  const [trackingCode, setTrackingCode] = useState<string>("");
  const [deliveryChanged, setDeliveryChanged] = useState(false);
  const [lowStockWarning, setLowStockWarning] = useState<string | null>(null);

  const { user } = useAuth();
  const { data: products } = useProducts();
  const { data: deliveryServices } = useDeliveryServices();
  const { data: pillows } = usePillowStock();
  const createOrder = useCreateOrder();
  const updateOrderStatus = useUpdateOrderStatus();
  const updateOrderDelivery = useUpdateOrderDelivery();
  const queryClient = useQueryClient();

  const isAdmin = user?.role === "ADMIN";
  const canEditTrackingCode = isViewing && isAdmin && status === "IN_PROCESS";

  const { data: confirmationUsers = [] } = useQuery<ConfirmationUser[]>({
    queryKey: ["confirmationUsers"],
    queryFn: async () => {
      const response = await axios.get(
        user?.role === "ADMIN" ? "/api/confirmation-users" : "/api/confirmation-users/my-team",
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );
      return response.data || [];
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
      setSelectedConfirmationUser("none");
      setNote("");
      setTrackingCode("");
      setLowStockWarning(null);
      setSelectedVariant("");
      setQuantity(1);
      setManualTotal(null);
    }
  }, [order, open]);

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

  const manualTotalNumber =
    manualTotal === null
      ? null
      : Number.isFinite(parseFloat(String(manualTotal)))
        ? parseFloat(String(manualTotal))
        : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isViewing) {
      if (status === "IN_PROCESS" && !trackingCode.trim()) {
        toast.error("Tracking code is required when status is In Process");
        return;
      }

      const changed =
        selectedDeliveryService !== (order.deliveryServiceId?.toString() || "") ||
        selectedCity !== (order.city || "");
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

      try {
        const orderData = {
          customerName,
          address,
          phone,
          city: selectedCity,
          totalAmount: manualTotalNumber ?? calculateGrandTotal(),
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
        };

        await createOrder.mutateAsync(orderData);
        onOpenChange(false);
        queryClient.invalidateQueries({ queryKey: ["orders"] });
      } catch {
        toast.error("Failed to create order");
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] max-w-[90vw] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{isViewing ? `Order #${order.id}` : "Create New Order"}</DialogTitle>
          <DialogDescription>
            {isViewing ? "View or update order details" : "Fill in the details to create a new order"}
          </DialogDescription>
        </DialogHeader>

        {isViewing ? (
          <div className="space-y-6 overflow-y-auto pr-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Order Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Customer</Label>
                      <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} disabled />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input value={phone} onChange={(e) => setPhone(e.target.value)} disabled />
                    </div>
                    <div className="space-y-2">
                      <Label>Address</Label>
                      <Input value={address} onChange={(e) => setAddress(e.target.value)} disabled />
                    </div>
                    <div className="space-y-2">
                      <Label>Sales Person</Label>
                      <Input value={order?.user?.name} disabled />
                    </div>
                    <div className="space-y-2">
                      <Label>Confirmation user</Label>
                      <Input
                        value={
                          order?.confirmationUser?.name
                            ? `${order.confirmationUser.name}${order.confirmationUser.phone ? ` (${order.confirmationUser.phone})` : ""}`
                            : "-"
                        }
                        disabled
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Date</Label>
                      <Input type="date" value={new Date(order?.createdAt).toISOString().split("T")[0]} disabled />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Status</Label>
                      {isAdmin ? (
                        <Select value={status} onValueChange={handleStatusChange}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.values(ORDER_STATUSES).map((s) => (
                              <SelectItem key={s.value} value={s.value}>
                                {s.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="pt-2">
                          <OrderStatusBadge status={status} />
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Note</Label>
                      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note to the order" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="deliveryService">Delivery Service</Label>
                        {isAdmin ? (
                          <SearchableSelect
                            value={selectedDeliveryService}
                            onValueChange={(value) => {
                              setSelectedDeliveryService(value);
                              setSelectedCity("");
                            }}
                            options={
                              deliveryServices?.map((service: any) => ({
                                label: service.name,
                                value: service.id.toString(),
                              })) || []
                            }
                            placeholder="Select delivery service"
                            searchPlaceholder="Search service..."
                          />
                        ) : (
                          <Input value={deliveryServiceName || ""} readOnly />
                        )}
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Delivery City</Label>
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

                        <div className="space-y-2">
                          <Label className={status === "IN_PROCESS" && !trackingCode ? "text-red-600 flex items-center gap-2" : ""}>
                            Tracking Code
                            {status === "IN_PROCESS" && !trackingCode && (
                              <span className="text-xs font-normal bg-red-100 text-red-600 px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                                <AlertTriangle className="h-3 w-3" />
                                Required
                              </span>
                            )}
                          </Label>
                          <Input
                            value={trackingCode}
                            onChange={(e) => setTrackingCode(e.target.value)}
                            placeholder="Tracking Code"
                            disabled={!canEditTrackingCode}
                            className={status === "IN_PROCESS" && !trackingCode ? "border-red-300 focus-visible:ring-red-500 bg-red-50/30" : ""}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Items</CardTitle>
                <Badge variant="secondary" className="tabular-nums">
                  {orderItems.length + pillowItems.length}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="overflow-hidden rounded-lg border">
                  <div className="grid grid-cols-[1fr_110px_110px_120px] gap-3 bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                    <div>Product</div>
                    <div className="text-right">Qty</div>
                    <div className="text-right">Price</div>
                    <div className="text-right">Total</div>
                  </div>

                  {orderItems.length ? (
                    orderItems.map((it: any, idx: number) => {
                      const unit =
                        typeof it?.price === "object"
                          ? parseFloat(String(it.price?.toString?.() ?? 0))
                          : Number(it?.price ?? 0);
                      const qty = Number(it?.quantity ?? 0);
                      const lineTotal = unit * qty;

                      const productName = it?.product?.name || it?.variant?.product?.name || it?.productName || "-";
                      const variantLabel = it?.variant?.name || "-";

                      return (
                        <div
                          key={`${it?.variantId ?? "v"}-${idx}`}
                          className="grid grid-cols-[1fr_110px_110px_120px] gap-3 border-t px-3 py-2 text-sm"
                        >
                          <div className="min-w-0">
                            <div className="font-medium truncate">{productName}</div>
                            <div className="text-xs text-muted-foreground truncate">{variantLabel}</div>
                          </div>
                          <div className="text-right tabular-nums">{qty}</div>
                          <div className="text-right tabular-nums">MAD {formatPrice(unit)}</div>
                          <div className="text-right tabular-nums font-medium">MAD {formatPrice(lineTotal)}</div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="px-3 py-6 text-sm text-muted-foreground">No items</div>
                  )}
                </div>

                {pillowItems.length > 0 && (
                  <div className="overflow-hidden rounded-lg border">
                    <div className="grid grid-cols-[1fr_110px_110px_120px] gap-3 bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                      <div>Pillow (supplement)</div>
                      <div className="text-right">Qty</div>
                      <div className="text-right">Price</div>
                      <div className="text-right">Total</div>
                    </div>
                    {pillowItems.map((pi: any, idx: number) => {
                      const unit =
                        typeof pi?.price === "object"
                          ? parseFloat(String(pi.price?.toString?.() ?? 0))
                          : Number(pi?.price ?? 0);
                      const qty = Number(pi?.quantity ?? 0);
                      const lineTotal = unit * qty;
                      return (
                        <div
                          key={`${pi?.pillowId ?? "p"}-${idx}`}
                          className="grid grid-cols-[1fr_110px_110px_120px] gap-3 border-t px-3 py-2 text-sm"
                        >
                          <div className="min-w-0">
                            <div className="font-medium truncate">{pi?.pillowName || "-"}</div>
                            <div className="text-xs text-muted-foreground truncate">Supplement</div>
                          </div>
                          <div className="text-right tabular-nums">{qty}</div>
                          <div className="text-right tabular-nums">MAD {formatPrice(unit)}</div>
                          <div className="text-right tabular-nums font-medium">MAD {formatPrice(lineTotal)}</div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
                  <div className="text-sm font-medium">Order total</div>
                  <div className="text-sm font-semibold tabular-nums">
                    MAD {formatPrice(manualTotalNumber ?? calculateGrandTotal())}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="grid gap-6 overflow-y-auto pr-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Customer & delivery</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Customer name</Label>
                    <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Customer name" autoFocus />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address">Address</Label>
                  <Input
                    id="address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Address"
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="deliveryService">Delivery service</Label>
                    <SearchableSelect
                      value={selectedDeliveryService}
                      onValueChange={(value) => {
                        setSelectedDeliveryService(value);
                        setSelectedCity("");
                      }}
                      options={
                        deliveryServices?.map((service: any) => ({ label: service.name, value: service.id.toString() })) || []
                      }
                      placeholder="Select delivery service"
                      searchPlaceholder="Search service..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>City</Label>
                    <SearchableSelect
                      value={selectedCity}
                      onValueChange={setSelectedCity}
                      options={selectedServiceCities.map((city: string) => ({ label: city, value: city })) || []}
                      placeholder="Select city"
                      searchPlaceholder="Search city..."
                      disabled={!selectedDeliveryService}
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Confirmation user</Label>
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
                  <div className="space-y-2">
                    <Label>Note</Label>
                    <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Items</CardTitle>
                <Badge variant="secondary" className="tabular-nums">
                  {orderItems.length + pillowItems.length}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleAddItem();
                  }}
                  className="grid grid-cols-12 gap-3 items-end"
                >
                  <div className="col-span-8 space-y-2">
                    <Label>Product</Label>
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

                  <div className="col-span-2 space-y-2">
                    <Label>Qty</Label>
                    <Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(parseInt(e.target.value) || 1)} />
                  </div>

                  <div className="col-span-2">
                    <Button type="submit" className="w-full" disabled={!selectedVariant}>
                      Add
                    </Button>
                  </div>
                </form>

                {lowStockWarning && (
                  <div className="bg-red-50 border border-red-200 rounded-md p-3">
                    <p className="text-sm text-red-800 font-medium">{lowStockWarning}</p>
                  </div>
                )}

                <div className="space-y-2">
                  <table className="w-full">
                    <tbody>
                      {orderItems.map((item, index) => (
                        <tr key={index} className="border-b">
                          <td className="py-2">
                            <div>
                              <div className="font-medium">{item.product?.name}</div>
                              <div className="text-sm text-gray-500">{item.variant?.name}</div>
                            </div>
                          </td>
                          <td className="text-right py-2 tabular-nums">{item.quantity}</td>
                          <td className="text-right py-2 tabular-nums">MAD {formatPrice(item.price)}</td>
                          <td className="text-right py-2 tabular-nums">MAD {formatPrice(item.price * item.quantity)}</td>
                          <td className="text-right py-2">
                            <Button variant="ghost" size="sm" onClick={() => handleRemoveItem(index)} className="h-8 w-8 p-0">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="border rounded-md p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">Pillows (supplement)</div>
                    <Badge variant="secondary" className="tabular-nums">
                      {pillowItems.length}
                    </Badge>
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleAddPillow();
                    }}
                    className="mt-3 grid grid-cols-12 gap-3 items-end"
                  >
                    <div className="col-span-8 space-y-2">
                      <Label>Pillow</Label>
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
                        placeholder="Select pillow"
                        searchPlaceholder="Search pillow..."
                      />
                    </div>
                    <div className="col-span-2 space-y-2">
                      <Label>Qty</Label>
                      <Input type="number" min="1" value={pillowQty} onChange={(e) => setPillowQty(parseInt(e.target.value) || 1)} />
                    </div>
                    <div className="col-span-2">
                      <Button type="submit" className="w-full" disabled={!selectedPillowId}>
                        Add
                      </Button>
                    </div>
                  </form>

                  {pillowItems.length > 0 && (
                    <div className="mt-3">
                      <table className="w-full">
                        <tbody>
                          {pillowItems.map((pi: any) => (
                            <tr key={pi.pillowId} className="border-b">
                              <td className="py-2">
                                <div className="font-medium">{pi.pillowName}</div>
                              </td>
                              <td className="text-right py-2 tabular-nums">{pi.quantity}</td>
                              <td className="text-right py-2 tabular-nums">MAD {formatPrice(pi.price)}</td>
                              <td className="text-right py-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemovePillow(pi.pillowId)}
                                  className="h-8 w-8 p-0"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2 md:items-end">
                  {isAdmin && (
                    <div className="space-y-2">
                      <Label>Override total</Label>
                      <Input
                        type="number"
                        value={manualTotal !== null ? manualTotal : ""}
                        onChange={(e) => setManualTotal(e.target.value !== "" ? parseFloat(e.target.value) : null)}
                        placeholder="Optional"
                      />
                    </div>
                  )}

                  <div className="space-y-2 md:justify-self-end md:text-right">
                    <div className="flex justify-between md:justify-end md:gap-10">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="font-medium tabular-nums">MAD {calculateGrandTotal().toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between md:justify-end md:gap-10">
                      <span className="text-muted-foreground">Commission</span>
                      <span className="font-medium tabular-nums">MAD {calculateCommission(calculateTotal()).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-2 text-lg font-bold md:justify-end md:gap-10">
                      <span>Total</span>
                      <span className="tabular-nums">
                        MAD {(manualTotalNumber ?? calculateGrandTotal()).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <DialogFooter className="mt-4 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {isViewing ? "Close" : "Cancel"}
          </Button>
          {(!isViewing ||
            (isViewing &&
              (status !== originalStatus ||
                note !== order?.note ||
                trackingCode !== order?.trackingCode ||
                deliveryChanged))) && <Button onClick={handleSubmit}>{isViewing ? "Update Order" : "Create Order"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

