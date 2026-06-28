import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { format, subDays } from "date-fns";
import { DateRange } from "react-day-picker";
import {
  Search,
  ShoppingCart,
  DollarSign,
  Clock,
  Truck,
  CheckCircle2,
  RotateCcw,
  Loader2,
  Users,
} from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  useConfirmationUsers,
  useOrders,
  useProducts,
} from "@/hooks/useApi";
import { ORDER_STATUSES } from "@/utils/order-utils";
import {
  applyClientSideOrderFilters,
  buildApiOrderFilters,
  buildConfirmationUserOptions,
  createDefaultOverviewFilters,
  DateFilterPreset,
  getDateRangeFromPreset,
  overviewFiltersPending,
  OVERVIEW_ALL,
} from "@/utils/overview-filters";

const ITEMS_PER_PAGE = 15;

const getStatusBadge = (status: string) => {
  const config = ORDER_STATUSES[status as keyof typeof ORDER_STATUSES];
  if (!config) return <Badge variant="outline">{status}</Badge>;
  return <Badge className={config.color}>{config.label}</Badge>;
};

const formatProducts = (order: {
  items?: { product?: { name?: string }; quantity?: number }[];
}) => {
  if (!order.items?.length) return "—";
  return order.items
    .map((item) => {
      const name = item.product?.name ?? "Unknown";
      const qty = item.quantity ?? 1;
      return qty > 1 ? `${name} (×${qty})` : name;
    })
    .join(", ");
};

