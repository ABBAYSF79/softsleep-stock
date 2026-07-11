import { useState, useEffect, useMemo } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { toast } from "sonner";
import { useProducts, useCreateOrder, useUpdateOrderStatus, useDeliveryServices, OrderStatusUpdate, useUpdateOrderDelivery } from "@/hooks/useApi";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { MapPin, Trash2, AlertTriangle, MessageSquare, Car } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { ORDER_STATUSES, formatPrice, generateAmanaTrackingCode } from "@/utils/order-utils";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface OrderDialogProps {
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

export const OrderDialog = ({ open, onOpenChange, order, onStatusUpdate }: OrderDialogProps) => {
  const isViewing = !!order;
  const [status, setStatus] = useState(order?.status || "PENDING");
  const [originalStatus, setOriginalStatus] = useState(order?.status || "PENDING");
  const [customerName, setCustomerName] = useState("");
  const [selectedVariant, setSelectedVariant] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [orderItems, setOrderItems] = useState<any[]>([]);
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
  const createOrder = useCreateOrder();
  const updateOrderStatus = useUpdateOrderStatus();
  const updateOrderDelivery = useUpdateOrderDelivery();
  const queryClient = useQueryClient();

  // Check if user is admin
  const isAdmin = user?.role === 'ADMIN';
  const isSales = user?.role === 'SALES';
  const savedLivreurNote = (order?.livreurNote ?? "").trim();
  const showLivreurNoteSection = isViewing && (isAdmin || isSales);

  // Fetch confirmation users
  const { data: confirmationUsers = [] } = useQuery<ConfirmationUser[]>({
    queryKey: ["confirmationUsers"],
    queryFn: async () => {
      const { data } = await api.get(
        user?.role === "ADMIN" ? "/confirmation-users" : "/confirmation-users/my-team"
      );
      return data || [];
    },
    enabled: !order // Only fetch when creating a new order
  });

  useEffect(() => {
    if (!open) return;

    if (order) {
      console.log('Full order data:', JSON.stringify(order, null, 2));
      console.log('Confirmation User:', order.confirmationUser);
      console.log('Confirmation User ID:', order.confirmationUserId);
      console.log('Is Viewing:', isViewing);
      console.log('Should Show Confirmation User:', isViewing && order?.confirmationUser);
      console.log('Order ID:', order.id);
      console.log('Order Status:', order.status);
      setStatus(order.status);
      setOriginalStatus(order.status);
      setCustomerName(order.customerName);
      setOrderItems(order.items.map(item => ({
        variantId: item.variantId,
        quantity: item.quantity,
        price: item.price,
        product: item.product,
        variant: item.variant
      })));
      setAddress(order.address || "");
      setPhone(order.phone || "");
      setSelectedDeliveryService(order.deliveryServiceId?.toString() || "");
      setSelectedCity(order.city || "");
      setSelectedConfirmationUser(order.confirmationUserId?.toString() || "none");
      setNote(order.note || "");
      setTrackingCode(order.trackingCode || "");
      setManualTotal(order.totalAmount || null);
    } else {
      setStatus("PENDING");
      setOriginalStatus("PENDING");
      setCustomerName("");
      setOrderItems([]);
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
      const changed = (selectedDeliveryService !== (order.deliveryServiceId?.toString() || "")) || (selectedCity !== (order.city || ""));
      setDeliveryChanged(changed);
    } else {
      setDeliveryChanged(false);
    }
  }, [isViewing, order, selectedDeliveryService, selectedCity]);

  // Get the selected delivery service's cities
  const selectedServiceCities = deliveryServices?.find(
    service => service.id.toString() === selectedDeliveryService
  )?.cities || [];

  const selectableDeliveryServices = useMemo(() => {
    return (
      deliveryServices?.filter(
        (service) =>
          service.active !== false || service.id.toString() === selectedDeliveryService
      ) ?? []
    );
  }, [deliveryServices, selectedDeliveryService]);

  // Get the delivery service name for display
  const deliveryServiceName = isViewing 
    ? deliveryServices?.find(service => service.id.toString() === order?.deliveryServiceId?.toString())?.name 
    : deliveryServices?.find(service => service.id.toString() === selectedDeliveryService)?.name;

  // Get the confirmation user name for display
  const confirmationUserName = isViewing && order?.confirmationUser
    ? order.confirmationUser.name
    : confirmationUsers?.find(user => user.id.toString() === selectedConfirmationUser)?.name;

  const handleStatusChange = (newStatus: string) => {
    setStatus(newStatus);
  };

  const canEditTrackingCode = isViewing && isAdmin && status === "IN_PROCESS";

  const checkStockLevel = (variantId: string) => {
    if (!products) return;
    
    let selectedVariant = null;
    let productName = "";
    
    products.forEach(product => {
      product.variants.forEach(variant => {
        if (variant.id.toString() === variantId) {
          selectedVariant = variant;
          productName = product.name;
        }
      });
    });

    if (selectedVariant && selectedVariant.stock <= 1) {
      if (selectedVariant.stock === 0) {
        setLowStockWarning(`🚫 Out of stock: ${productName} - ${selectedVariant.name} is currently out of stock. Please select a different product.`);
      } else {
        setLowStockWarning(`⚠️ Low stock warning: ${productName} - ${selectedVariant.name} has only ${selectedVariant.stock} item(s) left in stock. Consider choosing another product to avoid stock issues.`);
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

    // Find the selected variant details
    let variantInfo = null;
    let productInfo = null;
    
    products?.forEach(product => {
      product.variants.forEach(variant => {
        if (variant.id.toString() === selectedVariant) {
          variantInfo = variant;
          productInfo = product;
        }
      });
    });

    if (!variantInfo) return;

    // Check if variant is out of stock
    if (variantInfo.stock === 0) {
      toast.error("This product variant is out of stock");
      return;
    }

    const newItem = {
      variantId: variantInfo.id,
      quantity: quantity,
      price: parseFloat(variantInfo.price.toString()),
      variant: variantInfo,
      product: productInfo
    };

    setOrderItems([...orderItems, newItem]);
    setSelectedVariant("");
    setQuantity(1);
    setLowStockWarning(null);
  };

  const handleRemoveItem = (index: number) => {
    const newItems = orderItems.filter((_, i) => i !== index);
    setOrderItems(newItems);
  };

  const calculateTotal = () => {
    return orderItems.reduce((sum, item) => {
      const price = typeof item.price === 'object' ? parseFloat(item.price.toString()) : item.price;
      return sum + price * item.quantity;
    }, 0);
  };

  const calculateCommission = (total: number) => {
    return total * 0.1; // 10% commission
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isViewing) {
      if (status === "IN_PROCESS" && !trackingCode.trim()) {
        toast.error("Tracking code is required when status is In Process");
        return;
      }
      // Check if delivery service or city changed
      const deliveryChanged = (selectedDeliveryService !== (order.deliveryServiceId?.toString() || "")) || (selectedCity !== (order.city || ""));
      if (deliveryChanged) {
        try {
          await updateOrderDelivery.mutateAsync({
            id: order.id,
            deliveryServiceId: selectedDeliveryService,
            city: selectedCity
          });
          toast.success("Order delivery service/city updated successfully");
          onOpenChange(false);
          queryClient.invalidateQueries({ queryKey: ["orders"] });
          return;
        } catch (error) {
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
        // If only the note/tracking has changed, don't trigger stock updates
        const updateData: OrderStatusUpdate = {
          id: order!.id,
          status: status,
          note: note || undefined,
          trackingCode: trackingCode || undefined
        };

        // Only include status in the update if it has changed
        if (status === originalStatus) {
          delete updateData.status;
        }

        await updateOrderStatus.mutateAsync(updateData);
        
        if (status !== originalStatus && onStatusUpdate) {
          onStatusUpdate(order.id, status);
        }
        
        toast.success("Order updated successfully");
        onOpenChange(false);
        queryClient.invalidateQueries({ queryKey: ["orders"] });
      } catch (error: any) {
        console.error('Error updating order:', error);
        toast.error(error.response?.data?.error || "Failed to update order");
      }
    } else {
      // Create new order
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
          totalAmount: manualTotal ?? calculateTotal(),
          deliveryServiceId: parseInt(selectedDeliveryService),
          items: orderItems.map(item => ({
            variantId: item.variantId,
            quantity: item.quantity
          })),
          confirmationUserId: selectedConfirmationUser === "none" ? null : parseInt(selectedConfirmationUser),
          note,
          status: "PENDING",
          trackingCode: undefined
        };
        
        console.log('Creating order with data:', JSON.stringify(orderData, null, 2));
        console.log('Selected Confirmation User:', selectedConfirmationUser);
        console.log('Confirmation User ID being sent:', orderData.confirmationUserId);
        
        await createOrder.mutateAsync(orderData);
        onOpenChange(false);
        queryClient.invalidateQueries({ queryKey: ["orders"] });
      } catch (error) {
        console.error('Error creating order:', error);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {isViewing 
              ? `Order #${order.id}` 
              : "Create New Order"}
          </DialogTitle>
          <DialogDescription>
            {isViewing 
              ? "View or update order details" 
              : "Fill in the details to create a new order"}
          </DialogDescription>
        </DialogHeader>

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
                    <Input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      disabled={isViewing}
                      placeholder="Customer name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Sales Person</Label>
                    <Input value={isViewing ? order?.user?.name : user?.name} disabled />
                  </div>

                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={
                        isViewing
                          ? new Date(order?.createdAt).toISOString().split("T")[0]
                          : new Date().toISOString().split("T")[0]
                      }
                      disabled
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Status</Label>
                    {isViewing && isAdmin && (
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
                    )}
                  </div>

                  <div className="space-y-3">
                    {showLivreurNoteSection && (
                      <div className="space-y-2">
                        <Label className="flex items-center gap-1.5 text-amber-950">
                          <MessageSquare className="h-4 w-4" />
                          Note livreur
                        </Label>
                        {savedLivreurNote ? (
                          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 whitespace-pre-wrap">
                            {savedLivreurNote}
                          </div>
                        ) : (
                          <div className="rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2.5 text-sm text-muted-foreground">
                            —
                          </div>
                        )}
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>Note sales</Label>
                      <Input
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Note de l'équipe commerciale"
                        disabled={isViewing && !isAdmin && !isSales}
                      />
                    </div>
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
                    <div className="flex gap-2">
                      <Input
                        value={trackingCode}
                        onChange={(e) => setTrackingCode(e.target.value)}
                        placeholder="Tracking Code"
                        disabled={!canEditTrackingCode}
                        className={status === "IN_PROCESS" && !trackingCode ? "border-red-300 focus-visible:ring-red-500 bg-red-50/30" : ""}
                      />
                      {canEditTrackingCode && order?.id != null && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-10 w-10 shrink-0"
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
                          <TooltipContent>
                            Generate Amana tracking code
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    {status === "IN_PROCESS" && !trackingCode && (
                      <p className="text-[11px] text-red-500 font-medium">
                        Please provide a tracking code for In Process orders
                      </p>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="deliveryService">Delivery Service</Label>
                        {isViewing && !isAdmin ? (
                          <Input value={deliveryServiceName || ""} readOnly />
                        ) : (
                          <SearchableSelect
                            value={selectedDeliveryService}
                            onValueChange={(value) => {
                              setSelectedDeliveryService(value);
                              setSelectedCity("");
                            }}
                            options={
                              selectableDeliveryServices.map((service) => ({
                                label: service.name,
                                value: service.id.toString(),
                              }))
                            }
                            placeholder="Select delivery service"
                            searchPlaceholder="Search service..."
                          />
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label>Delivery City</Label>
                        <SearchableSelect
                          value={selectedCity}
                          onValueChange={setSelectedCity}
                          options={
                            selectedServiceCities.map((city) => ({
                              label: city,
                              value: city,
                            })) || []
                          }
                          placeholder="Select city"
                          searchPlaceholder="Search city..."
                          disabled={isViewing && !isAdmin}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Customer Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={isViewing} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} disabled={isViewing} />
              </div>
            </CardContent>
          </Card>

          {isViewing && (
            <Card>
              <CardHeader>
                <CardTitle>Confirmation User</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {order?.confirmationUser ? (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Name</Label>
                        <Input value={order.confirmationUser.name} disabled />
                      </div>
                      <div className="space-y-2">
                        <Label>Phone</Label>
                        <Input value={order.confirmationUser.phone || "-"} disabled />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Email</Label>
                        <Input value={order.confirmationUser.email || "-"} disabled />
                      </div>
                      <div className="space-y-2">
                        <Label>Linked Sales User</Label>
                        <Input value={order.confirmationUser.linkedSalesUser?.name || "-"} disabled />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center text-muted-foreground py-4">
                    No confirmation user assigned to this order
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {!isViewing && (
            <div className="space-y-2">
              <Label>Confirmation User</Label>
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
                placeholder="Select a confirmation user"
                searchPlaceholder="Search confirmation user..."
              />
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Order Items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {!isViewing && (
                  <div className="grid grid-cols-12 gap-4 items-end">
                    <div className="col-span-6 space-y-2">
                      <Label>Product</Label>
                      <SearchableSelect
                        value={selectedVariant}
                        onValueChange={(value) => {
                          setSelectedVariant(value);
                          checkStockLevel(value);
                        }}
                        options={
                          products?.flatMap((product) =>
                            product.variants.map((variant) => {
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
                      <Label>Quantity</Label>
                      <Input
                        type="number"
                        min="1"
                        value={quantity}
                        onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                      />
                    </div>

                    <div className="col-span-4">
                      <Button type="button" onClick={handleAddItem} className="w-full">
                        Add Item
                      </Button>
                    </div>
                  </div>
                )}

                {!isViewing && lowStockWarning && (
                  <div className="bg-red-50 border border-red-200 rounded-md p-3">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                          <path
                            fillRule="evenodd"
                            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <p className="text-sm text-red-800 font-medium">{lowStockWarning}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2 mt-6">
                  <table className="w-full">
                    <tbody>
                      {orderItems.map((item, index) => {
                        if (isViewing) {
                          return (
                            <tr key={index} className="border-b">
                              <td className="py-2">
                                <div>
                                  <div className="font-medium">{item.product?.name}</div>
                                  <div className="text-sm text-gray-500">
                                    {item.variant?.name}
                                    {item.variant?.size && (
                                      <span className="ml-2">({item.variant.size.name})</span>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="text-right py-2">{item.quantity}</td>
                              <td className="text-right py-2">MAD {formatPrice(item.price)}</td>
                              <td className="text-right py-2">MAD {formatPrice(item.price * item.quantity)}</td>
                            </tr>
                          );
                        }

                        const variant = products?.flatMap((p) => p.variants).find((v) => v.id === item.variantId);
                        const product = products?.find((p) => p.variants.some((v) => v.id === item.variantId));
                        return (
                          <tr key={index} className="border-b">
                            <td className="py-2">
                              <div>
                                <div className="font-medium">{product?.name}</div>
                                <div className="text-sm text-gray-500">
                                  {variant?.name}
                                  {variant?.size && (
                                    <span className="ml-2">({variant.size.name})</span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="text-right py-2">{item.quantity}</td>
                            <td className="text-right py-2">MAD {formatPrice(item.price)}</td>
                            <td className="text-right py-2">MAD {formatPrice(item.price * item.quantity)}</td>
                            <td className="text-right py-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoveItem(index)}
                                className="h-8 w-8 p-0"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Order Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Manual Total (Optional)</Label>
                  <Input
                    type="number"
                    value={manualTotal !== null ? manualTotal : ""}
                    onChange={(e) => setManualTotal(e.target.value !== "" ? parseFloat(e.target.value) : null)}
                    disabled={isViewing}
                    placeholder="Enter total manually"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span className="font-medium">
                      MAD {isViewing ? formatPrice(order?.totalAmount) : calculateTotal().toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Commission:</span>
                    <span className="font-medium">
                      MAD {isViewing ? formatPrice(order?.commission) : calculateCommission(calculateTotal()).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-lg font-bold pt-2 border-t">
                    <span>Total:</span>
                    <span>MAD {isViewing ? formatPrice(order?.totalAmount) : calculateTotal().toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <DialogFooter className="mt-4 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {isViewing ? "Close" : "Cancel"}
          </Button>
          {(!isViewing || (isViewing && (status !== originalStatus || note !== order?.note || trackingCode !== order?.trackingCode || deliveryChanged))) && (
            <Button onClick={handleSubmit}>
              {isViewing ? "Update Order" : "Create Order"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
