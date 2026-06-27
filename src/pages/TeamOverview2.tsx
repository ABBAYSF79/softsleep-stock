import { useEffect, useMemo, useState, type ReactNode } from "react";
import { format } from "date-fns";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  useConfirmationUsers,
  useOrders,
  useProducts,
} from "@/hooks/useApi";
import { useDebounce } from "@/hooks/useDebounce";
import { ORDER_STATUSES } from "@/utils/order-utils";
import {
  buildConfirmationUserOptions,
  buildDateRangeParams,
} from "@/utils/overview-filters";

const ALL = "ALL";
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
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [confirmationUserFilter, setConfirmationUserFilter] = useState(ALL);
  const [productFilter, setProductFilter] = useState(ALL);
  const [currentPage, setCurrentPage] = useState(1);

  const debouncedSearch = useDebounce(searchTerm, 200);

  const dateParams = useMemo(
    () => buildDateRangeParams("thisMonth"),
    []
  );

  const orderFilters = useMemo(
    () => ({
      ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
      ...(statusFilter !== ALL ? { status: statusFilter } : {}),
      ...(confirmationUserFilter !== ALL
        ? { confirmationUserId: confirmationUserFilter }
        : {}),
      ...(productFilter !== ALL ? { productId: productFilter } : {}),
      ...dateParams,
    }),
    [confirmationUserFilter, dateParams, debouncedSearch, productFilter, statusFilter]
  );

  const { data: products = [] } = useProducts();
  const { data: confirmationUsers = [], isLoading: isLoadingConfirmationUsers } =
    useConfirmationUsers();
  const {
    data: orders = [],
    isLoading: isLoadingOrders,
    isFetching: isFetchingOrders,
  } = useOrders(orderFilters);

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
      { label: "All confirmation users", value: ALL },
      ...confirmationUserOptions.map((cu) => ({
        label: cu.name,
        value: String(cu.id),
      })),
    ],
    [confirmationUserOptions]
  );

  const productSelectOptions = useMemo(
    () => [
      { label: "All products", value: ALL },
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

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter, confirmationUserFilter, productFilter]);

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

  const monthLabel = format(new Date(), "MMMM yyyy");

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Team Overview 2
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Orders for {monthLabel} — filter by confirmation user, product, or status
          </p>
        </div>

        <Card className="border-gray-200 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-medium">Filters</CardTitle>
            <CardDescription>
              Search and filters are applied dynamically via the API
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="relative lg:col-span-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search orders, customers, tracking..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>

              <SearchableSelect
                options={confirmationSelectOptions}
                value={confirmationUserFilter}
                onValueChange={setConfirmationUserFilter}
                placeholder="Confirmation user"
                searchPlaceholder="Search users..."
                emptyMessage="No confirmation user found."
              />

              <SearchableSelect
                options={productSelectOptions}
                value={productFilter}
                onValueChange={setProductFilter}
                placeholder="Product"
                searchPlaceholder="Search products..."
                emptyMessage="No product found."
              />

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Order status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  {Object.values(ORDER_STATUSES).map((status) => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
                {monthLabel}
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
