import { useState, FormEvent, useEffect } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useCreateProduct, useUpdateProduct } from "@/hooks/useApi";
import { useQuery } from "@tanstack/react-query";
import { useApi } from "@/hooks/useApi";

interface ProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: any;
}

interface ProductVariant {
  id?: number;
  name: string;
  skuExt: string;
  price: number;
  sizeId: number | null;
  stock: number;
}

interface ProductData {
  name: string;
  sku: string;
  description: string;
  variants: ProductVariant[];
}

export const ProductDialog = ({ open, onOpenChange, product }: ProductDialogProps) => {
  const isEditing = !!product;
  const [activeTab, setActiveTab] = useState("details");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const createProductMutation = useCreateProduct();
  const updateProductMutation = useUpdateProduct();
  const { api } = useApi();
  
  // Fetch sizes
  const { data: sizes } = useQuery({
    queryKey: ['sizes'],
    queryFn: async () => {
      const { data } = await api.get('/sizes');
      return data;
    }
  });
  
  const [productData, setProductData] = useState<ProductData>({
    name: "",
    sku: "",
    description: "",
    variants: [
      { name: "Demonstration 1", skuExt: "-V1", price: 100, sizeId: null, stock: 10 }
    ]
  });

  // Update state when product prop changes
  useEffect(() => {
    if (product) {
      setProductData({
        name: product.name || "",
        sku: product.sku || "",
        description: product.description || "",
        variants: product.variants?.map((v: any) => ({
          id: v.id,
          name: v.name,
          skuExt: v.skuExt,
          price: parseFloat(v.price),
          sizeId: v.sizeId || null,
          stock: v.stock
        })) || [{ name: "Demonstration 1", skuExt: "-V1", price: 100, sizeId: null, stock: 10 }]
      });
    } else {
      // Reset form for new product
      setProductData({
        name: "",
        sku: "",
        description: "",
        variants: [
          { name: "Demonstration 1", skuExt: "-V1", price: 100, sizeId: null, stock: 10 }
        ]
      });
    }
    setActiveTab("details");
  }, [product]);

  const handleInputChange = (field: keyof ProductData, value: string) => {
    setProductData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleVariantChange = (index: number, field: keyof ProductVariant, value: string | number) => {
    const updatedVariants = [...productData.variants];
    updatedVariants[index] = {
      ...updatedVariants[index],
      [field]: field === 'price' ? parseFloat(value as string) || 0 : value
    };

    setProductData(prev => ({
      ...prev,
      variants: updatedVariants
    }));
  };

  const handleAddVariant = () => {
    const newVariant: ProductVariant = {
      name: `Demonstration ${productData.variants.length + 1}`,
      skuExt: `-V${productData.variants.length + 1}`,
      price: 100 * (productData.variants.length + 1),
      sizeId: null,
      stock: 10 * (productData.variants.length + 1)
    };

    setProductData(prev => ({
      ...prev,
      variants: [...prev.variants, newVariant]
    }));
  };

  const handleRemoveVariant = (index: number) => {
    if (productData.variants.length === 1) {
      toast.error("Product must have at least one variant");
      return;
    }

    setProductData(prev => ({
      ...prev,
      variants: prev.variants.filter((_, i) => i !== index)
    }));
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!productData.name || !productData.sku) {
      toast.error("Product name and SKU are required");
      return;
    }

    if (productData.variants.length === 0) {
      toast.error("Product must have at least one variant");
      return;
    }

    // Validate variants
    for (const variant of productData.variants) {
      if (!variant.name || !variant.skuExt) {
        toast.error("All variants must have a name and SKU extension");
        return;
      }
      if (variant.price <= 0) {
        toast.error("Variant prices must be greater than 0");
        return;
      }
      if (variant.stock < 0) {
        toast.error("Variant stock cannot be negative");
        return;
      }
    }

    setIsSubmitting(true);

    try {
      if (isEditing) {
        const payload = {
          name: productData.name,
          sku: productData.sku,
          description: productData.description || "",
          variants: productData.variants.map(v => ({
            name: v.name,
            skuExt: v.skuExt,
            price: parseFloat(v.price.toString()),
            sizeId: v.sizeId,
            weight: 1.0,
            stock: parseInt(v.stock.toString(), 10)
          }))
        };
        
        console.log('Sending update payload:', payload);
        await updateProductMutation.mutateAsync({ id: product.id, data: payload });
        onOpenChange(false);
      } else {
        const payload = {
          name: productData.name,
          sku: productData.sku,
          description: productData.description || "",
          variants: productData.variants.map(v => ({
            name: v.name,
            skuExt: v.skuExt,
            price: parseFloat(v.price.toString()),
            sizeId: v.sizeId,
            weight: 1.0,
            stock: parseInt(v.stock.toString(), 10)
          }))
        };
        
        console.log('Sending create payload:', payload);
        await createProductMutation.mutateAsync(payload);
        onOpenChange(false);
      }
    } catch (error: any) {
      console.error('Error saving product:', error);
      toast.error(error.response?.data?.error || 'Failed to save product');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Product" : "Add New Product"}</DialogTitle>
          <DialogDescription>
            {isEditing 
              ? "Update the product details and variants below." 
              : "Fill in the product details and add variants below."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave}>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="details">Product Details</TabsTrigger>
              <TabsTrigger value="variants">Variants</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Product Name</Label>
                <Input
                  id="name"
                  value={productData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  placeholder="Enter product name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sku">SKU</Label>
                <Input
                  id="sku"
                  value={productData.sku}
                  onChange={(e) => handleInputChange("sku", e.target.value)}
                  placeholder="Enter SKU"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={productData.description}
                  onChange={(e) => handleInputChange("description", e.target.value)}
                  placeholder="Enter product description"
                />
              </div>
            </TabsContent>

            <TabsContent value="variants">
              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                {productData.variants.map((variant, index) => (
                  <Card key={index}>
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-start mb-4">
                        <h3 className="font-medium">Variant {index + 1}</h3>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveVariant(index)}
                          disabled={productData.variants.length === 1}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Variant Name</Label>
                          <Input
                            value={variant.name}
                            onChange={(e) => handleVariantChange(index, "name", e.target.value)}
                            placeholder="Enter variant name"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>SKU Extension</Label>
                          <Input
                            value={variant.skuExt}
                            onChange={(e) => handleVariantChange(index, "skuExt", e.target.value)}
                            placeholder="e.g., -V1"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Price</Label>
                          <Input
                            type="number"
                            value={variant.price}
                            onChange={(e) => handleVariantChange(index, "price", e.target.value)}
                            placeholder="Enter price"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Size</Label>
                          <select
                            className="w-full rounded-md border border-input bg-background px-3 py-2"
                            value={variant.sizeId || ''}
                            onChange={(e) => handleVariantChange(index, "sizeId", e.target.value ? parseInt(e.target.value) : null)}
                          >
                            <option value="">Select a size</option>
                            {sizes?.map((size: any) => (
                              <option key={size.id} value={size.id}>
                                {size.name} ({size.length}x{size.width}x{size.height} cm)
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-2">
                          <Label>Stock {isEditing && variant.id && <span className="text-xs text-muted-foreground font-normal">(Managed in Stock page)</span>}</Label>
                          <Input
                            type="number"
                            value={variant.stock}
                            onChange={(e) => handleVariantChange(index, "stock", e.target.value)}
                            placeholder="Enter stock quantity"
                            disabled={isEditing && !!variant.id}
                            className={isEditing && !!variant.id ? "bg-muted text-muted-foreground" : ""}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="mt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddVariant}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Variant
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : isEditing ? "Update Product" : "Create Product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};