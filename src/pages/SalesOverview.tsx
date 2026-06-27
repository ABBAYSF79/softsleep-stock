import { useCallback, useEffect, useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Search,
  Download,
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Package,
  Clock,
  Truck,
  CheckCircle2,
  RotateCcw,
  Loader2,
  X,
  Users,
} from "lucide-react";
import { useDeliveryServices, useOrders, useUsers } from "@/hooks/useApi";
import { useDebounce } from "@/hooks/useDebounce";
import { useAuth } from "@/contexts/AuthContext";
import { format, subDays } from "date-fns";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { DateRange } from "react-day-picker";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { DashboardStatCard } from "@/components/dashboard/DashboardStatCard";
import { ORDER_STATUSES } from "@/utils/order-utils";
import {
  buildDateRangeParams,
  DateFilterPreset,
  getDateRangeFromPreset,
} from "@/utils/overview-filters";

const ALL = "ALL";
const ITEMS_PER_PAGE = 12;

const formatMad = (amount: number) =>
  `${amount.toLocaleString("fr-MA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} MAD`;

const getStatusBadge = (status: string) => {
  const config = ORDER_STATUSES[status as keyof typeof ORDER_STATUSES];
  if (!config) return <Badge variant="outline">{status}</Badge>;
  return <Badge className={config.color}>{config.label}</Badge>;
};

function SalesOverviewSkeleton() {
  return (
    <MainLayout>
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Skeleton className="col-span-2 h-80 rounded-lg" />
          <Skeleton className="h-80 rounded-lg" />
        </div>
        <Skeleton className="h-96 rounded-lg" />
      </div>
    </MainLayout>
  );
}

