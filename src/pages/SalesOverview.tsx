import { useEffect, useMemo, useState } from "react";
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
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';
import { Search, Download, DollarSign, ShoppingCart, TrendingUp, Package } from "lucide-react";
import { useDeliveryServices, useOrders, useUsers } from "@/hooks/useApi";
import { format, subDays, startOfMonth, endOfMonth, subMonths, startOfDay, endOfDay } from "date-fns";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { DateRange } from "react-day-picker";
import { Badge } from "@/components/ui/badge";

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

const SalesOverview = () => {
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const today = new Date();
    return {
      from: startOfMonth(today),
      to: endOfDay(endOfMonth(today)),
    };
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [userFilter, setUserFilter] = useState<string>("ALL");
  const [deliveryServiceFilter, setDeliveryServiceFilter] = useState<string>("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [dateFilter, setDateFilter] = useState<string>("thisMonth");
  const itemsPerPage = 10;

  const orderFilters = useMemo(() => ({
    limit: 300,
    ...(searchTerm.trim() ? { search: searchTerm.trim() } : {}),
    ...(statusFilter !== "ALL" ? { status: statusFilter } : {}),
    ...(userFilter !== "ALL" ? { salesmanId: userFilter } : {}),
    ...(deliveryServiceFilter !== "ALL" ? { deliveryServiceId: deliveryServiceFilter } : {}),
    ...(dateRange?.from && dateRange?.to
      ? {
          startDate: startOfDay(dateRange.from),
          endDate: endOfDay(dateRange.to),
        }
      : {}),
  }), [dateRange, deliveryServiceFilter, searchTerm, statusFilter, userFilter]);

  const { data: orders = [], isLoading } = useOrders(orderFilters);
  const { data: users, isLoading: isLoadingUsers } = useUsers();
  const { data: deliveryServices, isLoading: isLoadingDeliveryServices } = useDeliveryServices();

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, dateRange, statusFilter, userFilter, deliveryServiceFilter, dateFilter]);

  const filteredOrders = orders || [];

  // Handle date filter changes
  const handleDateFilterChange = (value: string) => {
    setDateFilter(value);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time part to compare only dates
    
    switch (value) {
      case "today":
        setDateRange({ 
          from: today, 
          to: new Date(today.setHours(23, 59, 59, 999)) 
        });
        break;
      case "yesterday":
        const yesterday = subDays(today, 1);
        setDateRange({ 
          from: yesterday, 
          to: new Date(yesterday.setHours(23, 59, 59, 999)) 
        });
        break;
      case "lastWeek":
        const lastWeekStart = subDays(today, 7);
        setDateRange({ 
          from: lastWeekStart, 
          to: new Date(today.setHours(23, 59, 59, 999)) 
        });
        break;
      case "lastMonth":
        const lastMonthStart = subMonths(today, 1);
        setDateRange({ 
          from: lastMonthStart, 
          to: new Date(today.setHours(23, 59, 59, 999)) 
        });
        break;
      case "thisMonth":
        setDateRange({ 
          from: startOfMonth(today), 
          to: new Date(endOfMonth(today).setHours(23, 59, 59, 999)) 
        });
        break;
      case "custom":
        setDateRange(undefined);
        break;
    }
  };

  // Calculate pagination
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / itemsPerPage));
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Calculate sales metrics
  const totalSales = filteredOrders.reduce((sum, order) => sum + Number(order.totalAmount), 0);
  const totalCommission = filteredOrders.reduce((sum, order) => sum + Number(order.commission), 0);
  const totalOrders = filteredOrders.length;
  const averageOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;

  // Prepare data for charts
  const dailySales = filteredOrders.reduce((acc: any, order) => {
    const date = format(new Date(order.createdAt), 'yyyy-MM-dd');
    if (!acc[date]) {
      acc[date] = { date, sales: 0, orders: 0 };
    }
    acc[date].sales += Number(order.totalAmount);
    acc[date].orders += 1;
    return acc;
  }, {});

  const chartData = Object.values(dailySales).sort((a: any, b: any) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const handleExport = () => {
    if (!filteredOrders.length) return;

    // Prepare CSV content
    const headers = [
      'Order ID',
      'Customer',
      'Phone',
      'City',
      'Delivery Service',
      'Date',
      'Status',
      'Salesman',
      'Total Amount',
      'Commission',
      'Products & Variants'
    ];

    const rows = filteredOrders.map(order => {
      const products = order.items?.map(item => {
        const variant = item.variant ? ` - ${item.variant.name}` : '';
        return `${item.product?.name || 'Unknown Product'}${variant} (${item.quantity || 0})`;
      }).join('\n') || 'No products';

      return [
        order.id,
        order.customerName || 'Unknown Customer',
        order.phone || 'Unknown Phone',
        order.city || 'Unknown City',
        order.deliveryService?.name || 'Unknown Service',
        format(new Date(order.createdAt), 'MMM d, yyyy'),
        order.status || 'Unknown Status',
        order.salesman?.name || 'Unknown Salesman',
        `MAD ${parseFloat(order.totalAmount?.toString() || '0').toFixed(2)}`,
        `MAD ${parseFloat(order.commission?.toString() || '0').toFixed(2)}`,
        products
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `sales-report-${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isLoading || isLoadingUsers || isLoadingDeliveryServices) {
    return <MainLayout><div>Loading...</div></MainLayout>;
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Sales Overview</h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by order ID or customer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={dateFilter} onValueChange={handleDateFilterChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select date range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="yesterday">Yesterday</SelectItem>
              <SelectItem value="lastWeek">Last 7 Days</SelectItem>
              <SelectItem value="lastMonth">Last 30 Days</SelectItem>
              <SelectItem value="thisMonth">This Month</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>
          {dateFilter === "custom" && (
            <DateRangePicker
              value={dateRange}
              onChange={setDateRange}
            />
          )}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              <SelectItem value="DELIVERED">Delivered</SelectItem>
              <SelectItem value="IN_PROCESS">In Process</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="RETURNED">Returned</SelectItem>
            </SelectContent>
          </Select>
          <Select value={userFilter} onValueChange={setUserFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by user" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Users</SelectItem>
              {users?.map((user) => (
                <SelectItem key={user.id} value={user.id.toString()}>
                  {user.name} ({user.role})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={deliveryServiceFilter} onValueChange={setDeliveryServiceFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by delivery service" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Delivery Services</SelectItem>
              {deliveryServices?.map((service) => (
                <SelectItem key={service.id} value={service.id.toString()}>
                  {service.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Sales Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
              <DollarSign className="h-4 w-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">MAD {totalSales.toFixed(2)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Commission</CardTitle>
              <TrendingUp className="h-4 w-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">MAD {totalCommission.toFixed(2)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
              <ShoppingCart className="h-4 w-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalOrders}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average Order Value</CardTitle>
              <Package className="h-4 w-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">MAD {averageOrderValue.toFixed(2)}</div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Daily Sales</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="sales" stroke="#8884d8" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Daily Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="orders" fill="#82ca9d" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Orders Table */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Delivery Service</TableHead>
                  <TableHead>Salesman</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Commission</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">#{order.id}</TableCell>
                    <TableCell>{order.customerName}</TableCell>
                    <TableCell>{order.phone || '-'}</TableCell>
                    <TableCell>{order.city || '-'}</TableCell>
                    <TableCell>{order.deliveryService?.name || '-'}</TableCell>
                    <TableCell>{order.salesman?.name || 'Unknown'}</TableCell>
                    <TableCell>{format(new Date(order.createdAt), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>MAD {Number(order.totalAmount).toFixed(2)}</TableCell>
                    <TableCell>MAD {Number(order.commission).toFixed(2)}</TableCell>
                    <TableCell>
                      {getStatusBadge(order.status)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Pagination */}
            <div className="flex items-center justify-end space-x-2 py-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
};

export default SalesOverview; 