const TeamOverview2 = () => {
  const [draftFilters, setDraftFilters] = useState(createDefaultOverviewFilters);
  const [appliedFilters, setAppliedFilters] = useState(createDefaultOverviewFilters);
  const [currentPage, setCurrentPage] = useState(1);

  const apiOrderFilters = useMemo(
    () => buildApiOrderFilters(appliedFilters),
    [appliedFilters]
  );

  const periodLabel = useMemo(() => {
    if (appliedFilters.dateFilter === "custom") {
      if (appliedFilters.dateRange?.from && appliedFilters.dateRange?.to) {
        return `${format(appliedFilters.dateRange.from, "dd MMM yyyy")} – ${format(appliedFilters.dateRange.to, "dd MMM yyyy")}`;
      }
      return "Select a date range";
    }

    const labels: Record<Exclude<DateFilterPreset, "custom">, string> = {
      today: format(new Date(), "dd MMM yyyy"),
      yesterday: format(subDays(new Date(), 1), "dd MMM yyyy"),
      lastWeek: "Last 7 days",
      lastMonth: "Last 30 days",
      thisMonth: format(new Date(), "MMMM yyyy"),
    };
    return labels[appliedFilters.dateFilter];
  }, [appliedFilters.dateFilter, appliedFilters.dateRange]);

  const handleDateFilterChange = useCallback((value: DateFilterPreset) => {
    setDraftFilters((prev) => ({
      ...prev,
      dateFilter: value,
      dateRange: getDateRangeFromPreset(value),
    }));
  }, []);

  const { data: products = [] } = useProducts();
  const { data: confirmationUsers = [], isLoading: isLoadingConfirmationUsers } =
    useConfirmationUsers();
  const {
    data: rawOrders = [],
    isLoading: isLoadingOrders,
    isFetching: isFetchingOrders,
  } = useOrders(apiOrderFilters, { keepPreviousData: false });

  const orders = useMemo(
    () => applyClientSideOrderFilters(rawOrders, appliedFilters),
    [rawOrders, appliedFilters]
  );

  const confirmationUserOptions = useMemo(
    () => buildConfirmationUserOptions(confirmationUsers, null, []),
    [confirmationUsers]
  );

  const productOptions = useMemo(
    () =>
      [...products]
        .map((product: { id: number; name: string }) => ({
          label: product.name,
          value: String(product.id),
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [products]
  );

  const confirmationSelectOptions = useMemo(
    () => [
      { label: "All confirmation users", value: OVERVIEW_ALL },
      ...confirmationUserOptions.map((cu) => ({
        label: cu.name,
        value: String(cu.id),
      })),
    ],
    [confirmationUserOptions]
  );

  const productSelectOptions = useMemo(
    () => [
      { label: "All products", value: OVERVIEW_ALL },
      ...productOptions,
    ],
    [productOptions]
  );

  const stats = useMemo(() => {
    const byStatus = {
      PENDING: 0,
      IN_PROCESS: 0,
      DELIVERED: 0,
      RETURNED: 0,
    };

    let totalSales = 0;

    for (const order of orders) {
      totalSales += Number(order.totalAmount ?? 0);
      const status = order.status as keyof typeof byStatus;
      if (status in byStatus) byStatus[status]++;
    }

    const uniqueConfirmationUsers = new Set(
      orders.map((o) => o.confirmationUser?.id).filter(Boolean)
    ).size;

    return {
      totalOrders: orders.length,
      totalSales,
      uniqueConfirmationUsers,
      ...byStatus,
    };
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

  const filtersPending = overviewFiltersPending(draftFilters, appliedFilters);

  useEffect(() => {
    setCurrentPage(1);
  }, [appliedFilters]);

  const handleApplyFilters = useCallback(() => {
    setAppliedFilters({ ...draftFilters });
    setCurrentPage(1);
  }, [draftFilters]);

  const handleResetFilters = useCallback(() => {
    const defaults = createDefaultOverviewFilters();
    setDraftFilters(defaults);
    setAppliedFilters(defaults);
    setCurrentPage(1);
  }, []);

  const isInitialLoad = isLoadingOrders && orders.length === 0;

  if (isInitialLoad && isLoadingConfirmationUsers) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading team overview...
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Team Overview 2
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Orders for {periodLabel} — set filters then click Apply
          </p>
        </div>

        <Card className="border-gray-200 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-medium">Filters</CardTitle>
            <CardDescription>
              Choose filters, then click Apply to load matching orders
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                handleApplyFilters();
              }}
            >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <div className="relative">
                <Label htmlFor="team-overview-search" className="sr-only">
                  Search orders
                </Label>
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="team-overview-search"
                  name="search"
                  placeholder="Search orders, customers, tracking..."
                  value={draftFilters.searchTerm}
                  onChange={(e) =>
                    setDraftFilters((prev) => ({
                      ...prev,
                      searchTerm: e.target.value,
                    }))
                  }
                  className="pl-9"
                />
              </div>

              <div>
                <Label htmlFor="team-overview-date" className="sr-only">
                  Date range
                </Label>
              <Select
                value={draftFilters.dateFilter}
                onValueChange={handleDateFilterChange}
                name="dateFilter"
              >
                <SelectTrigger id="team-overview-date">
                  <SelectValue placeholder="Date range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="lastWeek">Last 7 days</SelectItem>
                  <SelectItem value="lastMonth">Last 30 days</SelectItem>
                  <SelectItem value="thisMonth">This month</SelectItem>
                  <SelectItem value="custom">Custom range</SelectItem>
                </SelectContent>
              </Select>
              </div>

              {draftFilters.dateFilter === "custom" && (
                <div className="xl:col-span-2">
                  <Label htmlFor="team-overview-date-range" className="sr-only">
                    Custom date range
                  </Label>
                  <DateRangePicker
                    id="team-overview-date-range"
                    value={draftFilters.dateRange}
                    onChange={(range: DateRange | undefined) =>
                      setDraftFilters((prev) => ({ ...prev, dateRange: range }))
                    }
                  />
                </div>
              )}

              <div>
                <Label htmlFor="team-overview-confirmation-user" className="sr-only">
                  Confirmation user
                </Label>
              <SearchableSelect
                id="team-overview-confirmation-user"
                name="confirmationUserId"
                aria-label="Confirmation user"
                options={confirmationSelectOptions}
                value={draftFilters.confirmationUserFilter}
                onValueChange={(value) =>
                  setDraftFilters((prev) => ({
                    ...prev,
                    confirmationUserFilter: value || OVERVIEW_ALL,
                  }))
                }
                placeholder="Confirmation user"
                searchPlaceholder="Search users..."
                emptyMessage="No confirmation user found."
              />
              </div>

              <div>
                <Label htmlFor="team-overview-product" className="sr-only">
                  Product
                </Label>
              <SearchableSelect
                id="team-overview-product"
                name="productId"
                aria-label="Product"
                options={productSelectOptions}
                value={draftFilters.productFilter}
                onValueChange={(value) =>
                  setDraftFilters((prev) => ({
                    ...prev,
                    productFilter: value || OVERVIEW_ALL,
                  }))
                }
                placeholder="Product"
                searchPlaceholder="Search products..."
                emptyMessage="No product found."
              />
              </div>

              <div>
                <Label htmlFor="team-overview-status" className="sr-only">
                  Order status
                </Label>
              <Select
                value={draftFilters.statusFilter}
                onValueChange={(value) =>
                  setDraftFilters((prev) => ({ ...prev, statusFilter: value }))
                }
                name="status"
              >
                <SelectTrigger id="team-overview-status">
                  <SelectValue placeholder="Order status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={OVERVIEW_ALL}>All statuses</SelectItem>
                  {Object.values(ORDER_STATUSES).map((status) => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={isFetchingOrders}>
                {isFetchingOrders ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Search className="mr-2 h-4 w-4" />
                )}
                Apply filters
              </Button>
              <Button type="button" variant="outline" onClick={handleResetFilters}>
                Reset
              </Button>
              {filtersPending && (
                <span className="text-sm text-amber-600">
                  Filters changed — click Apply to update results
                </span>
              )}
            </div>
            </form>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
          <StatCard
            label="Total orders"
            value={stats.totalOrders}
            icon={<ShoppingCart className="h-4 w-4 text-matles-600" />}
            highlight
          />
          <StatCard
            label="Total sales"
            value={`${stats.totalSales.toFixed(0)} MAD`}
            icon={<DollarSign className="h-4 w-4 text-emerald-600" />}
          />
          <StatCard
            label="Confirmation users"
            value={stats.uniqueConfirmationUsers}
            icon={<Users className="h-4 w-4 text-violet-600" />}
          />
          <StatCard
            label="Pending"
            value={stats.PENDING}
            icon={<Clock className="h-4 w-4 text-yellow-600" />}
          />
          <StatCard
            label="In process"
            value={stats.IN_PROCESS}
            icon={<Truck className="h-4 w-4 text-blue-600" />}
          />
          <StatCard
            label="Delivered"
            value={stats.DELIVERED}
            icon={<CheckCircle2 className="h-4 w-4 text-green-600" />}
          />
          <StatCard
            label="Returned"
            value={stats.RETURNED}
            icon={<RotateCcw className="h-4 w-4 text-red-600" />}
          />
        </div>

        <Card
          className={`border-gray-200 shadow-sm transition-opacity ${
            isFetchingOrders ? "opacity-70" : ""
          }`}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div>
              <CardTitle className="text-base font-medium">Orders</CardTitle>
              <CardDescription>
                {stats.totalOrders} result{stats.totalOrders !== 1 ? "s" : ""} for{" "}
                {periodLabel}
              </CardDescription>
            </div>
            {isFetchingOrders && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                    <TableHead className="font-medium">Order</TableHead>
                    <TableHead className="font-medium">Customer</TableHead>
                    <TableHead className="font-medium">Confirmation user</TableHead>
                    <TableHead className="font-medium">Products</TableHead>
                    <TableHead className="font-medium">Date</TableHead>
                    <TableHead className="font-medium text-right">Amount</TableHead>
                    <TableHead className="font-medium">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedOrders.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="py-16 text-center text-muted-foreground"
                      >
                        No orders match the current filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedOrders.map((order) => (
                      <TableRow key={order.id} className="hover:bg-gray-50/50">
                        <TableCell className="font-medium text-matles-700">
                          #{order.id}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{order.customerName}</div>
                          {order.phone && (
                            <div className="text-xs text-muted-foreground">
                              {order.phone}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {order.confirmationUser ? (
                            <span className="font-medium">
                              {order.confirmationUser.name}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate text-sm">
                          {formatProducts(order)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {format(new Date(order.createdAt), "dd MMM yyyy")}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {Number(order.totalAmount).toFixed(2)} MAD
                        </TableCell>
                        <TableCell>{getStatusBadge(order.status)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {orders.length > ITEMS_PER_PAGE && (
              <div className="flex items-center justify-between border-t px-6 py-4">
                <span className="text-sm text-muted-foreground">
                  Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–
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
                  <span className="text-sm text-muted-foreground">
                    {currentPage} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setCurrentPage((p) => Math.min(p + 1, totalPages))
                    }
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

function StatCard({
  label,
  value,
  icon,
  highlight = false,
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
  highlight?: boolean;
}) {
  return (
    <Card
      className={`border-gray-200 shadow-sm ${
        highlight ? "border-matles-200 bg-matles-50/40" : ""
      }`}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          {icon}
        </div>
        <p className="mt-2 text-xl font-semibold tabular-nums text-gray-900">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

export default TeamOverview2;
