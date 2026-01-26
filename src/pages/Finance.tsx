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
  Search,
  Eye,
  CheckCircle2,
  XCircle,
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Truck,
  Download
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { OrderDialog } from "@/components/orders/OrderDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOrders, useUpdateOrderPaymentStatus } from "@/hooks/useApi";
import { useAuth } from "@/contexts/AuthContext";
import { format, subDays, startOfMonth, endOfMonth, subMonths, startOfDay, endOfDay } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateRangePicker } from "@/components/ui/date-range-picker";

const getStatusBadge = (status: string) => {
  switch (status) {
    case "DELIVERED":
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Delivered</Badge>;
    case "IN_PROCESS":
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">In Process</Badge>;
    case "PENDING":
      return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Pending</Badge>;
    case "RETURNED":
      return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Returned</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
};

const getPaymentBadge = (isPaid: boolean) => {
  return isPaid ? (
    <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Paid</Badge>
  ) : (
    <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Not Paid</Badge>
  );
};

export default function Finance() {
  const [searchTerm, setSearchTerm] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<"ALL" | "PAID" | "UNPAID">("ALL");
  const [deliveryServiceFilter, setDeliveryServiceFilter] = useState<string>("ALL");
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { data: orders, isLoading } = useOrders();
  const updatePaymentStatus = useUpdateOrderPaymentStatus();
  const { user } = useAuth();

  // Filter orders based on search term, payment status, and delivery service
  const filteredOrders = orders?.filter(order => {
    const matchesSearch = 
      order.id.toString().includes(searchTerm) ||
      order.customerName.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesPayment = paymentFilter === "ALL" || 
      (paymentFilter === "PAID" && order.isPaid) || 
      (paymentFilter === "UNPAID" && !order.isPaid);
    
    const matchesDeliveryService = deliveryServiceFilter === "ALL" || 
      order.deliveryService?.name === deliveryServiceFilter;
    
    // Only show delivered orders
    const isDelivered = order.status === "DELIVERED";
    
    return matchesSearch && matchesPayment && matchesDeliveryService && isDelivered;
  }) || [];

  // Get unique delivery services
  const uniqueDeliveryServices = Array.from(new Set(orders?.map(order => order.deliveryService?.name).filter(Boolean) || []));

  // Calculate finance metrics
  const totalRevenue = filteredOrders?.reduce((sum, order) => sum + Number(order.totalAmount), 0) || 0;
  const totalCommission = filteredOrders?.reduce((sum, order) => sum + Number(order.commission), 0) || 0;
  const totalOrders = filteredOrders?.length || 0;
  const paidOrders = filteredOrders?.filter(order => order.isPaid).length || 0;
  const paidPercentage = totalOrders > 0 ? (paidOrders / totalOrders) * 100 : 0;

  const handleViewOrder = (order: any) => {
    setSelectedOrder(order);
    setIsDialogOpen(true);
  };

  const handleUpdatePaymentStatus = async (orderId: number, isPaid: boolean) => {
    try {
      await updatePaymentStatus.mutateAsync({ id: orderId, isPaid });
    } catch (error) {
      console.error('Error updating payment status:', error);
    }
  };

  const handleExport = () => {
    if (!filteredOrders?.length) return;

    // Prepare CSV content
    const headers = [
      'Order ID',
      'Customer',
      'Date',
      'Status',
      'Payment Status',
      'Delivery Service',
      'Total Amount',
      'Commission'
    ];

    const rows = filteredOrders.map(order => [
      order.id,
      order.customerName,
      format(new Date(order.createdAt), 'MMM d, yyyy'),
      order.status,
      order.isPaid ? 'Paid' : 'Unpaid',
      order.deliveryService?.name || 'N/A',
      `MAD ${parseFloat(order.totalAmount.toString()).toFixed(2)}`,
      `MAD ${parseFloat(order.commission.toString()).toFixed(2)}`
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `finance-report-${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Finance Management</h1>
          <Button onClick={handleExport} className="gap-2">
            <Download className="h-4 w-4" />
            Export Data
          </Button>
        </div>

        {/* Dashboard Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">MAD {totalRevenue.toFixed(2)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Commission</CardTitle>
              <TrendingUp className="h-4 w-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">MAD {totalCommission.toFixed(2)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
              <ShoppingCart className="h-4 w-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalOrders}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Paid Orders</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{paidPercentage.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">{paidOrders} of {totalOrders} orders</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
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
          <Select 
            value={paymentFilter} 
            onValueChange={(value: "ALL" | "PAID" | "UNPAID") => setPaymentFilter(value)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Payment Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Payments</SelectItem>
              <SelectItem value="PAID">Paid</SelectItem>
              <SelectItem value="UNPAID">Unpaid</SelectItem>
            </SelectContent>
          </Select>
          <Select 
            value={deliveryServiceFilter} 
            onValueChange={(value: string) => setDeliveryServiceFilter(value)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Delivery Service" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Delivery Services</SelectItem>
              {uniqueDeliveryServices.map(service => (
                <SelectItem key={service} value={service}>{service}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Orders Table */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Payment Status</TableHead>
                <TableHead>Delivery Service</TableHead>
                <TableHead>Total Amount</TableHead>
                <TableHead>Commission</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders?.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>#{order.id}</TableCell>
                  <TableCell>{order.customerName}</TableCell>
                  <TableCell>{format(new Date(order.createdAt), 'MMM d, yyyy')}</TableCell>
                  <TableCell>{getStatusBadge(order.status)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getPaymentBadge(order.isPaid)}
                      {!order.isPaid && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleUpdatePaymentStatus(order.id, true)}
                          className="h-8 w-8 p-0"
                        >
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        </Button>
                      )}
                      {order.isPaid && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleUpdatePaymentStatus(order.id, false)}
                          className="h-8 w-8 p-0"
                        >
                          <XCircle className="h-4 w-4 text-red-600" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Truck className="h-4 w-4 text-gray-500" />
                      <span>{order.deliveryService?.name || 'N/A'}</span>
                    </div>
                  </TableCell>
                  <TableCell>MAD {parseFloat(order.totalAmount.toString()).toFixed(2)}</TableCell>
                  <TableCell>MAD {parseFloat(order.commission.toString()).toFixed(2)}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleViewOrder(order)}
                      className="h-8 w-8 p-0"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {selectedOrder && (
        <OrderDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          order={selectedOrder}
        />
      )}
    </MainLayout>
  );
} 