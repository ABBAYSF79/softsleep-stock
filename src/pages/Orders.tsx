// src/pages/Orders.tsx
import { useState, useEffect } from "react";
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
  Search,
  Eye,
  Plus,
  Printer,
  RotateCw,
  Trash2,
  Copy,
  ScanBarcode,
  Download,
  FileText,
  ClipboardCopy
} from "lucide-react";
import { OrderDialog } from "@/components/orders/OrderDialog";
import { OrderTicketDialog } from "@/components/orders/OrderTicketDialog";
import { BarcodeDialog } from "@/components/orders/BarcodeDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePaginatedOrders, useOrders, useDeleteOrder, useDeliveryServices, useUsers } from "@/hooks/useApi";
import { ORDER_STATUSES, formatPrice } from "@/utils/order-utils";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { TrackingCodeCell } from "@/components/orders/TrackingCodeCell";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { useDebounce } from "@/hooks/useDebounce";
import { DeleteConfirmDialog } from "@/components/common/DeleteConfirmDialog";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { exportOrdersToExcel } from "@/utils/excel-export";
import { exportOrdersToPdf } from "@/utils/pdf-export";
import { formatOrdersToText } from "@/utils/text-export";

const Orders = () => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [viewingOrder, setViewingOrder] = useState<any>(null);
  const [isTicketOpen, setIsTicketOpen] = useState(false);
  const [ticketOrder, setTicketOrder] = useState<any>(null);
  
  // Barcode Dialog State
  const [isBarcodeOpen, setIsBarcodeOpen] = useState(false);
  const [barcodeTrackingCode, setBarcodeTrackingCode] = useState("");

  // Multi-select state
  const [selectedOrders, setSelectedOrders] = useState<number[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  // Delete Dialog State
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingOrder, setDeletingOrder] = useState<any>(null);

  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [salesmanFilter, setSalesmanFilter] = useState("all");
  const [deliveryServiceFilter, setDeliveryServiceFilter] = useState("all");
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  // Debounce search term to avoid too many requests
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const { data: users = [] } = useUsers();
  const { data: deliveryServices = [] } = useDeliveryServices();
  const uniqueSalesmen = users
    .filter((u: any) => u.active !== false)
    .map((u: any) => u.name)
    .sort();

  // Fetch paginated orders
  const { 
    data: ordersData, 
    isLoading, 
    error, 
    refetch, 
    isRefetching 
  } = usePaginatedOrders({
    page: currentPage,
    limit: itemsPerPage,
    status: statusFilter,
    search: debouncedSearchTerm,
    salesman: salesmanFilter,
    deliveryService: deliveryServiceFilter
  });
  
  // Delete mutation
  const deleteOrderMutation = useDeleteOrder();

  useEffect(() => {
    if (error) {
      console.error("Error loading orders:", error);
    }
  }, [error]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, debouncedSearchTerm, salesmanFilter, deliveryServiceFilter]);

  const handleViewOrder = (order: any) => {
    setViewingOrder(order);
    setIsDialogOpen(true);
  };

  const handleNewOrder = () => {
    setViewingOrder(null);
    setIsDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      setViewingOrder(null);
    }
    setIsDialogOpen(open);
  };

  const handleStatusUpdate = (orderId: number, newStatus: string) => {
    console.log(`Order ${orderId} status updated to ${newStatus}`);
    refetch(); // Refetch orders to show updated status
  };

  const handlePrintOrder = (order: any) => {
    setTicketOrder(order);
    setIsTicketOpen(true);
  };
  
  const handleDeleteClick = (order: any) => {
    setDeletingOrder(order);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = (password: string) => {
    if (deletingOrder) {
      deleteOrderMutation.mutate(
        { id: deletingOrder.id, password },
        {
          onSuccess: () => {
            setIsDeleteDialogOpen(false);
            setDeletingOrder(null);
            // Refetch is handled by the hook
          }
        }
      );
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    setSelectedOrders([]); // Clear selection on page change
  };

  const handleItemsPerPageChange = (items: number) => {
    setItemsPerPage(items);
    setCurrentPage(1);
    setSelectedOrders([]); // Clear selection on page change
  };

  const handleSelectOrder = (orderId: number) => {
    setSelectedOrders(prev => {
      if (prev.includes(orderId)) {
        return prev.filter(id => id !== orderId);
      } else {
        return [...prev, orderId];
      }
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedOrders(orders.map((o: any) => o.id));
    } else {
      setSelectedOrders([]);
    }
  };

  const handleExport = async () => {
    if (selectedOrders.length === 0) return;
    
    setIsExporting(true);
    try {
      const ordersToExport = orders.filter((o: any) => selectedOrders.includes(o.id));
      await exportOrdersToExcel(ordersToExport);
      toast.success(`Exported ${ordersToExport.length} orders successfully`);
      setSelectedOrders([]);
    } catch (error) {
      console.error("Export failed:", error);
      toast.error("Failed to export orders");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPdf = () => {
    if (selectedOrders.length === 0) return;
    
    setIsExporting(true);
    try {
      const ordersToExport = orders.filter((o: any) => selectedOrders.includes(o.id));
      exportOrdersToPdf(ordersToExport);
      toast.success(`Exported ${ordersToExport.length} orders to PDF successfully`);
      setSelectedOrders([]);
    } catch (error) {
      console.error("PDF Export failed:", error);
      toast.error("Failed to export PDF");
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopySelected = async () => {
    if (selectedOrders.length === 0) return;

    try {
      const ordersToExport = orders.filter((o: any) => selectedOrders.includes(o.id));
      const formattedText = formatOrdersToText(ordersToExport);
      
      await navigator.clipboard.writeText(formattedText);
      toast.success(`Copied ${ordersToExport.length} orders to clipboard`);
      setSelectedOrders([]);
    } catch (error) {
      console.error("Copy failed:", error);
      toast.error("Failed to copy orders");
    }
  };

  const orders = ordersData?.data || [];
  const meta = ordersData?.meta || { total: 0, page: 1, limit: 10, totalPages: 0 };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-lg">Loading orders...</div>
        </div>
      </MainLayout>
    );
  }

  // Show a toast or small indicator when background fetching happens
  // We can't return a full loader here because it would hide the content during pagination
  
  if (error) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center h-[50vh] gap-4">
          <div className="text-lg text-red-600 font-medium">Error loading orders</div>
          <p className="text-gray-500">{(error as any)?.response?.data?.error || (error as Error).message}</p>
          <Button 
            onClick={() => refetch()} 
            variant="outline"
            disabled={isRefetching}
          >
            {isRefetching ? "Retrying..." : "Try Again"}
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Orders</h1>
          <div className="flex items-center gap-4">
            <Button onClick={handleNewOrder} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Order
            </Button>
            <Button 
              variant="outline" 
              size="icon"
              onClick={() => refetch()}
              disabled={isRefetching}
              title="Refresh orders"
            >
              <RotateCw className={`h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
            </Button>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search orders..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
            {selectedOrders.length > 0 && (
              <div className="flex gap-2">
                <Button 
                  onClick={handleExport} 
                  disabled={isExporting}
                  variant="outline"
                  className="gap-2 border-green-600 text-green-600 hover:bg-green-50"
                >
                  <Download className="h-4 w-4" />
                  Excel ({selectedOrders.length})
                </Button>
                <Button 
                  onClick={handleExportPdf} 
                  disabled={isExporting}
                  variant="outline"
                  className="gap-2 border-red-600 text-red-600 hover:bg-red-50"
                >
                  <FileText className="h-4 w-4" />
                  PDF ({selectedOrders.length})
                </Button>
                <Button 
                  onClick={handleCopySelected} 
                  variant="outline"
                  className="gap-2 border-blue-600 text-blue-600 hover:bg-blue-50"
                >
                  <ClipboardCopy className="h-4 w-4" />
                  Copy ({selectedOrders.length})
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {Object.values(ORDER_STATUSES).map((status) => (
                <SelectItem key={status.value} value={status.value.toLowerCase()}>
                  {status.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={salesmanFilter} onValueChange={setSalesmanFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by salesman" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Salesmen</SelectItem>
              {uniqueSalesmen.map((salesman: string) => (
                <SelectItem key={salesman} value={salesman}>
                  {salesman}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={deliveryServiceFilter} onValueChange={setDeliveryServiceFilter}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Filter by delivery service" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Delivery Services</SelectItem>
              {deliveryServices.map((service: any) => (
                <SelectItem key={service.id} value={service.name}>
                  {service.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">
                <Checkbox 
                  checked={selectedOrders.length === orders.length && orders.length > 0}
                  onCheckedChange={handleSelectAll}
                />
              </TableHead>
              <TableHead>Order #</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Tracking</TableHead>
              <TableHead>City</TableHead>
              <TableHead>Delivery Service</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order: any) => (
              <TableRow key={order.id} className={selectedOrders.includes(order.id) ? "bg-muted/50" : ""}>
                <TableCell>
                  <Checkbox 
                    checked={selectedOrders.includes(order.id)}
                    onCheckedChange={() => handleSelectOrder(order.id)}
                  />
                </TableCell>
                <TableCell className="font-medium">{order.id}</TableCell>
                <TableCell>{order.customerName}</TableCell>
                <TableCell>{order.phone || '-'}</TableCell>
                <TableCell>{new Date(order.createdAt).toLocaleDateString()}</TableCell>
                <TableCell><OrderStatusBadge status={order.status} /></TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <TrackingCodeCell order={order} />
                    {order.trackingCode && (
                      <>
                        <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(order.trackingCode);
                              toast.success("Tracking code copied!");
                          }}
                        >
                          <Copy className="h-3 w-3 text-muted-foreground" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Copy tracking code</p>
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            setBarcodeTrackingCode(order.trackingCode);
                            setIsBarcodeOpen(true);
                          }}
                        >
                          <ScanBarcode className="h-3 w-3 text-muted-foreground" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>View Barcode</p>
                      </TooltipContent>
                    </Tooltip>
                  </>
                )}
              </div>
            </TableCell>
                <TableCell>{order.city || '-'}</TableCell>
                <TableCell>{order.deliveryService?.name || '-'}</TableCell>
                <TableCell className="text-right">MAD {formatPrice(order.totalAmount)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handlePrintOrder(order)}
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Print/Download Ticket</p>
                      </TooltipContent>
                    </Tooltip>
                    
                    {isAdmin && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            className="text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={() => handleDeleteClick(order)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Delete Order</p>
                        </TooltipContent>
                      </Tooltip>
                    )}

                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => handleViewOrder(order)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Pagination */}
        <PaginationControls
          currentPage={currentPage}
          totalPages={meta.totalPages}
          onPageChange={handlePageChange}
          itemsPerPage={itemsPerPage}
          onItemsPerPageChange={handleItemsPerPageChange}
          totalItems={meta.total}
          startIndex={(currentPage - 1) * itemsPerPage}
          endIndex={Math.min(currentPage * itemsPerPage, meta.total)}
        />
      </div>
      
      <OrderDialog 
        open={isDialogOpen} 
        onOpenChange={handleDialogClose}
        order={viewingOrder}
        onStatusUpdate={handleStatusUpdate}
      />
      
      <OrderTicketDialog 
        open={isTicketOpen} 
        onOpenChange={setIsTicketOpen}
        order={ticketOrder}
      />

      <BarcodeDialog
        open={isBarcodeOpen}
        onOpenChange={setIsBarcodeOpen}
        trackingCode={barcodeTrackingCode}
      />

      <DeleteConfirmDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
        title="Delete Order"
        description="Are you sure you want to delete this order? This will remove all associated data and restore stock if applicable. This action cannot be undone."
        itemName={`Order #${deletingOrder?.id} - ${deletingOrder?.customerName}`}
        isPending={deleteOrderMutation.isPending}
      />
    </MainLayout>
  );
};

export default Orders;