const SalesOverview = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [dateFilter, setDateFilter] = useState<DateFilterPreset>("thisMonth");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() =>
    getDateRangeFromPreset("thisMonth")
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [userFilter, setUserFilter] = useState(ALL);
  const [deliveryServiceFilter, setDeliveryServiceFilter] = useState(ALL);
  const [currentPage, setCurrentPage] = useState(1);

  const debouncedSearch = useDebounce(searchTerm, 200);

  const dateParams = useMemo(
    () => buildDateRangeParams(dateFilter, dateRange),
    [dateFilter, dateRange]
  );

  const orderFilters = useMemo(
    () => ({
      ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
      ...(statusFilter !== ALL ? { status: statusFilter } : {}),
      ...(isAdmin && userFilter !== ALL ? { salesmanId: userFilter } : {}),
      ...(deliveryServiceFilter !== ALL
        ? { deliveryServiceId: deliveryServiceFilter }
        : {}),
      ...dateParams,
    }),
    [
      debouncedSearch,
      statusFilter,
      isAdmin,
      userFilter,
      deliveryServiceFilter,
      dateParams,
    ]
  );

  const {
    data: orders = [],
    isLoading,
    isFetching,
  } = useOrders(orderFilters);
  const { data: users = [], isLoading: isLoadingUsers } = useUsers();
  const { data: deliveryServices = [], isLoading: isLoadingDeliveryServices } =
    useDeliveryServices();

  const periodLabel = useMemo(() => {
    if (dateFilter === "custom") {
      if (dateRange?.from && dateRange?.to) {
        return `${format(dateRange.from, "dd MMM yyyy")} – ${format(dateRange.to, "dd MMM yyyy")}`;
      }
      return "Custom range";
    }
    const labels: Record<Exclude<DateFilterPreset, "custom">, string> = {
      today: format(new Date(), "dd MMM yyyy"),
      yesterday: format(subDays(new Date(), 1), "dd MMM yyyy"),
      lastWeek: "Last 7 days",
      lastMonth: "Last 30 days",
      thisMonth: format(new Date(), "MMMM yyyy"),
    };
    return labels[dateFilter];
  }, [dateFilter, dateRange]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (searchTerm.trim()) count += 1;
    if (statusFilter !== ALL) count += 1;
    if (isAdmin && userFilter !== ALL) count += 1;
    if (deliveryServiceFilter !== ALL) count += 1;
    if (dateFilter !== "thisMonth") count += 1;
    return count;
  }, [searchTerm, statusFilter, isAdmin, userFilter, deliveryServiceFilter, dateFilter]);

  const metrics = useMemo(() => {
    const byStatus = { PENDING: 0, IN_PROCESS: 0, DELIVERED: 0, RETURNED: 0 };
    let totalSales = 0;
    let totalCommission = 0;

    for (const order of orders) {
      totalSales += Number(order.totalAmount ?? 0);
      totalCommission += Number(order.commission ?? 0);
      const s = order.status as keyof typeof byStatus;
      if (s in byStatus) byStatus[s]++;
    }

    const totalOrders = orders.length;
    const deliveredRate =
      totalOrders > 0
        ? Math.round((byStatus.DELIVERED / totalOrders) * 100)
        : 0;
    const commissionRate =
      totalSales > 0 ? Math.round((totalCommission / totalSales) * 100) : 0;

    return {
      totalSales,
      totalCommission,
      totalOrders,
      averageOrderValue: totalOrders > 0 ? totalSales / totalOrders : 0,
      deliveredRate,
      commissionRate,
      ...byStatus,
    };
  }, [orders]);

  const chartData = useMemo(() => {
    const daily = orders.reduce(
      (acc: Record<string, { date: string; label: string; sales: number; orders: number; commission: number }>, order) => {
        const key = format(new Date(order.createdAt), "yyyy-MM-dd");
        if (!acc[key]) {
          acc[key] = {
            date: key,
            label: format(new Date(order.createdAt), "dd MMM"),
            sales: 0,
            orders: 0,
            commission: 0,
          };
        }
        acc[key].sales += Number(order.totalAmount ?? 0);
        acc[key].commission += Number(order.commission ?? 0);
        acc[key].orders += 1;
        return acc;
      },
      {}
    );
    return Object.values(daily).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }, [orders]);

  const topSalesmen = useMemo(() => {
    const byUser = new Map<
      number,
      { name: string; orders: number; sales: number; commission: number }
    >();
    for (const order of orders) {
      const id = order.user?.id ?? order.salesman?.id;
      if (!id) continue;
      const name = order.user?.name ?? order.salesman?.name ?? "Unknown";
      const cur = byUser.get(id) ?? { name, orders: 0, sales: 0, commission: 0 };
      cur.orders += 1;
      cur.sales += Number(order.totalAmount ?? 0);
      cur.commission += Number(order.commission ?? 0);
      byUser.set(id, cur);
    }
    return [...byUser.values()]
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 5);
  }, [orders]);

  const totalPages = Math.max(1, Math.ceil(orders.length / ITEMS_PER_PAGE));
  const paginatedOrders = useMemo(
    () =>
      orders.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
      ),
    [currentPage, orders]
  );

  const userOptions = useMemo(
    () => [
      { label: "All salesmen", value: ALL },
      ...(Array.isArray(users)
        ? users.map((u: { id: number; name: string; role: string }) => ({
            label: `${u.name} (${u.role})`,
            value: String(u.id),
          }))
        : []),
    ],
    [users]
  );

  const deliveryOptions = useMemo(
    () => [
      { label: "All delivery services", value: ALL },
      ...(Array.isArray(deliveryServices)
        ? deliveryServices.map((s: { id: number; name: string }) => ({
            label: s.name,
            value: String(s.id),
          }))
        : []),
    ],
    [deliveryServices]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter, userFilter, deliveryServiceFilter, dateFilter, dateRange]);

  const handleDateFilterChange = useCallback((value: DateFilterPreset) => {
    setDateFilter(value);
    setDateRange(getDateRangeFromPreset(value));
  }, []);

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter(ALL);
    setUserFilter(ALL);
    setDeliveryServiceFilter(ALL);
    setDateFilter("thisMonth");
    setDateRange(getDateRangeFromPreset("thisMonth"));
  };

  const handleExport = () => {
    if (!orders.length) return;

    const headers = [
      "Order ID",
      "Customer",
      "Phone",
      "City",
      "Delivery Service",
      "Date",
      "Status",
      "Salesman",
      "Total Amount",
      "Commission",
      "Products & Variants",
    ];

    const rows = orders.map((order) => {
      const products =
        order.items
          ?.map((item: { product?: { name?: string }; variant?: { name?: string }; quantity?: number }) => {
            const variant = item.variant ? ` - ${item.variant.name}` : "";
            return `${item.product?.name || "Unknown"}${variant} (${item.quantity || 0})`;
          })
          .join("\n") || "No products";

      return [
        order.id,
        order.customerName || "Unknown",
        order.phone || "-",
        order.city || "-",
        order.deliveryService?.name || "-",
        format(new Date(order.createdAt), "MMM d, yyyy"),
        order.status || "-",
        order.salesman?.name || order.user?.name || "-",
        `MAD ${Number(order.totalAmount ?? 0).toFixed(2)}`,
        `MAD ${Number(order.commission ?? 0).toFixed(2)}`,
        products,
      ];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `sales-report-${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  if (isLoading || isLoadingUsers || isLoadingDeliveryServices) {
    return <SalesOverviewSkeleton />;
  }

  return (
    <MainLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-gray-900">
              Sales Overview
            </h1>
            <p className="text-sm text-muted-foreground">
              {metrics.totalOrders} order{metrics.totalOrders !== 1 ? "s" : ""} · {periodLabel}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={handleExport}
            disabled={orders.length === 0}
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>

        {/* Compact filters */}
        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search orders, customers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-8 pl-8 text-sm"
              />
            </div>

            <Select value={dateFilter} onValueChange={handleDateFilterChange}>
              <SelectTrigger className="h-8 w-[130px] text-sm">
                <SelectValue placeholder="Date" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="lastWeek">Last 7 days</SelectItem>
                <SelectItem value="lastMonth">Last 30 days</SelectItem>
                <SelectItem value="thisMonth">This month</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>

            {dateFilter === "custom" && (
              <DateRangePicker value={dateRange} onChange={setDateRange} />
            )}

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-[120px] text-sm">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                {Object.values(ORDER_STATUSES).map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {isAdmin && (
              <SearchableSelect
                options={userOptions}
                value={userFilter}
                onValueChange={setUserFilter}
                placeholder="Salesman"
                searchPlaceholder="Search..."
                className="h-8 w-[150px] text-sm"
              />
            )}

            <SearchableSelect
              options={deliveryOptions}
              value={deliveryServiceFilter}
              onValueChange={setDeliveryServiceFilter}
              placeholder="Delivery"
              searchPlaceholder="Search..."
              className="h-8 w-[150px] text-sm"
            />

            {activeFiltersCount > 0 && (
              <>
                <Badge variant="secondary" className="h-6 px-2 text-xs tabular-nums">
                  {activeFiltersCount} active
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-8 gap-1 px-2 text-xs text-muted-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear
                </Button>
              </>
            )}
          </div>
        </div>

        {/* KPI row */}
        <div
          className={`grid grid-cols-2 gap-3 transition-opacity sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 ${
            isFetching ? "opacity-70" : ""
          }`}
        >
          <DashboardStatCard
            label="Total sales"
            value={formatMad(metrics.totalSales)}
            icon={<DollarSign className="h-4 w-4 text-emerald-600" />}
            highlight
          />
          <DashboardStatCard
            label="Commission"
            value={formatMad(metrics.totalCommission)}
            icon={<TrendingUp className="h-4 w-4 text-violet-600" />}
            subtext={`${metrics.commissionRate}% of sales`}
          />
          <DashboardStatCard
            label="Orders"
            value={metrics.totalOrders}
            icon={<ShoppingCart className="h-4 w-4 text-matles-600" />}
          />
          <DashboardStatCard
            label="Avg. order"
            value={formatMad(metrics.averageOrderValue)}
            icon={<Package className="h-4 w-4 text-blue-600" />}
          />
          <DashboardStatCard
            label="Delivered"
            value={metrics.DELIVERED}
            icon={<CheckCircle2 className="h-4 w-4 text-green-600" />}
            subtext={`${metrics.deliveredRate}% rate`}
          />
          <DashboardStatCard
            label="Pending"
            value={metrics.PENDING}
            icon={<Clock className="h-4 w-4 text-yellow-600" />}
          />
          <DashboardStatCard
            label="In process"
            value={metrics.IN_PROCESS}
            icon={<Truck className="h-4 w-4 text-blue-600" />}
          />
          <DashboardStatCard
            label="Returned"
            value={metrics.RETURNED}
            icon={<RotateCcw className="h-4 w-4 text-red-600" />}
          />
        </div>

        {/* Charts + top salesmen */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="border-gray-200 shadow-sm lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">Sales trend</CardTitle>
              <CardDescription>Daily revenue and commission</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                {chartData.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    No data for the selected period
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}`} />
                      <Tooltip
                        formatter={(value: number, name: string) => [
                          formatMad(value),
                          name === "sales" ? "Sales" : "Commission",
                        ]}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="sales"
                        name="Sales"
                        stroke="#0ea5e9"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="commission"
                        name="Commission"
                        stroke="#10b981"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base font-medium">
                <Users className="h-4 w-4 text-matles-600" />
                Top salesmen
              </CardTitle>
              <CardDescription>By revenue in selected period</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {topSalesmen.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No sales data yet
                </p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {topSalesmen.map((s, i) => (
                    <div
                      key={s.name}
                      className="flex items-center justify-between px-4 py-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{s.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {s.orders} order{s.orders !== 1 ? "s" : ""}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold tabular-nums">
                          {formatMad(s.sales)}
                        </p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {formatMad(s.commission)} comm.
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Daily orders bar chart */}
        <Card className="border-gray-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Order volume</CardTitle>
            <CardDescription>Orders per day</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              {chartData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No data for the selected period
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(value: number) => [`${value} orders`, "Volume"]}
                    />
                    <Bar dataKey="orders" name="Orders" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Orders table */}
        <Card
          className={`overflow-hidden border-gray-200 shadow-sm transition-opacity ${
            isFetching ? "opacity-70" : ""
          }`}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b pb-4">
            <div>
              <CardTitle className="text-base font-medium">Orders</CardTitle>
              <CardDescription>
                {metrics.totalOrders} result{metrics.totalOrders !== 1 ? "s" : ""}
              </CardDescription>
            </div>
            {isFetching && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-gray-200 bg-gray-50/90 hover:bg-gray-50/90">
                    <TableHead className="h-10 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Order
                    </TableHead>
                    <TableHead className="h-10 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Customer
                    </TableHead>
                    <TableHead className="h-10 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      City
                    </TableHead>
                    <TableHead className="h-10 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Delivery
                    </TableHead>
                    <TableHead className="h-10 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Salesman
                    </TableHead>
                    <TableHead className="h-10 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Date
                    </TableHead>
                    <TableHead className="h-10 px-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Amount
                    </TableHead>
                    <TableHead className="h-10 px-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Commission
                    </TableHead>
                    <TableHead className="h-10 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Status
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedOrders.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={9}
                        className="py-16 text-center text-sm text-muted-foreground"
                      >
                        No orders match your filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedOrders.map((order) => (
                      <TableRow
                        key={order.id}
                        className="border-b border-gray-100 hover:bg-gray-50/80"
                      >
                        <TableCell className="px-3 py-2.5">
                          <span className="font-semibold tabular-nums text-matles-700">
                            #{order.id}
                          </span>
                        </TableCell>
                        <TableCell className="px-3 py-2.5">
                          <div className="font-medium text-gray-900">
                            {order.customerName}
                          </div>
                          {order.phone && (
                            <div className="text-xs text-muted-foreground tabular-nums">
                              {order.phone}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="px-3 py-2.5 text-sm">
                          {order.city || "—"}
                        </TableCell>
                        <TableCell className="max-w-[140px] truncate px-3 py-2.5 text-sm">
                          {order.deliveryService?.name || "—"}
                        </TableCell>
                        <TableCell className="px-3 py-2.5 text-sm">
                          {order.salesman?.name || order.user?.name || "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-3 py-2.5 text-sm text-muted-foreground">
                          {format(new Date(order.createdAt), "dd MMM yyyy")}
                        </TableCell>
                        <TableCell className="px-3 py-2.5 text-right font-semibold tabular-nums">
                          {Number(order.totalAmount).toFixed(2)}
                          <span className="ml-1 text-xs font-normal text-muted-foreground">
                            MAD
                          </span>
                        </TableCell>
                        <TableCell className="px-3 py-2.5 text-right tabular-nums text-sm">
                          {Number(order.commission).toFixed(2)}
                          <span className="ml-1 text-xs text-muted-foreground">MAD</span>
                        </TableCell>
                        <TableCell className="px-3 py-2.5">
                          {getStatusBadge(order.status)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {orders.length > ITEMS_PER_PAGE && (
              <div className="flex items-center justify-between border-t px-4 py-3">
                <span className="text-sm text-muted-foreground">
                  {(currentPage - 1) * ITEMS_PER_PAGE + 1}–
                  {Math.min(currentPage * ITEMS_PER_PAGE, orders.length)} of{" "}
                  {orders.length}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {currentPage} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
};

export default SalesOverview;
