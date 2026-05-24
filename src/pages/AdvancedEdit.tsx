import { useEffect, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFullUpdateOrder, useProducts, useDeliveryServices, usePillowStock } from "@/hooks/useApi";
import { useAuth } from "@/contexts/AuthContext";
import { Search, Save, Lock, Plus, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api"; 
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatPrice } from "@/utils/order-utils";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";

const AdvancedEdit = () => {
  const [searchParams] = useSearchParams();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [orderId, setOrderId] = useState("");
  const [autoLoadOrderId, setAutoLoadOrderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<any>(null);
  
  // Search state
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searching, setSearching] = useState(false);

  // Item Addition State
  const [selectedVariant, setSelectedVariant] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState<string>(""); // Optional manual price
  const [lowStockWarning, setLowStockWarning] = useState<string | null>(null);
  const [selectedPillowId, setSelectedPillowId] = useState("");
  const [pillowQty, setPillowQty] = useState(1);

  // Form States
  const [formData, setFormData] = useState<any>({
    customerName: "",
    phone: "",
    address: "",
    city: "",
    deliveryServiceId: "",
    status: "",
    trackingCode: "",
    note: "",
    totalAmount: "",
    items: [],
    pillowItems: [],
    confirmationUserId: "none"
  });

  const { user } = useAuth();
  const fullUpdateMutation = useFullUpdateOrder();
  const { data: products } = useProducts();
  const { data: deliveryServices } = useDeliveryServices();
  const { data: pillows } = usePillowStock();

  const calculateTotal = (items: any[], pillowItems: any[]) => {
    const itemsTotal = (Array.isArray(items) ? items : []).reduce(
      (sum: number, item: any) => sum + Number(item.price || 0) * Number(item.quantity || 0),
      0
    );
    const pillowTotal = (Array.isArray(pillowItems) ? pillowItems : []).reduce(
      (sum: number, item: any) => sum + Number(item.price || 0) * Number(item.quantity || 0),
      0
    );
    return (itemsTotal + pillowTotal).toString();
  };

  // Fetch confirmation users
  const { data: confirmationUsers = [] } = useQuery<any[]>({
    queryKey: ["confirmationUsers"],
    queryFn: async () => {
      const response = await api.get("/confirmation-users");
      return response.data || [];
    },
    enabled: isAuthenticated && user?.role === 'ADMIN'
  });

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === "admin123456") {
      setIsAuthenticated(true);
      toast.success("Access granted");
    } else {
      toast.error("Invalid password");
    }
  };

  useEffect(() => {
    const initialOrderId = searchParams.get("orderId");
    if (initialOrderId) {
      setOrderId(initialOrderId);
      setAutoLoadOrderId(initialOrderId);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!autoLoadOrderId) return;
    fetchOrderById(autoLoadOrderId);
    setAutoLoadOrderId(null);
  }, [isAuthenticated, autoLoadOrderId]);

  const searchOrders = async () => {
    if (!searchTerm || searchTerm.length < 2) return;
    setSearching(true);
    try {
      const { data } = await api.get(`/orders?search=${searchTerm}&limit=10`);
      const results = Array.isArray(data) ? data : (data.data || []);
      setSearchResults(results);
      setShowSearchResults(true);
    } catch (error) {
      console.error("Error searching orders:", error);
      toast.error("Error searching orders");
    } finally {
      setSearching(false);
    }
  };

  const handleSelectOrder = (selectedOrder: any) => {
    setOrderId(selectedOrder.id.toString());
    setSearchResults([]);
    setShowSearchResults(false);
    setSearchTerm("");
    fetchOrderById(selectedOrder.id);
  };

  const fetchOrderById = async (id: number | string) => {
    setLoading(true);
    try {
      const { data } = await api.get(`/orders/${id}`);
      setOrder(data);
      
      setFormData({
        customerName: data.customerName,
        phone: data.phone || "",
        address: data.address || "",
        city: data.city || "",
        deliveryServiceId: data.deliveryServiceId?.toString() || "",
        status: data.status,
        trackingCode: data.trackingCode || "",
        note: data.note || "",
        totalAmount: data.totalAmount,
        confirmationUserId: data.confirmationUserId?.toString() || "none",
        items: data.items.map((item: any) => ({
          variantId: item.variantId,
          quantity: item.quantity,
          price: parseFloat(item.price),
          productName: item.product?.name || "Unknown Product",
          variantName: item.variant?.name || "Unknown Variant",
          variant: item.variant,
          product: item.product
        })),
        pillowItems: Array.isArray(data.pillowItems)
          ? data.pillowItems.map((pi: any) => ({
              pillowId: pi.pillowId,
              pillowName: pi.pillowName || pi.pillow?.name || "Accessoire",
              quantity: Number(pi.quantity),
              price: parseFloat(pi.price ?? pi.pillow?.price ?? 0),
            }))
          : []
      });
      toast.success("Order loaded successfully");
    } catch (error) {
      console.error("Error fetching order:", error);
      toast.error("Order not found or error loading data");
      setOrder(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrder = () => {
    if (!orderId) return;
    fetchOrderById(orderId);
  };

  const handleUpdate = async () => {
    if (!order) return;

    if ((formData.items?.length || 0) === 0 && (formData.pillowItems?.length || 0) === 0) {
      toast.error("Order must have at least one item or pillow supplement");
      return;
    }

    const computedTotal = calculateTotal(formData.items || [], formData.pillowItems || []);
    const parsedTotal = formData.totalAmount === "" ? NaN : Number(formData.totalAmount);

    fullUpdateMutation.mutate({
      id: order.id,
      data: {
        password: "admin123456",
        ...formData,
        items: (formData.items || []).map((i: any) => ({
          variantId: i.variantId,
          quantity: i.quantity,
          price: i.price,
        })),
        pillowItems: (formData.pillowItems || []).map((i: any) => ({
          pillowId: i.pillowId,
          quantity: i.quantity,
          price: i.price,
        })),
        deliveryServiceId: formData.deliveryServiceId ? parseInt(formData.deliveryServiceId) : null,
        confirmationUserId: formData.confirmationUserId === "none" ? null : parseInt(formData.confirmationUserId),
        ...(Number.isFinite(parsedTotal) ? { totalAmount: parsedTotal } : { totalAmount: Number(computedTotal) })
      }
    });
  };

  const handleRemoveItem = (index: number) => {
    const newItems = formData.items.filter((_: any, i: number) => i !== index);
    
    const newTotal = calculateTotal(newItems, formData.pillowItems);
    
    setFormData({ 
      ...formData, 
      items: newItems,
      totalAmount: newTotal.toString() 
    });
  };

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
        setLowStockWarning(`🚫 Out of stock: ${productName} - ${selectedVariant.name} is currently out of stock.`);
      } else {
        setLowStockWarning(`⚠️ Low stock warning: ${productName} - ${selectedVariant.name} has only ${selectedVariant.stock} item(s) left.`);
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

    // Use manual price if provided, otherwise use variant price
    const itemPrice = price ? parseFloat(price) : parseFloat(variantInfo.price);

    const newItem = {
      variantId: variantInfo.id,
      quantity: quantity,
      price: itemPrice,
      productName: productInfo.name,
      variantName: variantInfo.name,
      variant: variantInfo,
      product: productInfo
    };

    const newItems = [...formData.items, newItem];

    const newTotal = calculateTotal(newItems, formData.pillowItems);

    setFormData({
      ...formData,
      items: newItems,
      totalAmount: newTotal.toString() // Update total amount
    });
    
    setSelectedVariant("");
    setQuantity(1);
    setPrice(""); // Reset price
    setLowStockWarning(null);
  };

  // Get cities based on selected delivery service
  const selectedServiceCities = deliveryServices?.find(
    service => service.id.toString() === formData.deliveryServiceId
  )?.cities || [];

  const handleAddPillowItem = () => {
    const pillowId = Number(selectedPillowId);
    if (!Number.isInteger(pillowId) || pillowId <= 0) {
      toast.error("Please select a pillow");
      return;
    }

    if (pillowQty < 1) {
      toast.error("Quantity must be at least 1");
      return;
    }

    const pillow = (pillows as any[])?.find((p: any) => Number(p.id) === pillowId);
    if (!pillow) return;

    const next = Array.isArray(formData.pillowItems) ? formData.pillowItems.slice() : [];
    const idx = next.findIndex((x: any) => Number(x.pillowId) === pillowId);
    const unitPrice = parseFloat(pillow.price);
    if (idx >= 0) {
      next[idx] = { ...next[idx], quantity: Number(next[idx].quantity || 0) + pillowQty, price: unitPrice, pillowName: pillow.name };
    } else {
      next.push({ pillowId, pillowName: pillow.name, quantity: pillowQty, price: unitPrice });
    }

    const newTotal =
      calculateTotal(formData.items, next);

    setFormData({ ...formData, pillowItems: next, totalAmount: newTotal.toString() });
    setSelectedPillowId("");
    setPillowQty(1);
  };

  const handleRemovePillowItem = (pillowId: number) => {
    const next = Array.isArray(formData.pillowItems) ? formData.pillowItems.filter((x: any) => Number(x.pillowId) !== Number(pillowId)) : [];
    const newTotal = calculateTotal(formData.items, next);
    setFormData({ ...formData, pillowItems: next, totalAmount: newTotal.toString() });
  };

  if (!user || user.role !== 'ADMIN') {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-[50vh]">
          <div className="text-xl font-bold text-red-600">Access Denied: Admins Only</div>
        </div>
      </MainLayout>
    );
  }

  if (!isAuthenticated) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Card className="w-[400px]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Security Check
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Enter Security Password</Label>
                  <Input 
                    type="password" 
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password..."
                  />
                </div>
                <Button type="submit" className="w-full">Unlock Advanced Edit</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6 pb-20">
        <h1 className="text-2xl font-bold text-red-600 flex items-center gap-2">
          <Lock className="h-6 w-6" />
          Advanced Order Edit
        </h1>
        
        {/* Search Section */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex gap-4 items-end">
              <div className="space-y-2 flex-1">
                <Label>Find Order (Name, Phone, ID)</Label>
                <div className="flex gap-2 relative">
                  <Input 
                    value={searchTerm} 
                    onChange={(e) => setSearchTerm(e.target.value)} 
                    onKeyDown={(e) => e.key === 'Enter' && searchOrders()}
                    placeholder="Search by customer name, phone, or tracking..."
                  />
                  <Button onClick={searchOrders} disabled={searching}>
                    <Search className="h-4 w-4 mr-2" />
                    {searching ? "Searching..." : "Search"}
                  </Button>
                  
                  {showSearchResults && searchResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {searchResults.map((result: any) => (
                        <div 
                          key={result.id}
                          className="p-3 hover:bg-gray-100 cursor-pointer border-b last:border-b-0 flex justify-between items-center"
                          onClick={() => handleSelectOrder(result)}
                        >
                          <div>
                            <div className="font-medium">#{result.id} - {result.customerName}</div>
                            <div className="text-sm text-gray-500">{result.phone} • {new Date(result.createdAt).toLocaleDateString()}</div>
                          </div>
                          <div className="text-sm font-medium">{result.status}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="space-y-2 w-[200px]">
                <Label>Direct ID Load</Label>
                <div className="flex gap-2">
                  <Input 
                    value={orderId} 
                    onChange={(e) => setOrderId(e.target.value)} 
                    placeholder="ID"
                  />
                  <Button variant="outline" onClick={fetchOrder} disabled={loading}>
                    Load
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Edit Form */}
        {order && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Customer Details</CardTitle>
              </CardHeader>
              <CardContent className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Customer Name</Label>
                  <Input 
                    value={formData.customerName} 
                    onChange={(e) => setFormData({...formData, customerName: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input 
                    value={formData.phone} 
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Address</Label>
                  <Input 
                    value={formData.address} 
                    onChange={(e) => setFormData({...formData, address: e.target.value})}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Confirmation User</Label>
                  <SearchableSelect
                    value={formData.confirmationUserId}
                    onValueChange={(val) => setFormData({...formData, confirmationUserId: val})}
                    options={[
                      { label: "None", value: "none" },
                      ...(Array.isArray(confirmationUsers) ? confirmationUsers
                        .filter((user: any) => user.active)
                        .map((user: any) => ({
                          label: `${user.name}${user.linkedSalesUser ? ` (Linked to ${user.linkedSalesUser.name})` : ''}`,
                          value: user.id.toString(),
                        })) : [])
                    ]}
                    placeholder="Select a confirmation user"
                    searchPlaceholder="Search confirmation user..."
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Order Details</CardTitle>
              </CardHeader>
              <CardContent className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select 
                    value={formData.status} 
                    onValueChange={(val) => setFormData({...formData, status: val})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PENDING">PENDING</SelectItem>
                      <SelectItem value="CONFIRMED">CONFIRMED</SelectItem>
                      <SelectItem value="IN_PROCESS">IN PROCESS</SelectItem>
                      <SelectItem value="DELIVERED">DELIVERED</SelectItem>
                      <SelectItem value="RETURNED">RETURNED</SelectItem>
                      <SelectItem value="CANCELLED">CANCELLED</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Delivery Service</Label>
                  <SearchableSelect
                    value={formData.deliveryServiceId}
                    onValueChange={(val) => setFormData({...formData, deliveryServiceId: val, city: ""})}
                    options={deliveryServices?.map((service) => ({
                      label: service.name,
                      value: service.id.toString(),
                    })) || []}
                    placeholder="Select delivery service"
                    searchPlaceholder="Search service..."
                  />
                </div>

                <div className="space-y-2">
                  <Label>City</Label>
                  <SearchableSelect
                    value={formData.city}
                    onValueChange={(val) => setFormData({...formData, city: val})}
                    options={selectedServiceCities.map(city => ({
                      label: city,
                      value: city,
                    })) || []}
                    placeholder="Select city"
                    searchPlaceholder="Search city..."
                  />
                </div>

                <div className="space-y-2">
                  <Label>Total Amount (MAD)</Label>
                  <Input 
                    type="number"
                    value={formData.totalAmount} 
                    onChange={(e) => setFormData({...formData, totalAmount: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tracking Code</Label>
                  <Input 
                    value={formData.trackingCode} 
                    onChange={(e) => setFormData({...formData, trackingCode: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Note</Label>
                  <Input 
                    value={formData.note} 
                    onChange={(e) => setFormData({...formData, note: e.target.value})}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Items (Caution: Editing items affects stock)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Item Adder */}
                <div className="grid grid-cols-12 gap-4 items-end border-b pb-4 mb-4">
                  <div className="col-span-6 space-y-2">
                    <Label>Product</Label>
                    <SearchableSelect
                      value={selectedVariant}
                      onValueChange={(value) => {
                        setSelectedVariant(value);
                        checkStockLevel(value);
                      }}
                      options={products?.flatMap(product => 
                        product.variants.map(variant => {
                          const stockStatus = variant.stock === 0 ? ' - OUT OF STOCK' : 
                            variant.stock <= 1 ? ` - LOW STOCK (${variant.stock})` : 
                            ` - Stock: ${variant.stock}`;
                          
                          return {
                            label: `${product.name} - ${variant.name} (MAD ${formatPrice(variant.price)})${stockStatus}`,
                            value: variant.id.toString(),
                            disabled: variant.stock === 0
                          };
                        })
                      ) || []}
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

                  <div className="col-span-2 space-y-2">
                    <Label>Price (Optional)</Label>
                    <Input 
                      type="number" 
                      min="0"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="Override"
                    />
                  </div>
                  
                  <div className="col-span-2">
                    <Button 
                      type="button"
                      onClick={handleAddItem}
                      className="w-full"
                    >
                      <Plus className="h-4 w-4 mr-2" /> Add
                    </Button>
                  </div>
                </div>

                {/* Low Stock Warning */}
                {lowStockWarning && (
                  <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <AlertTriangle className="h-5 w-5 text-red-400" />
                      </div>
                      <div className="ml-3">
                        <p className="text-sm text-red-800 font-medium">
                          {lowStockWarning}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Item List */}
                {formData.items.map((item: any, index: number) => (
                  <div key={index} className="flex gap-4 items-end border p-4 rounded-lg bg-gray-50">
                    <div className="flex-[2] space-y-2">
                      <Label>Product</Label>
                      <div className="text-sm font-medium py-2 px-3 bg-white rounded border">
                        {item.productName} - {item.variantName}
                      </div>
                    </div>
                    <div className="flex-1 space-y-2">
                      <Label>Quantity</Label>
                      <Input 
                        type="number"
                        value={item.quantity} 
                        onChange={(e) => {
                          const newItems = [...formData.items];
                          const qty = Math.max(1, parseInt(e.target.value) || 1);
                          newItems[index] = { ...newItems[index], quantity: qty };
                          const newTotal = calculateTotal(newItems, formData.pillowItems);
                          setFormData({ ...formData, items: newItems, totalAmount: newTotal });
                        }}
                      />
                    </div>
                    <div className="flex-1 space-y-2">
                      <Label>Price</Label>
                      <Input 
                        type="number"
                        value={item.price} 
                        onChange={(e) => {
                          const newItems = [...formData.items];
                          const nextPrice = Math.max(0, parseFloat(e.target.value) || 0);
                          newItems[index] = { ...newItems[index], price: nextPrice };
                          const newTotal = calculateTotal(newItems, formData.pillowItems);
                          setFormData({ ...formData, items: newItems, totalAmount: newTotal });
                        }}
                      />
                    </div>
                    <Button 
                      variant="destructive" 
                      size="icon" 
                      onClick={() => handleRemoveItem(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}

                <div className="border-t pt-4 space-y-4">
                  <div className="text-sm font-semibold">Accessoires (supplement)</div>

                  <div className="grid grid-cols-12 gap-4 items-end">
                    <div className="col-span-7 space-y-2">
                      <Label>Accessoire</Label>
                      <SearchableSelect
                        value={selectedPillowId}
                        onValueChange={(val) => setSelectedPillowId(val)}
                        options={(Array.isArray(pillows) ? pillows : []).map((p: any) => {
                          const stock = Number(p.stock || 0);
                          const stockStatus = stock === 0 ? " - OUT OF STOCK" : stock <= 3 ? ` - LOW STOCK (${stock})` : ` - Stock: ${stock}`;
                          return {
                            label: `${p.name} (MAD ${formatPrice(p.price)})${stockStatus}`,
                            value: String(p.id),
                            disabled: stock === 0,
                          };
                        })}
                        placeholder="Select accessoire"
                        searchPlaceholder="Search accessoire..."
                      />
                    </div>

                    <div className="col-span-3 space-y-2">
                      <Label>Quantity</Label>
                      <Input
                        type="number"
                        min="1"
                        value={pillowQty}
                        onChange={(e) => setPillowQty(Math.max(1, parseInt(e.target.value) || 1))}
                      />
                    </div>

                    <div className="col-span-2">
                      <Button type="button" onClick={handleAddPillowItem} className="w-full">
                        <Plus className="h-4 w-4 mr-2" /> Add
                      </Button>
                    </div>
                  </div>

                  {(Array.isArray(formData.pillowItems) ? formData.pillowItems : []).map((item: any, index: number) => (
                    <div key={`${item.pillowId}-${index}`} className="flex gap-4 items-end border p-4 rounded-lg bg-gray-50">
                      <div className="flex-[2] space-y-2">
                        <Label>Accessoire</Label>
                        <div className="text-sm font-medium py-2 px-3 bg-white rounded border">
                          {item.pillowName || `#${item.pillowId}`}
                        </div>
                      </div>
                      <div className="flex-1 space-y-2">
                        <Label>Quantity</Label>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => {
                            const next = Array.isArray(formData.pillowItems) ? formData.pillowItems.slice() : [];
                            const qty = Math.max(1, parseInt(e.target.value) || 1);
                            next[index] = { ...next[index], quantity: qty };
                            const newTotal = calculateTotal(formData.items, next);
                            setFormData({ ...formData, pillowItems: next, totalAmount: newTotal });
                          }}
                        />
                      </div>
                      <div className="flex-1 space-y-2">
                        <Label>Price</Label>
                        <Input
                          type="number"
                          min="0"
                          value={item.price}
                          onChange={(e) => {
                            const next = Array.isArray(formData.pillowItems) ? formData.pillowItems.slice() : [];
                            const nextPrice = Math.max(0, parseFloat(e.target.value) || 0);
                            next[index] = { ...next[index], price: nextPrice };
                            const newTotal = calculateTotal(formData.items, next);
                            setFormData({ ...formData, pillowItems: next, totalAmount: newTotal });
                          }}
                        />
                      </div>
                      <Button
                        variant="destructive"
                        size="icon"
                        onClick={() => handleRemovePillowItem(Number(item.pillowId))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-4 sticky bottom-6 bg-background p-4 border rounded-lg shadow-lg z-10">
               <Button variant="outline" onClick={() => setOrder(null)}>Cancel</Button>
               <Button 
                 onClick={handleUpdate} 
                 disabled={fullUpdateMutation.isPending}
                 className="bg-red-600 hover:bg-red-700 text-white min-w-[200px]"
               >
                 <Save className="h-4 w-4 mr-2" />
                 {fullUpdateMutation.isPending ? "Updating..." : "Force Update Order"}
               </Button>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default AdvancedEdit;
