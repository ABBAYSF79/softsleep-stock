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
  Search,
  Download,
  Users,
  Phone,
  Mail,
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Loader2,
} from "lucide-react";
import {
  useConfirmationUsers,
  useOrders,
  useProducts,
  useUsers,
} from "@/hooks/useApi";
import { format } from "date-fns";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { DateRange } from "react-day-picker";
import { Badge } from "@/components/ui/badge";
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
import { ORDER_STATUSES } from "@/utils/order-utils";
import {
  buildConfirmationTeamExcelFilename,
  exportConfirmationTeamOverviewToExcel,
} from "@/utils/excel-export";
import { toast } from "sonner";

const ITEMS_PER_PAGE = 10;

const getStatusBadge = (status: string) => {
  const config = ORDER_STATUSES[status as keyof typeof ORDER_STATUSES];
  if (!config) return <Badge>{status}</Badge>;
  return <Badge className={config.color}>{config.label}</Badge>;
};

const ConfirmationTeamOverview = () => {
  const [draftFilters, setDraftFilters] = useState(createDefaultOverviewFilters);
  const [appliedFilters, setAppliedFilters] = useState(createDefaultOverviewFilters);
  const [currentPage, setCurrentPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);

  const apiOrderFilters = useMemo(
    () => buildApiOrderFilters(appliedFilters),
    [appliedFilters]
  );

  const { data: users = [] } = useUsers();
  const { data: products = [] } = useProducts();
  const { data: confirmationUsers = [], isLoading: isLoadingConfirmationUsers } =
    useConfirmationUsers();

  const draftSalerId = useMemo(
    () =>
      draftFilters.salerUserFilter === OVERVIEW_ALL
        ? null
        : Number(draftFilters.salerUserFilter),
    [draftFilters.salerUserFilter]
  );

  const salerScopedOrderFilters = useMemo(
    () => ({
      ...(draftFilters.salerUserFilter !== OVERVIEW_ALL
        ? { salesmanId: draftFilters.salerUserFilter }
        : {}),
      ...buildApiOrderFilters({
        ...draftFilters,
        searchTerm: "",
        statusFilter: OVERVIEW_ALL,
        confirmationUserFilter: OVERVIEW_ALL,
        productFilter: OVERVIEW_ALL,
      }),
    }),
    [draftFilters]
  );

  const {
    data: rawOrders = [],
    isLoading: isLoadingOrders,
    isFetching: isFetchingOrders,
  } = useOrders(apiOrderFilters, { keepPreviousData: false });

  const { data: salerScopedOrders = [] } = useOrders(salerScopedOrderFilters, {
    enabled: draftFilters.salerUserFilter !== OVERVIEW_ALL,
    keepPreviousData: false,
  });

  const orders = useMemo(
    () => applyClientSideOrderFilters(rawOrders, appliedFilters),
    [rawOrders, appliedFilters]
  );

  const confirmationUserOptions = useMemo(
    () =>
      buildConfirmationUserOptions(
        confirmationUsers,
        draftSalerId,
        draftFilters.salerUserFilter !== OVERVIEW_ALL ? salerScopedOrders : []
      ),
    [
      confirmationUsers,
      draftSalerId,
      draftFilters.salerUserFilter,
      salerScopedOrders,
    ]
  );

  const productOptions = useMemo(
    () =>
      [...products]
        .map((product: { id: number; name: string }) => ({
          id: String(product.id),
          name: product.name,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [products]
  );

  const metrics = useMemo(() => {
    const totalSales = orders.reduce(
      (sum, order) => sum + Number(order.totalAmount ?? 0),
      0
    );
    const totalCommission = orders.reduce(
      (sum, order) => sum + Number(order.commission ?? 0),
      0
    );
    const uniqueConfirmationUsers = new Set(
      orders.map((order) => order.confirmationUser?.id).filter(Boolean)
    ).size;

    return {
      totalSales,
      totalCommission,
      totalOrders: orders.length,
      uniqueConfirmationUsers,
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

  const handleDateFilterChange = useCallback((value: DateFilterPreset) => {
    setDraftFilters((prev) => ({
      ...prev,
      dateFilter: value,
      dateRange: getDateRangeFromPreset(value),
    }));
  }, []);

  const handleSalerUserChange = useCallback((value: string) => {
    setDraftFilters((prev) => ({
      ...prev,
      salerUserFilter: value,
      confirmationUserFilter: OVERVIEW_ALL,
    }));
  }, []);

  const handleExport = useCallback(async () => {
    if (!orders.length) {
      toast.error("No orders to export for the current filters");
      return;
    }

    setIsExporting(true);
    try {
      const confirmationUserName =
        appliedFilters.confirmationUserFilter === OVERVIEW_ALL
          ? "All Confirmation Users"
          : confirmationUserOptions.find(
              (cu) =>
                String(cu.id) === appliedFilters.confirmationUserFilter
            )?.name ?? "Confirmation";

      const filename = buildConfirmationTeamExcelFilename(
        confirmationUserName,
        appliedFilters.dateRange?.from ?? new Date()
      );
      await exportConfirmationTeamOverviewToExcel(orders, filename);
      toast.success(`Exported ${orders.length} order(s) to Excel`);
    } catch {
      toast.error("Failed to export Excel file");
    } finally {
      setIsExporting(false);
    }
  }, [
    appliedFilters.confirmationUserFilter,
    appliedFilters.dateRange?.from,
    confirmationUserOptions,
    orders,
  ]);

  const isInitialLoad = isLoadingOrders && orders.length === 0;

  if (isInitialLoad && isLoadingConfirmationUsers) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading...
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Confirmation Team Overview</h1>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={isExporting || orders.length === 0}
          >
            {isExporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Export Excel
          </Button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-7">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by order ID..."
                value={draftFilters.searchTerm}
                onChange={(e) =>
                  setDraftFilters((prev) => ({
                    ...prev,
                    searchTerm: e.target.value,
                  }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleApplyFilters();
                }}
                className="pl-8"
              />
            </div>

            <Select
              value={draftFilters.dateFilter}
              onValueChange={handleDateFilterChange}
            >
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

            {draftFilters.dateFilter === "custom" && (
              <DateRangePicker
                value={draftFilters.dateRange}
                onChange={(range: DateRange | undefined) =>
                  setDraftFilters((prev) => ({ ...prev, dateRange: range }))
                }
              />
            )}

            <Select
              value={draftFilters.statusFilter}
              onValueChange={(value) =>
                setDraftFilters((prev) => ({ ...prev, statusFilter: value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={OVERVIEW_ALL}>All Statuses</SelectItem>
                {Object.values(ORDER_STATUSES).map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={draftFilters.productFilter}
              onValueChange={(value) =>
                setDraftFilters((prev) => ({ ...prev, productFilter: value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Filter by product" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={OVERVIEW_ALL}>All Products</SelectItem>
                {productOptions.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={draftFilters.salerUserFilter}
              onValueChange={handleSalerUserChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Filter by saler user" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={OVERVIEW_ALL}>All Saler Users</SelectItem>
                {users.map((user) => (
                  <SelectItem key={user.id} value={String(user.id)}>
                    {user.name} ({user.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={draftFilters.confirmationUserFilter}
              onValueChange={(value) =>
                setDraftFilters((prev) => ({
                  ...prev,
                  confirmationUserFilter: value,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    draftFilters.salerUserFilter !== OVERVIEW_ALL
                      ? "Confirmation users for selected saler"
                      : "Filter by confirmation user"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={OVERVIEW_ALL}>
                  All Confirmation Users
                </SelectItem>
                {confirmationUserOptions.map((confirmationUser) => (
                  <SelectItem
                    key={confirmationUser.id}
                    value={String(confirmationUser.id)}
                  >
                    {confirmationUser.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleApplyFilters} disabled={isFetchingOrders}>
              {isFetchingOrders ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              Apply filters
            </Button>
            <Button variant="outline" onClick={handleResetFilters}>
              Reset
            </Button>
            {filtersPending && (
              <span className="text-sm text-amber-600">
                Filters changed — click Apply to update results
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
              <DollarSign className="h-4 w-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                MAD {metrics.totalSales.toFixed(2)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Commission</CardTitle>
              <TrendingUp className="h-4 w-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                MAD {metrics.totalCommission.toFixed(2)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
              <ShoppingCart className="h-4 w-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.totalOrders}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Confirmation Users</CardTitle>
              <Users className="h-4 w-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metrics.uniqueConfirmationUsers}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className={isFetchingOrders ? "opacity-70 transition-opacity" : ""}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Orders by Confirmation Users</CardTitle>
            {isFetchingOrders && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
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
                {paginatedOrders.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="py-10 text-center text-muted-foreground"
                    >
                      No orders match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">#{order.id}</TableCell>
                      <TableCell>{order.customerName}</TableCell>
                      <TableCell>
                        {order.confirmationUser ? (
                          <div className="space-y-1">
                            <div className="font-medium">
                              {order.confirmationUser.name}
                            </div>
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
                      <TableCell>
                        {order.user?.name || order.salesman?.name || "Unknown"}
                      </TableCell>
                      <TableCell>
                        {format(new Date(order.createdAt), "MMM dd, yyyy")}
                      </TableCell>
                      <TableCell>
                        MAD {Number(order.totalAmount).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        MAD {Number(order.commission).toFixed(2)}
                      </TableCell>
                      <TableCell>{getStatusBadge(order.status)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            <div className="flex items-center justify-end space-x-2 py-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                }
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
