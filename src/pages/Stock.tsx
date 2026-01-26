// src/pages/Stock.tsx
import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Input } from "@/components/ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Search, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useStock } from "@/hooks/useApi";
import { usePagination } from "@/hooks/usePagination";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { StockOperationDialog } from "@/components/stock/StockOperationDialog";
import { StockHistorySheet } from "@/components/stock/StockHistorySheet";
import { Button } from "@/components/ui/button";
import { History, RefreshCw } from "lucide-react";

const Stock = () => {
  const [stockFilter, setStockFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedVariant, setSelectedVariant] = useState<any>(null);
  const [isOperationDialogOpen, setIsOperationDialogOpen] = useState(false);
  const [isHistorySheetOpen, setIsHistorySheetOpen] = useState(false);
  const { data: stockData, isLoading, error, refetch, isRefetching } = useStock();

  // Get unique products for the filter dropdown
  const uniqueProducts: string[] = Array.from(new Set(stockData?.map(item => item.product) || []));

  const getStockStatus = (level: number) => {
    if (level <= 10) {
      return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Low Stock</Badge>;
    } else if (level <= 25) {
      return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Medium Stock</Badge>;
    } else {
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">In Stock</Badge>;
    }
  };

  // Calculate total stock metrics
  const totalInitialStock = stockData?.reduce((sum, item) => sum + (item.initialStock || 0), 0) || 0;
  const totalCurrentStock = stockData?.reduce((sum, item) => sum + (item.currentStock || 0), 0) || 0;
  const totalOrdered = stockData?.reduce((sum, item) => sum + (item.orderedQty || 0), 0) || 0;
  const totalReturned = stockData?.reduce((sum, item) => sum + (item.returnedQty || 0), 0) || 0;

  // Filter stock data based on search and filter
  const filteredStock = stockData?.filter(item => {
    // Search filter
    const matchesSearch = searchQuery === "" || 
                         item.product.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         item.sku.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Product filter
    const matchesProduct = stockFilter === "all" || item.product === stockFilter;
    
    return matchesSearch && matchesProduct;
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
    totalItems: filteredStock.length,
    initialItemsPerPage: 10,
    storageKey: "stock-pagination-limit"
  });

  const paginatedStock = filteredStock.slice(startIndex, endIndex);

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-lg">Loading stock data...</div>
        </div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-lg text-red-600">Error loading stock data</div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Stock Management</h1>
        <Button 
          variant="outline" 
          onClick={() => refetch()}
          disabled={isRefetching}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Initial Stock</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalInitialStock} units</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Current Stock</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCurrentStock} units</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Ordered</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalOrdered} units</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Returned</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalReturned} units</div>
          </CardContent>
        </Card>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input 
              placeholder="Search by product or SKU..." 
              className="pl-10" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Select 
            value={stockFilter}
            onValueChange={setStockFilter}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by product" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Products</SelectItem>
              {uniqueProducts.map(product => (
                <SelectItem key={product} value={product}>{product}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Variant</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Initial Stock</TableHead>
              <TableHead className="text-right">Ordered</TableHead>
              <TableHead className="text-right">Returned</TableHead>
              <TableHead className="text-right">Current Stock</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedStock.map((item) => (
              <TableRow key={`${item.product}-${item.variant}-${item.sku}`}>
                <TableCell className="font-medium">{item.product}</TableCell>
                <TableCell>{item.variant}</TableCell>
                <TableCell>{item.sku}</TableCell>
                <TableCell className="text-right">{item.initialStock || 0}</TableCell>
                <TableCell className="text-right">{item.orderedQty || 0}</TableCell>
                <TableCell className="text-right">{item.returnedQty || 0}</TableCell>
                <TableCell className="text-right font-medium">{item.currentStock || 0}</TableCell>
                <TableCell>{getStockStatus(item.currentStock || 0)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        setSelectedVariant(item);
                        setIsHistorySheetOpen(true);
                      }}
                      title="View History"
                    >
                      <History className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="default" 
                      size="sm"
                      onClick={() => {
                        setSelectedVariant(item);
                        setIsOperationDialogOpen(true);
                      }}
                    >
                      <Plus className="h-4 w-4 mr-1" /> Operations
                    </Button>
                  </div>
                </TableCell>
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
          totalItems={filteredStock.length}
          startIndex={startIndex}
          endIndex={endIndex}
        />
      </div>
      
      <StockOperationDialog 
        open={isOperationDialogOpen} 
        onOpenChange={setIsOperationDialogOpen}
        variant={selectedVariant}
      />
      
      <StockHistorySheet
        open={isHistorySheetOpen}
        onOpenChange={setIsHistorySheetOpen}
        variant={selectedVariant}
      />
    </MainLayout>
  );
};

export default Stock;