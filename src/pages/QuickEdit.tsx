import { useEffect, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useQuickUpdateOrder,
  useProducts,
  useDeliveryServices,
} from "@/hooks/useApi";
import { useAuth } from "@/contexts/AuthContext";
import { Search, Save, Plus, Trash2, AlertTriangle, Pencil } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatPrice, isOpenOrderStatus } from "@/utils/order-utils";
import { useSearchParams } from "react-router-dom";

const QuickEdit = () => {
  const [searchParams] = useSearchParams();
  const [orderId, setOrderId] = useState("");
  const [autoLoadOrderId, setAutoLoadOrderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<any>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searching, setSearching] = useState(false);

  const [selectedVariant, setSelectedVariant] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState<string>("");
  const [lowStockWarning, setLowStockWarning] = useState<string | null>(null);
  const [formData, setFormData] = useState<any>({
    customerName: "",
    phone: "",
    address: "",
    city: "",
    deliveryServiceId: "",
    note: "",
    items: [],
    pillowItems: [],
    customTotal: "",
  });

  const { user } = useAuth();
  const isSales = user?.role === "SALES";
  const isAdmin = user?.role === "ADMIN";
  const quickUpdateMutation = useQuickUpdateOrder();
  const { data: products } = useProducts();
  const { data: deliveryServices } = useDeliveryServices();
  const calculateTotal = (items: any[], pillowItems: any[]) => {
    const itemsTotal = (Array.isArray(items) ? items : []).reduce(
      (sum: number, item: any) => sum + Number(item.price || 0) * Number(item.quantity || 0),
      0
    );
    const pillowTotal = (Array.isArray(pillowItems) ? pillowItems : []).reduce(
      (sum: number, item: any) => sum + Number(item.price || 0) * Number(item.quantity || 0),
      0
    );
    return itemsTotal + pillowTotal;
  };

  useEffect(() => {
    const initialOrderId = searchParams.get("orderId");
    if (initialOrderId) {
      setOrderId(initialOrderId);
      setAutoLoadOrderId(initialOrderId);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!autoLoadOrderId) return;
    fetchOrderById(autoLoadOrderId);
    setAutoLoadOrderId(null);
  }, [autoLoadOrderId]);

  const searchOrders = async () => {
    if (!searchTerm || searchTerm.length < 2) return;
    setSearching(true);
    try {
      const { data } = await api.get(`/orders?search=${searchTerm}&limit=10`);
      const results = Array.isArray(data) ? data : data.data || [];
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
      const loadedItems = (data.items || []).map((item: any) => ({
        variantId: item.variantId,
        quantity: item.quantity,
        price: parseFloat(item.price),
        productName: item.product?.name || "Unknown Product",
        variantName: item.variant?.name || "Unknown Variant",
      }));
      const loadedPillowItems = Array.isArray(data.pillowItems)
        ? data.pillowItems.map((pi: any) => ({
            pillowId: pi.pillowId,
            pillowName: pi.pillowName || pi.pillow?.name || "Accessoire",
            quantity: Number(pi.quantity),
            price: parseFloat(pi.price ?? pi.pillow?.price ?? 0),
          }))
        : [];
      const savedTotal = Number(data.totalAmount);
      const computedTotal = calculateTotal(loadedItems, loadedPillowItems);
      setFormData({
        customerName: data.customerName,
        phone: data.phone || "",
        address: data.address || "",
        city: data.city || "",
        deliveryServiceId: data.deliveryServiceId?.toString() || "",
        note: data.note || "",
        items: loadedItems,
        pillowItems: loadedPillowItems,
        customTotal:
          Number.isFinite(savedTotal) && Math.abs(savedTotal - computedTotal) > 0.009
            ? String(savedTotal)
            : "",
      });
      toast.success("Order loaded");
    } catch (error) {
      console.error("Error fetching order:", error);
      toast.error("Order not found or access denied");
      setOrder(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrder = () => {
    if (!orderId) return;
    fetchOrderById(orderId);
  };

  const handleUpdate = () => {
    if (!order) return;

    if ((formData.items?.length || 0) === 0 && (formData.pillowItems?.length || 0) === 0) {
      toast.error("Order must have at least one product or supplement");
      return;
    }

    if (!formData.customerName?.trim()) {
      toast.error("Customer name is required");
      return;
    }

    const customTotalRaw = String(formData.customTotal ?? "").trim();
    const customTotal = customTotalRaw === "" ? null : Number(customTotalRaw);
    if (customTotal !== null && (!Number.isFinite(customTotal) || customTotal < 0)) {
      toast.error("Prix total personnalisé invalide");
      return;
    }

    quickUpdateMutation.mutate({
      id: order.id,
      data: {
        customerName: formData.customerName.trim(),
        phone: formData.phone,
        address: formData.address,
        city: formData.city,
        note: formData.note,
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
        ...(customTotal !== null && isOpenOrderStatus(order.status) ? { totalAmount: customTotal } : {}),
      },
    });
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
        setLowStockWarning(`Out of stock: ${productName} - ${selected.name}`);
      } else {
        setLowStockWarning(
          `Low stock: ${productName} - ${selected.name} has only ${selected.stock} left`
        );
      }
    } else {
      setLowStockWarning(null);
    }
  };

  const handleAddItem = () => {
    if (!selectedVariant) {
      toast.error("Please select a product");
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

    const itemPrice = price ? parseFloat(price) : parseFloat(variantInfo.price);
    const newItems = [
      ...formData.items,
      {
        variantId: variantInfo.id,
        quantity,
        price: itemPrice,
        productName: productInfo.name,
        variantName: variantInfo.name,
      },
    ];
    setFormData({ ...formData, items: newItems });
    setSelectedVariant("");
    setQuantity(1);
    setPrice("");
    setLowStockWarning(null);
  };

  const handleRemoveItem = (index: number) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_: any, i: number) => i !== index),
    });
  };

  const handleRemovePillowItem = (pillowId: number) => {
    setFormData({
      ...formData,
      pillowItems: (formData.pillowItems || []).filter(
        (x: any) => Number(x.pillowId) !== Number(pillowId)
      ),
    });
  };

  const selectedServiceCities =
    deliveryServices?.find(
      (service: any) => service.id.toString() === formData.deliveryServiceId
    )?.cities || [];

  const productsLocked = Boolean(order) && !isOpenOrderStatus(order.status);
  const totalPreview = calculateTotal(formData.items || [], formData.pillowItems || []);

  if (!user || (!isSales && !isAdmin)) {
    return (
      <MainLayout>
        <div className="flex h-[50vh] items-center justify-center">
          <div className="text-xl font-bold text-red-600">Access Denied</div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6 pb-20">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Pencil className="h-6 w-6" />
            Quick Edit
          </h1>
          <p className="text-sm text-muted-foreground">
            Edit name, phone, city, address, product, price, supplement, and note.
            Product and price can only be changed while the order is PENDING or Reporté.
            Status and delivery service stay unchanged.
          </p>
        </div>

        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-end gap-4">
              <div className="flex-1 space-y-2">
                <Label>Find Order (Name, Phone, ID)</Label>
                <div className="relative flex gap-2">
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && searchOrders()}
                    placeholder="Search by name, phone, or tracking..."
                  />
                  <Button onClick={searchOrders} disabled={searching}>
                    <Search className="mr-2 h-4 w-4" />
                    {searching ? "Searching..." : "Search"}
                  </Button>
                  {showSearchResults && searchResults.length > 0 && (
                    <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-md border bg-white shadow-lg">
                      {searchResults.map((result: any) => (
                        <div
                          key={result.id}
                          className="flex cursor-pointer items-center justify-between border-b p-3 last:border-b-0 hover:bg-gray-100"
                          onClick={() => handleSelectOrder(result)}
                        >
                          <div>
                            <div className="font-medium">
                              #{result.id} - {result.customerName}
                            </div>
                            <div className="text-sm text-gray-500">
                              {result.phone} • {new Date(result.createdAt).toLocaleDateString()}
                            </div>
                          </div>
                          <div className="text-sm font-medium">{result.status}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="w-[200px] space-y-2">
                <Label>Direct ID</Label>
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

        {order && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>
                  Order #{order.id}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({order.status})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nom</Label>
                  <Input
                    value={formData.customerName}
                    onChange={(e) =>
                      setFormData({ ...formData, customerName: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Téléphone</Label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Adresse</Label>
                  <Input
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Ville</Label>
                  {selectedServiceCities.length > 0 ? (
                    <SearchableSelect
                      value={formData.city}
                      onValueChange={(val) => setFormData({ ...formData, city: val })}
                      options={selectedServiceCities.map((c: string) => ({
                        label: c,
                        value: c,
                      }))}
                      placeholder="Select city"
                      searchPlaceholder="Search city..."
                    />
                  ) : (
                    <Input
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    />
                  )}
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Note</Label>
                  <Textarea
                    value={formData.note}
                    onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                    rows={2}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Produit & Prix</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {productsLocked && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>
                      Commande {order.status} : les produits et le prix ne peuvent être modifiés
                      que lorsque la commande est PENDING ou Reporté. Vous pouvez toujours modifier les
                      informations client et la note.
                    </p>
                  </div>
                )}

                {!productsLocked && (
                <div className="mb-4 grid grid-cols-12 items-end gap-4 border-b pb-4">
                  <div className="col-span-6 space-y-2">
                    <Label>Produit</Label>
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
                      placeholder="Select product"
                      searchPlaceholder="Search product..."
                    />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label>Qty</Label>
                    <Input
                      type="number"
                      min="1"
                      value={quantity}
                      onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                    />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label>Prix</Label>
                    <Input
                      type="number"
                      min="0"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="Override"
                    />
                  </div>
                  <div className="col-span-2">
                    <Button type="button" onClick={handleAddItem} className="w-full">
                      <Plus className="mr-2 h-4 w-4" /> Add
                    </Button>
                  </div>
                </div>
                )}

                {!productsLocked && lowStockWarning && (
                  <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3">
                    <div className="flex">
                      <AlertTriangle className="h-5 w-5 text-red-400" />
                      <p className="ml-3 text-sm font-medium text-red-800">{lowStockWarning}</p>
                    </div>
                  </div>
                )}

                {formData.items.map((item: any, index: number) => (
                  <div
                    key={index}
                    className="flex items-end gap-4 rounded-lg border bg-gray-50 p-4"
                  >
                    <div className="flex-[2] space-y-2">
                      <Label>Produit</Label>
                      <div className="rounded border bg-white px-3 py-2 text-sm font-medium">
                        {item.productName} - {item.variantName}
                      </div>
                    </div>
                    <div className="flex-1 space-y-2">
                      <Label>Qty</Label>
                      <Input
                        type="number"
                        value={item.quantity}
                        disabled={productsLocked}
                        onChange={(e) => {
                          const newItems = [...formData.items];
                          newItems[index] = {
                            ...newItems[index],
                            quantity: Math.max(1, parseInt(e.target.value) || 1),
                          };
                          setFormData({ ...formData, items: newItems });
                        }}
                      />
                    </div>
                    <div className="flex-1 space-y-2">
                      <Label>Prix</Label>
                      <Input
                        type="number"
                        value={item.price}
                        disabled={productsLocked}
                        onChange={(e) => {
                          const newItems = [...formData.items];
                          newItems[index] = {
                            ...newItems[index],
                            price: Math.max(0, parseFloat(e.target.value) || 0),
                          };
                          setFormData({ ...formData, items: newItems });
                        }}
                      />
                    </div>
                    {!productsLocked && (
                      <Button
                        variant="destructive"
                        size="icon"
                        onClick={() => handleRemoveItem(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}

                {(formData.pillowItems || []).length > 0 && (
                <div className="space-y-4 border-t pt-4">
                  <div className="text-sm font-semibold">Supplément (accessoires)</div>

                  {(formData.pillowItems || []).map((item: any, index: number) => (
                    <div
                      key={`${item.pillowId}-${index}`}
                      className="flex items-end gap-4 rounded-lg border bg-gray-50 p-4"
                    >
                      <div className="flex-[2] space-y-2">
                        <Label>Supplément</Label>
                        <div className="rounded border bg-white px-3 py-2 text-sm font-medium">
                          {item.pillowName || `#${item.pillowId}`}
                        </div>
                      </div>
                      <div className="flex-1 space-y-2">
                        <Label>Qty</Label>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          disabled={productsLocked}
                          onChange={(e) => {
                            const next = [...formData.pillowItems];
                            next[index] = {
                              ...next[index],
                              quantity: Math.max(1, parseInt(e.target.value) || 1),
                            };
                            setFormData({ ...formData, pillowItems: next });
                          }}
                        />
                      </div>
                      <div className="flex-1 space-y-2">
                        <Label>Prix</Label>
                        <Input
                          type="number"
                          min="0"
                          value={item.price}
                          disabled={productsLocked}
                          onChange={(e) => {
                            const next = [...formData.pillowItems];
                            next[index] = {
                              ...next[index],
                              price: Math.max(0, parseFloat(e.target.value) || 0),
                            };
                            setFormData({ ...formData, pillowItems: next });
                          }}
                        />
                      </div>
                      {!productsLocked && (
                        <Button
                          variant="destructive"
                          size="icon"
                          onClick={() => handleRemovePillowItem(Number(item.pillowId))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                )}

                {productsLocked ? (
                  <div className="border-t pt-4 text-right text-sm font-semibold">
                    Total: MAD {formatPrice(Number(order.totalAmount) || 0)}
                  </div>
                ) : (
                <div className="flex flex-col gap-4 border-t pt-4 sm:flex-row sm:items-end sm:justify-between">
                  <div className="w-full space-y-2 sm:max-w-xs">
                    <Label htmlFor="quick-edit-custom-total">Prix total personnalisé (MAD)</Label>
                    <div className="flex gap-2">
                      <Input
                        id="quick-edit-custom-total"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder={`Auto: ${formatPrice(totalPreview)}`}
                        value={formData.customTotal}
                        onChange={(e) => setFormData({ ...formData, customTotal: e.target.value })}
                      />
                      {String(formData.customTotal ?? "").trim() !== "" && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setFormData({ ...formData, customTotal: "" })}
                        >
                          Auto
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Laisser vide pour calculer automatiquement à partir des produits.
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    {String(formData.customTotal ?? "").trim() !== "" ? (
                      <>
                        <div className="text-muted-foreground line-through">
                          Calculé: MAD {formatPrice(totalPreview)}
                        </div>
                        <div className="font-semibold">
                          Total: MAD {formatPrice(Number(formData.customTotal) || 0)}
                        </div>
                      </>
                    ) : (
                      <div className="font-semibold">Total: MAD {formatPrice(totalPreview)}</div>
                    )}
                  </div>
                </div>
                )}
              </CardContent>
            </Card>

            <div className="sticky bottom-6 z-10 flex justify-end gap-4 rounded-lg border bg-background p-4 shadow-lg">
              <Button variant="outline" onClick={() => setOrder(null)}>
                Cancel
              </Button>
              <Button
                onClick={handleUpdate}
                disabled={quickUpdateMutation.isPending}
                className="min-w-[180px]"
              >
                <Save className="mr-2 h-4 w-4" />
                {quickUpdateMutation.isPending ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default QuickEdit;
