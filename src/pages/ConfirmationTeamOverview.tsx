import { useDeferredValue, useEffect, useMemo, useState } from "react";
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
import { Search, Download, Users, UserCheck, UserX, Phone, Mail, DollarSign, ShoppingCart, TrendingUp, Package } from "lucide-react";
import { useUsers, useOrders } from "@/hooks/useApi";
import { format, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subMonths, startOfDay, endOfDay } from "date-fns";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { DateRange } from "react-day-picker";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

interface ConfirmationUser {
  id: number;
  name: string;
  phone?: string;
  email?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  salesman?: {
    id: number;
    name: string;
    email: string;
  };
  linkedSalesUser?: {
    id: number;
    name: string;
    email: string;
  };
  linkedSalesUserId?: number;
}

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

const ConfirmationTeamOverview = () => {
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const today = new Date();
    return {
      from: startOfMonth(today),
      to: endOfDay(endOfMonth(today)),
    };
  });
  const [dateFilter, setDateFilter] = useState<string>("thisMonth");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [userFilter, setUserFilter] = useState<string>("ALL");
  const [confirmationUserFilter, setConfirmationUserFilter] = useState<string>("ALL");
  const [productFilter, setProductFilter] = useState<string>("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const deferredSearchTerm = useDeferredValue(searchTerm);

  const orderFilters = useMemo(() => ({
    ...(deferredSearchTerm.trim() ? { search: deferredSearchTerm.trim() } : {}),
    ...(statusFilter !== "ALL" ? { status: statusFilter } : {}),
    ...(userFilter !== "ALL" ? { salesmanId: userFilter } : {}),
    ...(confirmationUserFilter !== "ALL" ? { confirmationUserId: confirmationUserFilter } : {}),
    ...(productFilter !== "ALL" ? { productId: productFilter } : {}),
    ...(dateRange?.from && dateRange?.to
      ? {
          startDate: startOfDay(dateRange.from),
          endDate: endOfDay(dateRange.to),
        }
      : {}),
  }), [confirmationUserFilter, dateRange, deferredSearchTerm, productFilter, statusFilter, userFilter]);

  const { data: users, isLoading: isLoadingUsers } = useUsers();
  const { data: orders, isLoading: isLoadingOrders } = useOrders(orderFilters);
  const itemsPerPage = 10;
  const { user } = useAuth();

  // Fetch confirmation users
  const { data: confirmationUsers = [], isLoading: isLoadingConfirmationUsers } = useQuery<ConfirmationUser[]>({
    queryKey: ["confirmationUsers", user?.id, user?.role],
    queryFn: async () => {
      const response = await api.get(
        user?.role === "ADMIN" 
          ? "/confirmation-users"
          : "/confirmation-users/my-team",
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        }
      );
      return response.data || [];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Filter orders based on search term, date range, status, user, and confirmation user
  const filteredOrders = orders || [];

  const productOptions = useMemo(() => {
    const map = new Map<string, string>();
    filteredOrders.forEach((order: any) => {
      const items = Array.isArray(order?.items) ? order.items : Array.isArray(order?.orderItems) ? order.orderItems : [];
      items.forEach((item: any) => {
        const pid = item?.productId ?? item?.variant?.productId ?? item?.product?.id ?? item?.variant?.product?.id;
        const pname = item?.product?.name ?? item?.variant?.product?.name ?? item?.productName ?? item?.variant?.productName;
        if (pid != null && pname) map.set(String(pid), String(pname));
      });
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredOrders]);

  const confirmationUserOptions = useMemo(() => {
    const selectedSalesUserId = userFilter === "ALL" ? null : Number(userFilter);

    return confirmationUsers
      .filter((confirmationUser) => {
        if (selectedSalesUserId === null) {
          return true;
        }

        return (
          confirmationUser.salesman?.id === selectedSalesUserId ||
          confirmationUser.linkedSalesUserId === selectedSalesUserId ||
          confirmationUser.linkedSalesUser?.id === selectedSalesUserId
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [confirmationUsers, userFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [dateFilter, dateRange, deferredSearchTerm, productFilter, statusFilter, userFilter, confirmationUserFilter]);

  useEffect(() => {
    if (
      confirmationUserFilter !== "ALL" &&
      !confirmationUserOptions.some((confirmationUser) => confirmationUser.id.toString() === confirmationUserFilter)
    ) {
      setConfirmationUserFilter("ALL");
    }
  }, [confirmationUserFilter, confirmationUserOptions]);

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

  // Handle user filter change
  const handleUserFilterChange = (value: string) => {
    setUserFilter(value);
    setConfirmationUserFilter("ALL"); // Reset confirmation user filter when user changes
  };

  // Calculate pagination
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / itemsPerPage));
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Calculate metrics
  const totalSales = filteredOrders.reduce((sum, order) => sum + Number(order.totalAmount), 0);
  const totalCommission = filteredOrders.reduce((sum, order) => sum + Number(order.commission), 0);
  const totalOrders = filteredOrders.length;
  const averageOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;
  
  // Get unique confirmation users from filtered orders
  const uniqueConfirmationUsers = Array.from(
    new Set(filteredOrders.map(order => order.confirmationUser?.id).filter(Boolean))
  ).length;

  const handleExport = () => {
    if (!filteredOrders?.length) return;

    // Prepare CSV content
    const headers = [
      'Order ID',
      'Customer',
      'Confirmation User',
      'Salesman',
      'Date',
      'Amount',
      'Commission',
      'Status'
    ];

    const rows = filteredOrders.map(order => [
      order.id,
      order.customerName || 'Unknown Customer',
      order.confirmationUser?.name || 'No confirmation user',
      order.user?.name || 'Unknown Salesman',
      format(new Date(order.createdAt), 'MMM d, yyyy'),
      `MAD ${parseFloat(order.totalAmount?.toString() || '0').toFixed(2)}`,
      `MAD ${parseFloat(order.commission?.toString() || '0').toFixed(2)}`,
      order.status || 'Unknown Status'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `confirmation-team-orders-${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isLoadingConfirmationUsers || isLoadingUsers || isLoadingOrders) {
    return <MainLayout><div>Loading...</div></MainLayout>;
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Confirmation Team Overview</h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by order ID, customer, or confirmation user..."
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
          <Select value={productFilter} onValueChange={setProductFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by product" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Products</SelectItem>
              {productOptions.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={userFilter} onValueChange={handleUserFilterChange}>
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
          <Select
            value={confirmationUserFilter}
            onValueChange={setConfirmationUserFilter}
            disabled={isLoadingConfirmationUsers || confirmationUserOptions.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder="Filter by confirmation user" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Confirmation Users</SelectItem>
              {confirmationUserOptions.map((confirmationUser) => (
                <SelectItem key={confirmationUser.id} value={confirmationUser.id.toString()}>
                  {confirmationUser.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
              <CardTitle className="text-sm font-medium">Confirmation Users</CardTitle>
              <Users className="h-4 w-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{uniqueConfirmationUsers}</div>
            </CardContent>
          </Card>
        </div>

        {/* Orders Table */}
        <Card>
          <CardHeader>
            <CardTitle>Orders by Confirmation Users</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Confirmation User</TableHead>
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
                    <TableCell>
                      {order.confirmationUser ? (
                        <div className="space-y-1">
                          <div className="font-medium">{order.confirmationUser.name}</div>
                          {order.confirmationUser.phone && (
                            <div className="flex items-center gap-1 text-sm text-gray-600">
                              <Phone className="h-3 w-3" />
                              {order.confirmationUser.phone}
                            </div>
                          )}
                          {order.confirmationUser.email && (
                            <div className="flex items-center gap-1 text-sm text-gray-600">
                              <Mail className="h-3 w-3" />
                              {order.confirmationUser.email}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">No confirmation user</span>
                      )}
                    </TableCell>
                    <TableCell>{order.user?.name || 'Unknown'}</TableCell>
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

export default ConfirmationTeamOverview;
