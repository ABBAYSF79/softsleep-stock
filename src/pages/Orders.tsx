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
  Calendar,
  TrendingUp,
  PackageCheck,
  Clock,
  AlertTriangle,
  RotateCw
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { OrderDialog } from "@/components/orders/OrderDialog";
import { OrderTicketDialog } from "@/components/orders/OrderTicketDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useOrders } from "@/hooks/useApi";
import { useAuth } from "@/contexts/AuthContext";
import { ORDER_STATUSES, formatPrice } from "@/utils/order-utils";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { TrackingCodeCell } from "@/components/orders/TrackingCodeCell";
import { usePagination } from "@/hooks/usePagination";
import { PaginationControls } from "@/components/ui/pagination-controls";

const Orders = () => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [viewingOrder, setViewingOrder] = useState<any>(null);
  const [isTicketOpen, setIsTicketOpen] = useState(false);
  const [ticketOrder, setTicketOrder] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [salesmanFilter, setSalesmanFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<"all" | "today">("all");
  
  const { data: orders, isLoading, error, refetch, isRefetching } = useOrders();
  const { user } = useAuth();

  useEffect(() => {
    if (error) {
      console.error("Error loading orders:", error);
    }
  }, [error]);

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
    // This function is called after successful status update
    console.log(`Order ${orderId} status updated to ${newStatus}`);
  };

  const handlePrintOrder = (order: any) => {
    setTicketOrder(order);
    setIsTicketOpen(true);
  };

  // Get unique salesmen from orders
  const uniqueSalesmen = Array.from(new Set(orders?.map(order => order.user?.name).filter(Boolean) || [])) as string[];

  // Statistics Calculation
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const oneWeekAgo = new Date(today);
  oneWeekAgo.setDate(today.getDate() - 7);
  
  const oneMonthAgo = new Date(today);
  oneMonthAgo.setDate(today.getDate() - 30);

  const todayOrdersCount = orders?.filter(order => {
    const orderDate = new Date(order.createdAt);
    orderDate.setHours(0, 0, 0, 0);
    return orderDate.getTime() === today.getTime();
  }).length || 0;

  const totalLastWeek = orders?.filter(order => {
    const orderDate = new Date(order.createdAt);
    return orderDate >= oneWeekAgo;
  }).length || 0;

  const deliveredLastWeek = orders?.filter(order => {
    const orderDate = new Date(order.createdAt);
    return order.status === 'DELIVERED' && orderDate >= oneWeekAgo;
  }).length || 0;

  const totalLastMonth = orders?.filter(order => {
    const orderDate = new Date(order.createdAt);
    return orderDate >= oneMonthAgo;
  }).length || 0;

  const deliveredLastMonth = orders?.filter(order => {
    const orderDate = new Date(order.createdAt);
    return order.status === 'DELIVERED' && orderDate >= oneMonthAgo;
  }).length || 0;

  const totalOrders = orders?.length || 0;
  const deliveredOrders = orders?.filter(order => order.status === 'DELIVERED').length || 0;
  const deliveredRate = totalOrders > 0 ? ((deliveredOrders / totalOrders) * 100).toFixed(1) : "0.0";

  // Filter orders based on selected status, search term, salesman, and date
  const filteredOrders = orders?.filter(order => {
    const matchesStatus = statusFilter === "all" || order.status === statusFilter.toUpperCase();
    const matchesSearch = searchTerm === "" || 
      order.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.trackingCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.id.toString().includes(searchTerm);
    const matchesSalesman = salesmanFilter === "all" || order.user?.name === salesmanFilter;
    
    let matchesDate = true;
    if (dateFilter === "today") {
      const orderDate = new Date(order.createdAt);
      orderDate.setHours(0, 0, 0, 0);
      matchesDate = orderDate.getTime() === today.getTime();
    } else if (dateFilter === "last7days") {
      const orderDate = new Date(order.createdAt);
      matchesDate = orderDate >= oneWeekAgo;
    } else if (dateFilter === "last30days") {
      const orderDate = new Date(order.createdAt);
      matchesDate = orderDate >= oneMonthAgo;
    }
    
    return matchesStatus && matchesSearch && matchesSalesman && matchesDate;
  }) || [];

  // Calculate pagination
  const {
    currentPage,
    itemsPerPage,
    totalPages,
    startIndex,
    endIndex,
    handlePageChange,
    handleItemsPerPageChange
  } = usePagination({
    totalItems: filteredOrders.length,
    initialItemsPerPage: 10,
    storageKey: "orders-pagination-limit"
  });

  const paginatedOrders = filteredOrders.slice(startIndex, endIndex);

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-lg">Loading orders...</div>
        </div>
      </MainLayout>
    );
  }

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
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card 
            className={`cursor-pointer transition-colors hover:bg-accent/50 ${dateFilter === 'today' ? 'bg-accent border-primary' : ''}`}
            onClick={() => setDateFilter(prev => prev === 'today' ? 'all' : 'today')}
          >
            <CardContent className="p-4 flex flex-col items-center justify-center space-y-1">
              <div className="flex items-center space-x-2 text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wider">Today</span>
              </div>
              <div className="text-xl font-bold">{todayOrdersCount}</div>
            </CardContent>
          </Card>

          <Card 
            className={`cursor-pointer transition-colors hover:bg-accent/50 ${dateFilter === 'last7days' ? 'bg-accent border-primary' : ''}`}
            onClick={() => setDateFilter(prev => prev === 'last7days' ? 'all' : 'last7days')}
          >
            <CardContent className="p-4 flex flex-col items-center justify-center space-y-1">
              <div className="flex items-center space-x-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wider">Delivered (7d)</span>
              </div>
              <div className="text-xl font-bold text-blue-600">
                {deliveredLastWeek} <span className="text-sm text-muted-foreground font-normal">/ {totalLastWeek}</span>
              </div>
            </CardContent>
          </Card>

          <Card
            className={`cursor-pointer transition-colors hover:bg-accent/50 ${dateFilter === 'last30days' ? 'bg-accent border-primary' : ''}`}
            onClick={() => setDateFilter(prev => prev === 'last30days' ? 'all' : 'last30days')}
          >
            <CardContent className="p-4 flex flex-col items-center justify-center space-y-1">
              <div className="flex items-center space-x-2 text-muted-foreground">
                <PackageCheck className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wider">Delivered (30d)</span>
              </div>
              <div className="text-xl font-bold text-indigo-600">
                {deliveredLastMonth} <span className="text-sm text-muted-foreground font-normal">/ {totalLastMonth}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 flex flex-col items-center justify-center space-y-1">
              <div className="flex items-center space-x-2 text-muted-foreground">
                <TrendingUp className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wider">Success Rate</span>
              </div>
              <div className="text-xl font-bold text-green-600">{deliveredRate}%</div>
            </CardContent>
          </Card>
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
        </div>

        <Table>
          <TableHeader>
            <TableRow>
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
            {paginatedOrders.map((order) => (
              <TableRow key={order.id}>
                <TableCell className="font-medium">{order.id}</TableCell>
                <TableCell>{order.customerName}</TableCell>
                <TableCell>{order.phone || '-'}</TableCell>
                <TableCell>{new Date(order.createdAt).toLocaleDateString()}</TableCell>
                <TableCell><OrderStatusBadge status={order.status} /></TableCell>
                <TableCell>
                  <TrackingCodeCell order={order} />
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
          totalPages={totalPages}
          onPageChange={handlePageChange}
          itemsPerPage={itemsPerPage}
          onItemsPerPageChange={handleItemsPerPageChange}
          totalItems={filteredOrders.length}
          startIndex={startIndex}
          endIndex={endIndex}
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
    </MainLayout>
  );
};

export default Orders;