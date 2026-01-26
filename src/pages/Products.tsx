import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Pencil, 
  Trash2, 
  Plus, 
  Search, 
  PackageCheck 
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProductDialog } from "@/components/products/ProductDialog";
import { DeleteConfirmDialog } from "@/components/common/DeleteConfirmDialog";
import { useProducts, useDeleteProduct } from "@/hooks/useApi";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { usePagination } from "@/hooks/usePagination";
import { PaginationControls } from "@/components/ui/pagination-controls";

const Products = () => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Delete state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<{id: number, name: string} | null>(null);
  
  const { data: products, isLoading } = useProducts();
  const { user } = useAuth();
  const deleteProductMutation = useDeleteProduct();

  // Filter products
  const filteredProducts = products?.filter(product => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      product.name.toLowerCase().includes(query) ||
      product.sku.toLowerCase().includes(query)
    );
  }) || [];

  const {
    currentPage,
    itemsPerPage,
    totalPages,
    startIndex,
    endIndex,
    handlePageChange,
    handleItemsPerPageChange
  } = usePagination({
    totalItems: filteredProducts.length,
    initialItemsPerPage: 10,
    storageKey: "products-pagination-limit"
  });

  const paginatedProducts = filteredProducts.slice(startIndex, endIndex);

  const handleNewProduct = () => {
    setEditingProduct(null);
    setIsDialogOpen(true);
  };

  const handleEditProduct = (product: any) => {
    setEditingProduct(product);
    setIsDialogOpen(true);
  };

  const handleDeleteClick = (product: any) => {
    setProductToDelete({ id: product.id, name: product.name });
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = (password: string) => {
    if (!productToDelete) return;

    deleteProductMutation.mutate(
      { id: productToDelete.id, password },
      {
        onSuccess: () => {
          setIsDeleteDialogOpen(false);
          setProductToDelete(null);
        }
      }
    );
  };

  if (isLoading) {
    return <MainLayout><div>Loading...</div></MainLayout>;
  }

  return (
    <MainLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Products</h1>
        {user?.role === 'ADMIN' && (
          <Button onClick={handleNewProduct} className="flex items-center gap-2 bg-matles-600 hover:bg-matles-700">
            <Plus className="h-4 w-4" />
            <span>Add Product</span>
          </Button>
        )}
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input 
              placeholder="Search products..." 
              className="pl-10" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button variant="outline">Filter</Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product Name</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Variants</TableHead>
              <TableHead>Status</TableHead>
              {user?.role === 'ADMIN' && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedProducts.map((product) => (
              <TableRow key={product.id}>
                <TableCell className="font-medium">{product.name}</TableCell>
                <TableCell>{product.sku}</TableCell>
                <TableCell>{product.variants.length} variants</TableCell>
                <TableCell>
                  <Badge 
                    variant={product.inStock ? "outline" : "destructive"}
                    className={product.inStock ? "bg-green-50 text-green-600 hover:bg-green-50" : ""}
                  >
                    {product.inStock ? "In Stock" : "Out of Stock"}
                  </Badge>
                </TableCell>
                {user?.role === 'ADMIN' && (
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => handleEditProduct(product)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-red-500 hover:text-red-600"
                        onClick={() => handleDeleteClick(product)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          itemsPerPage={itemsPerPage}
          onItemsPerPageChange={handleItemsPerPageChange}
          totalItems={filteredProducts.length}
          startIndex={startIndex}
          endIndex={endIndex}
        />
      </div>
      
      <ProductDialog 
        open={isDialogOpen} 
        onOpenChange={setIsDialogOpen}
        product={editingProduct}
      />
      
      <DeleteConfirmDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={handleDeleteConfirm}
        isPending={deleteProductMutation.isPending}
        title="Delete Product"
        description="This will permanently delete the product and all its variants. This action cannot be undone."
        itemName={productToDelete?.name}
      />
    </MainLayout>
  );
};

export default Products;
