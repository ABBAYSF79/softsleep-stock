import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { format, subDays } from "date-fns";
import { DateRange } from "react-day-picker";
import {
  Activity,
  Search,
  SlidersHorizontal,
  ShoppingCart,
  DollarSign,
  Clock,
  Truck,
  CheckCircle2,
  RotateCcw,
  Loader2,
  Users,
  Target,
  Package,
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
  useConfirmationUserProgress,
  useOrders,
  useProducts,
} from "@/hooks/useApi";
import { ConfirmationObjectiveDialog } from "@/components/users/ConfirmationObjectiveDialog";
import { ConfirmationProductSimulationDialog } from "@/components/users/ConfirmationProductSimulationDialog";
import { ORDER_STATUSES } from "@/utils/order-utils";
import {
  applyClientSideOrderFilters,
  buildApiOrderFilters,
  buildConfirmationUserOptions,
  buildDateRangeParams,
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
  const [isObjectiveDialogOpen, setIsObjectiveDialogOpen] = useState(false);
  const [isProductSimulationOpen, setIsProductSimulationOpen] = useState(false);

  const apiOrderFilters = useMemo(
    () => buildApiOrderFilters(appliedFilters),
    [appliedFilters]
  );

  const objectiveDateParams = useMemo(
    () =>
      buildDateRangeParams(appliedFilters.dateFilter, appliedFilters.dateRange),
    [appliedFilters.dateFilter, appliedFilters.dateRange]
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
    data: objectiveProgress,
    isLoading: isLoadingObjectiveProgress,
    isError: isObjectiveProgressError,
  } = useConfirmationUserProgress({
    enabled: isObjectiveDialogOpen,
    from:
      "startDate" in objectiveDateParams
        ? objectiveDateParams.startDate
        : undefined,
    to:
      "endDate" in objectiveDateParams ? objectiveDateParams.endDate : undefined,
    confirmationUserId: appliedFilters.confirmationUserFilter,
  });

  const objectiveUsers = useMemo(() => {
    if (
      !appliedFilters.confirmationUserFilter ||
      appliedFilters.confirmationUserFilter === OVERVIEW_ALL
    ) {
      return confirmationUsers;
    }

    const selectedId = Number(appliedFilters.confirmationUserFilter);
    return confirmationUsers.filter((user) => user.id === selectedId);
  }, [appliedFilters.confirmationUserFilter, confirmationUsers]);
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
        <div className="relative flex flex-col gap-3 overflow-hidden rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="absolute inset-y-0 left-0 w-1 bg-matles-600" />
          <div className="min-w-0 pl-1">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-matles-50 text-matles-700 ring-1 ring-inset ring-matles-100">
                <Activity className="h-4 w-4" />
              </div>
              <h1 className="truncate text-xl font-semibold tracking-tight text-slate-900">
                Team Overview
              </h1>
              <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 sm:inline-flex">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-600" />
                </span>
                Live
              </span>
            </div>
            <p className="mt-1 pl-9 text-sm text-slate-500">
              Orders for <span className="font-medium text-slate-700">{periodLabel}</span>
              <span className="mx-1.5 text-slate-300">·</span>
              <span className="font-semibold tabular-nums text-slate-700">
                {stats.totalOrders}
              </span>{" "}
              results
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 self-start sm:self-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsProductSimulationOpen(true)}
              className="h-9 border-slate-200 text-slate-700 hover:border-sky-300 hover:bg-sky-50"
            >
              <Package className="mr-2 h-4 w-4 text-sky-600" aria-hidden="true" />
              <span className="hidden sm:inline">Product count</span>
              <span className="sm:hidden">Products</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsObjectiveDialogOpen(true)}
              className="h-9 border-slate-200 text-slate-700 hover:border-matles-300 hover:bg-matles-50"
            >
              <Target className="mr-2 h-4 w-4 text-matles-600" aria-hidden="true" />
              <span className="hidden sm:inline">Track objectives</span>
              <span className="sm:hidden">Objectives</span>
            </Button>
          </div>
        </div>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="px-4 pb-3 pt-4 sm:px-5">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-matles-600" />
              <CardTitle className="text-base font-medium">Filters</CardTitle>
              {filtersPending && (
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                  Changes pending
                </Badge>
              )}
            </div>
            <CardDescription className="text-xs">
              Select a view, then apply the filters to refresh the results.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-4 sm:px-5">
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
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
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
                  className="h-9 rounded-lg border-slate-200 bg-slate-50/70 pl-9 text-sm shadow-inner shadow-slate-200/30 transition-colors placeholder:text-slate-400 focus:bg-white focus-visible:border-matles-300 focus-visible:ring-matles-200"
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
                <SelectTrigger id="team-overview-date" className="h-9 border-slate-200 text-sm">
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
                className="h-9 border-slate-200 text-sm"
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
                className="h-9 border-slate-200 text-sm"
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
                <SelectTrigger id="team-overview-status" className="h-9 border-slate-200 text-sm">
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
              <Button
                type="submit"
                disabled={isFetchingOrders}
                className="h-9 bg-matles-600 hover:bg-matles-700"
              >
                {isFetchingOrders ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Search className="mr-2 h-4 w-4" />
                )}
                Apply filters
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleResetFilters}
                className="h-9 border-slate-200"
              >
                Reset
              </Button>
            </div>
            </form>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
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
          className={`overflow-hidden border-slate-200 shadow-sm transition-opacity ${
            isFetchingOrders ? "opacity-70" : ""
          }`}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-slate-100 px-4 py-3 sm:px-5">
            <div>
              <CardTitle className="text-base font-medium text-slate-900">Orders</CardTitle>
              <CardDescription className="text-xs">
                {stats.totalOrders} result{stats.totalOrders !== 1 ? "s" : ""} for{" "}
                {periodLabel}
              </CardDescription>
            </div>
            {isFetchingOrders && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </CardHeader>
          <CardContent className="p-0">
            <div className="space-y-2 p-3 md:hidden">
              {paginatedOrders.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  No orders match the current filters.
                </div>
              ) : (
                paginatedOrders.map((order) => (
                  <article
                    key={order.id}
                    className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold tabular-nums text-matles-700">
                          #{order.id}
                        </p>
                        <p className="truncate font-medium text-slate-900">
                          {order.customerName}
                        </p>
                        {order.phone && (
                          <p className="truncate text-xs text-slate-500">{order.phone}</p>
                        )}
                      </div>
                      <div className="shrink-0 whitespace-nowrap">
                        {getStatusBadge(order.status)}
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 border-y border-slate-100 py-3 text-sm">
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500">Confirmation</p>
                        <p className="truncate text-slate-700">
                          {order.confirmationUser?.name || "—"}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500">Date</p>
                        <p className="truncate text-slate-700">
                          {format(new Date(order.createdAt), "dd MMM yyyy")}
                        </p>
                      </div>
                      <div className="col-span-2 min-w-0">
                        <p className="text-xs text-slate-500">Product</p>
                        <p className="truncate text-slate-700">{formatProducts(order)}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-xs text-slate-500">Amount</span>
                      <span className="font-semibold tabular-nums text-slate-900">
                        {Number(order.totalAmount).toFixed(2)} MAD
                      </span>
                    </div>
                  </article>
                ))
              )}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <Table className="text-[13px] text-slate-700">
                <TableHeader className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur [&_th]:tracking-[0.06em]">
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
                      <TableRow
                        key={order.id}
                        className="border-slate-100 transition-colors even:bg-slate-50/30 hover:bg-matles-50/35"
                      >
                        <TableCell className="font-medium tabular-nums text-matles-700">
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
                        <TableCell>
                          <div className="whitespace-nowrap">{getStatusBadge(order.status)}</div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {orders.length > ITEMS_PER_PAGE && (
              <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
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

      <ConfirmationObjectiveDialog
        open={isObjectiveDialogOpen}
        onOpenChange={setIsObjectiveDialogOpen}
        users={objectiveUsers}
        progressData={objectiveProgress}
        periodLabel={periodLabel}
        isLoading={isLoadingObjectiveProgress}
        isError={isObjectiveProgressError}
      />
      <ConfirmationProductSimulationDialog
        open={isProductSimulationOpen}
        onOpenChange={setIsProductSimulationOpen}
        users={objectiveUsers}
        orders={orders}
        periodLabel={periodLabel}
      />
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
      className={`group overflow-hidden rounded-xl border-slate-200/80 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
        highlight
          ? "border-matles-200 bg-matles-50/50 ring-1 ring-inset ring-matles-100/70"
          : ""
      }`}
    >
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 text-[10px] font-semibold uppercase leading-tight tracking-wide text-slate-500">
            {label}
          </p>
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-50 ring-1 ring-inset ring-slate-100 transition-colors group-hover:bg-white">
            {icon}
          </div>
        </div>
        <p className="mt-1.5 text-lg font-semibold tabular-nums tracking-tight text-slate-900 sm:text-xl">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

export default TeamOverview2;
