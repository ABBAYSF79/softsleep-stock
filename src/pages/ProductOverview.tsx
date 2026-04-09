import { useMemo, useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { DateRange } from "react-day-picker";
import {
  format,
  subDays,
  startOfMonth,
  endOfMonth,
  subMonths,
  endOfDay,
  startOfDay,
  addDays,
  differenceInCalendarDays,
} from "date-fns";
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
  Cell,
  LabelList,
} from "recharts";
import {
  Package,
  ShoppingCart,
  Rows3,
  Ruler,
  FileSpreadsheet,
  ArrowUp,
  ArrowDown,
  Minus,
  Lightbulb,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  usePaginatedOrders,
  useProducts,
  type OrderFilters,
} from "@/hooks/useApi";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { formatVariantDetails } from "@/utils/order-utils";
import {
  buildProductOverviewExcelFilename,
  exportProductOverviewToExcel,
} from "@/utils/excel-export";
import { toast } from "sonner";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Skeleton } from "@/components/ui/skeleton";

const CHART_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
];

/** Splits rank vs product label on Y-axis (unlikely inside product names). */
const PRODUCT_Y_TICK_SEP = "\u2003‖\u2003";

function ProductBarYAxisTick(
  props: Partial<{ x: number; y: number; payload: { value?: string } }>
) {
  const x = props.x ?? 0;
  const y = props.y ?? 0;
  const raw = String(props.payload?.value ?? "");
  const parts = raw.split(PRODUCT_Y_TICK_SEP);
  const rank = parts[0] ?? "";
  const title = parts.slice(1).join(PRODUCT_Y_TICK_SEP) || raw;

  return (
    <text x={x} y={y} textAnchor="end" fontSize={10}>
      <tspan fill="#4f46e5" fontWeight={700} fontSize={11}>
        #{rank}
      </tspan>
      <tspan fill="#0f172a" fontWeight={500}>
        {" "}
        {title}
      </tspan>
    </text>
  );
}

function barFillByRank(rank: number, indexPalette: number) {
  if (rank === 1) return "#ca8a04";
  if (rank === 2) return "#94a3b8";
  if (rank === 3) return "#b45309";
  return CHART_COLORS[indexPalette % CHART_COLORS.length]!;
}

function VariantBarYAxisTick(
  props: Partial<{
    x: number;
    y: number;
    payload: { value?: string; payload?: { isHeader?: boolean } };
  }>
) {
  const x = props.x ?? 0;
  const y = props.y ?? 0;
  const label = String(props.payload?.value ?? "");
  const isHeader = Boolean(props.payload?.payload?.isHeader);

  if (isHeader) {
    return (
      <text x={x} y={y} dy={4} textAnchor="end" fontSize={11}>
        <tspan x={x} fill="#0f172a" fontWeight={700}>
          {label}
        </tspan>
      </text>
    );
  }

  return (
    <text x={x} y={y} dy={3} textAnchor="end" fill="#475569" fontSize={10}>
      {label}
    </text>
  );
}

/** Same number of days as [from–to], immediately before `from`. */
function getPreviousPeriodRange(
  from: Date,
  to: Date
): { from: Date; to: Date } {
  const s = startOfDay(from);
  const e = endOfDay(to);
  const days = differenceInCalendarDays(e, s) + 1;
  const prevEnd = endOfDay(addDays(s, -1));
  const prevStart = startOfDay(addDays(prevEnd, -(days - 1)));
  return { from: prevStart, to: prevEnd };
}

function DeltaBadge({
  current,
  previous,
  loading,
}: {
  current: number;
  previous: number | null;
  loading: boolean;
}) {
  if (previous === null) return null;
  if (loading) {
    return (
      <p className="text-xs text-muted-foreground mt-1">Comparing…</p>
    );
  }
  const diff = current - previous;
  const pct =
    previous !== 0
      ? Math.round((diff / previous) * 100)
      : current > 0
        ? null
        : 0;
  const Icon =
    diff > 0 ? ArrowUp : diff < 0 ? ArrowDown : Minus;
  const colorClass =
    diff > 0
      ? "text-emerald-600"
      : diff < 0
        ? "text-red-600"
        : "text-muted-foreground";
  return (
    <p className={cn("flex flex-wrap items-center gap-x-1 text-xs mt-1", colorClass)}>
      <Icon className="h-3 w-3 shrink-0" />
      <span className="font-medium">
        {diff > 0 ? "+" : ""}
        {diff}
        {pct !== null ? ` (${pct > 0 ? "+" : ""}${pct}%)` : current > 0 ? " (new)" : ""}
      </span>
      <span className="text-muted-foreground font-normal">vs previous period</span>
    </p>
  );
}

type OverviewRow = {
  orderId: number;
  orderDate: string;
  city: string;
  status: string;
  productName: string;
  variantLabel: string;
  quantity: number;
  productId: number;
};

const ProductOverview = () => {
  const [dateFilter, setDateFilter] = useState("thisMonth");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const today = new Date();
    return {
      from: startOfMonth(today),
      to: endOfDay(endOfMonth(today)),
    };
  });
  const [statusFilter, setStatusFilter] = useState("all");
  const [productFilter, setProductFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [compareEnabled, setCompareEnabled] = useState(true);
  const [exportingExcel, setExportingExcel] = useState(false);

  const { data: products = [] } = useProducts();

  const handleDatePreset = (value: string) => {
    setDateFilter(value);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (value) {
      case "today":
        setDateRange({
          from: startOfDay(today),
          to: endOfDay(today),
        });
        break;
      case "yesterday": {
        const y = subDays(today, 1);
        setDateRange({ from: startOfDay(y), to: endOfDay(y) });
        break;
      }
      case "lastWeek":
        setDateRange({
          from: startOfDay(subDays(today, 7)),
          to: endOfDay(today),
        });
        break;
      case "last30Days":
        setDateRange({
          from: startOfDay(subDays(today, 30)),
          to: endOfDay(today),
        });
        break;
      case "previousMonth": {
        const ref = subMonths(today, 1);
        setDateRange({
          from: startOfMonth(ref),
          to: endOfDay(endOfMonth(ref)),
        });
        break;
      }
      case "thisMonth":
        setDateRange({
          from: startOfMonth(today),
          to: endOfDay(endOfMonth(today)),
        });
        break;
      case "custom":
        setDateRange(undefined);
        break;
      default:
        break;
    }
  };

  useEffect(() => {
    setPage(1);
  }, [dateRange, statusFilter, productFilter]);

  const ordersQueryEnabled =
    dateFilter !== "custom" ||
    Boolean(dateRange?.from && dateRange?.to);

  const orderQueryParams = useMemo(() => {
    const from = dateRange?.from;
    const to = dateRange?.to;
    const base: OrderFilters = {
      page: 1,
      limit: 15000,
      status: statusFilter,
      startDate: from ? startOfDay(from) : undefined,
      endDate: to ? endOfDay(to) : undefined,
    };
    if (productFilter !== "all") {
      base.productId = productFilter;
    }
    return base;
  }, [dateRange, statusFilter, productFilter]);

  const {
    data: ordersPayload,
    isLoading,
    error,
  } = usePaginatedOrders(orderQueryParams, { enabled: ordersQueryEnabled });

  const prevOrderQueryParams = useMemo((): OrderFilters | null => {
    if (!dateRange?.from || !dateRange?.to) return null;
    const prev = getPreviousPeriodRange(dateRange.from, dateRange.to);
    const base: OrderFilters = {
      page: 1,
      limit: 15000,
      status: statusFilter,
      startDate: prev.from,
      endDate: prev.to,
    };
    if (productFilter !== "all") {
      base.productId = productFilter;
    }
    return base;
  }, [dateRange, statusFilter, productFilter]);

  const {
    data: prevOrdersPayload,
    isLoading: prevOrdersLoading,
  } = usePaginatedOrders(
    prevOrderQueryParams ?? {
      page: 1,
      limit: 15000,
      status: statusFilter,
    },
    {
      enabled: Boolean(
        compareEnabled && ordersQueryEnabled && prevOrderQueryParams
      ),
    }
  );

  const orders = ordersQueryEnabled ? (ordersPayload?.data ?? []) : [];
  const prevOrders =
    compareEnabled && ordersQueryEnabled
      ? (prevOrdersPayload?.data ?? [])
      : [];

  const prevTotalQty = useMemo(() => {
    if (!compareEnabled || !ordersQueryEnabled) return null;
    let sum = 0;
    for (const o of prevOrders) {
      for (const item of o.items ?? []) {
        sum += item.quantity ?? 0;
      }
    }
    return sum;
  }, [compareEnabled, ordersQueryEnabled, prevOrders]);
  const totalFromApi = ordersQueryEnabled
    ? (ordersPayload?.meta?.total ?? orders.length)
    : 0;
  const capped =
    ordersQueryEnabled &&
    typeof ordersPayload?.meta?.total === "number" &&
    ordersPayload.meta.total > orders.length;

  const { rows, productQtyStats, variantQtyStats, distinctOrders, totalUnits } =
    useMemo(() => {
    const list: OverviewRow[] = [];
    const qtyPerProduct = new Map<
      number,
      { name: string; qty: number }
    >();
    const qtyPerVariant = new Map<
      number,
      {
        productId: number;
        productName: string;
        dimensionLabel: string;
        qty: number;
    }
    >();

    for (const order of orders) {
      const items = order.items ?? [];
      for (const item of items) {
        const product = item.product ?? item.variant?.product;
        const productId = product?.id ?? item.productId;
        const productName =
          product?.name ?? item.variant?.product?.name ?? "—";
        const dimensionLabel = formatVariantDetails(item);
        const variantId = item.variant?.id;
        const q = item.quantity ?? 0;

        if (productId != null) {
          const cur = qtyPerProduct.get(productId);
          if (!cur) {
            qtyPerProduct.set(productId, { name: productName, qty: q });
          } else {
            cur.qty += q;
          }
        }

        if (variantId != null && productId != null) {
          const cur = qtyPerVariant.get(variantId);
          if (!cur) {
            qtyPerVariant.set(variantId, {
              productId,
              productName,
              dimensionLabel,
              qty: q,
            });
          } else {
            cur.qty += q;
          }
        }

        list.push({
          orderId: order.id,
          orderDate: order.createdAt,
          city: order.city || "—",
          status: order.status,
          productName,
          variantLabel: dimensionLabel,
          quantity: q,
          productId: productId ?? 0,
        });
      }
    }

    const productQtyStats = Array.from(qtyPerProduct.entries())
      .map(([pid, { name, qty }]) => ({
        productId: pid,
        name,
        totalQty: qty,
      }))
      .filter((p) => p.totalQty > 0)
      .sort((a, b) => b.totalQty - a.totalQty);

    const variantQtyStats = Array.from(qtyPerVariant.entries())
      .map(([variantId, meta]) => ({
        variantId,
        productId: meta.productId,
        productName: meta.productName,
        dimensionLabel: meta.dimensionLabel,
        fullName: `${meta.productName} — ${meta.dimensionLabel}`,
        totalQty: meta.qty,
      }))
      .filter((v) => v.totalQty > 0)
      .sort((a, b) => b.totalQty - a.totalQty);

    const distinctOrders = new Set(list.map((r) => r.orderId)).size;
    const totalUnits = list.reduce((s, r) => s + r.quantity, 0);

    return {
      rows: list,
      productQtyStats,
      variantQtyStats,
      distinctOrders,
      totalUnits,
    };
  }, [orders]);

  const productOptions = useMemo(
    () => [
      { label: "All products", value: "all" },
      ...products.map((p: { id: number; name: string }) => ({
        label: p.name,
        value: String(p.id),
      })),
    ],
    [products]
  );

  const chartDataProducts = useMemo(() => {
    let data = productQtyStats.filter((d) => d.totalQty > 0);
    if (productFilter !== "all") {
      const id = Number(productFilter);
      data = data.filter((d) => d.productId === id);
    }
    return data.slice(0, 24).map((d, idx) => {
      const rank = idx + 1;
      const short =
        d.name.length > 30 ? `${d.name.slice(0, 28)}…` : d.name;
      return {
        rank,
        name: `${rank}${PRODUCT_Y_TICK_SEP}${short}`,
        fullName: d.name,
        totalQty: d.totalQty,
      };
    });
  }, [productQtyStats, productFilter]);

  const chartDataVariants = useMemo(() => {
    let data = variantQtyStats
      .filter((d) => d.totalQty > 0)
      .map((d) => ({ ...d }));
    if (productFilter !== "all") {
      const id = Number(productFilter);
      data = data.filter((d) => d.productId === id);
    }

    const productRank = new Map<number, number>();
    productQtyStats.forEach((p, idx) => productRank.set(p.productId, idx));

    data.sort((a, b) => {
      const ra = productRank.get(a.productId) ?? 9999;
      const rb = productRank.get(b.productId) ?? 9999;
      if (ra !== rb) return ra - rb;
      return b.totalQty - a.totalQty;
    });

    const colorByProduct = new Map<number, string>();
    let ci = 0;
    for (const d of data) {
      if (!colorByProduct.has(d.productId)) {
        colorByProduct.set(
          d.productId,
          CHART_COLORS[ci % CHART_COLORS.length]!
        );
        ci++;
      }
    }

    // Build grouped list: product header once, then variants.
    type Row = {
      name: string;
      fullName: string;
      totalQty: number | null;
      fill: string;
      isHeader?: boolean;
    };

    const grouped: Row[] = [];
    let currentPid: number | null = null;

    // Allow more lines because headers take rows too.
    const MAX_LINES = 42;

    for (const d of data) {
      const color = colorByProduct.get(d.productId)!;
      const productLabel =
        d.productName.length > 32
          ? `${d.productName.slice(0, 30)}…`
          : d.productName;
      const variantLabel =
        d.dimensionLabel.length > 30
          ? `${d.dimensionLabel.slice(0, 28)}…`
          : d.dimensionLabel;

      if (currentPid !== d.productId) {
        currentPid = d.productId;
        grouped.push({
          name: productLabel,
          fullName: d.productName,
          totalQty: null,
          fill: "transparent",
          isHeader: true,
        });
      }

      grouped.push({
        name: variantLabel,
        fullName: d.fullName,
        totalQty: d.totalQty,
        fill: color,
      });

      if (grouped.length >= MAX_LINES) break;
    }

    return grouped;
  }, [variantQtyStats, productQtyStats, productFilter]);

  const trendData = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) return [];
    const byDay = new Map<string, number>();
    for (const o of orders) {
      const key = format(new Date(o.createdAt), "yyyy-MM-dd");
      let dayQty = 0;
      for (const item of o.items ?? []) {
        dayQty += item.quantity ?? 0;
      }
      byDay.set(key, (byDay.get(key) ?? 0) + dayQty);
    }
    const out: { date: string; label: string; units: number }[] = [];
    let cur = startOfDay(dateRange.from);
    const end = startOfDay(dateRange.to);
    while (cur <= end) {
      const key = format(cur, "yyyy-MM-dd");
      out.push({
        date: key,
        label: format(cur, "MMM d"),
        units: byDay.get(key) ?? 0,
      });
      cur = addDays(cur, 1);
    }
    return out;
  }, [orders, dateRange]);

  const insights = useMemo(() => {
    if (!distinctOrders && rows.length === 0) return null;
    const topP = productQtyStats[0];
    const topV = variantQtyStats[0];
    const totalUnitsSafe = totalUnits || 0;
    const topPShare = topP && totalUnitsSafe
      ? Math.min(100, Math.round((topP.totalQty / totalUnitsSafe) * 100))
      : 0;
    const topVShare = topV && totalUnitsSafe
      ? Math.min(100, Math.round((topV.totalQty / totalUnitsSafe) * 100))
      : 0;
    const avgLines = distinctOrders
      ? Math.round((rows.length / distinctOrders) * 10) / 10
      : 0;
    let busiest: { label: string; units: number; date: string } | null = null;
    for (const p of trendData) {
      if (!busiest || p.units > busiest.units) {
        busiest = { label: p.label, units: p.units, date: p.date };
      }
    }
    return {
      topP,
      topV,
      topPShare,
      topVShare,
      avgLines,
      busiest,
      totalUnits,
    };
  }, [
    distinctOrders,
    productQtyStats,
    variantQtyStats,
    rows,
    trendData,
    totalUnits,
  ]);

  const excelFilename = useMemo(
    () =>
      buildProductOverviewExcelFilename({
        dateFilter,
        dateFrom: dateRange?.from,
        dateTo: dateRange?.to,
        statusFilter,
        productFilter,
      }),
    [dateFilter, dateRange, statusFilter, productFilter]
  );

  const handleExportExcel = async () => {
    if (!rows.length) return;
    setExportingExcel(true);
    try {
      await exportProductOverviewToExcel(rows, excelFilename);
      toast.success("Excel file downloaded");
    } catch {
      toast.error("Export failed");
    } finally {
      setExportingExcel(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);

  if (error) {
    return (
      <MainLayout>
        <p className="text-destructive">Failed to load orders.</p>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Product overview</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Statistics are based on <strong>total quantity</strong> (sum of line
              qty) per product and per variant so you see how many units move in
              the period. Export the filtered grid to Excel anytime.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
            <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
              <Switch
                id="compare-prev"
                checked={compareEnabled}
                onCheckedChange={setCompareEnabled}
              />
              <Label htmlFor="compare-prev" className="text-sm cursor-pointer font-normal">
                Compare previous period
              </Label>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={!rows.length || isLoading || exportingExcel}
              onClick={handleExportExcel}
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              {exportingExcel ? "Exporting…" : "Export Excel"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Select value={dateFilter} onValueChange={handleDatePreset}>
            <SelectTrigger>
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="yesterday">Yesterday</SelectItem>
              <SelectItem value="lastWeek">Last 7 days</SelectItem>
              <SelectItem value="last30Days">Last 30 days</SelectItem>
              <SelectItem value="previousMonth">Last month</SelectItem>
              <SelectItem value="thisMonth">This month</SelectItem>
              <SelectItem value="custom">Custom range</SelectItem>
            </SelectContent>
          </Select>

          {dateFilter === "custom" && (
            <DateRangePicker value={dateRange} onChange={setDateRange} />
          )}

          <SearchableSelect
            options={productOptions}
            value={productFilter}
            onValueChange={(v) => setProductFilter(v || "all")}
            placeholder="Product"
            searchPlaceholder="Search product..."
            emptyMessage="No product found."
          />

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="IN_PROCESS">In process</SelectItem>
              <SelectItem value="DELIVERED">Delivered</SelectItem>
              <SelectItem value="RETURNED">Returned</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {dateFilter === "custom" && (!dateRange?.from || !dateRange?.to) && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            Choose a start and end date to load orders.
          </p>
        )}

        {(dateFilter !== "custom" || (dateRange?.from && dateRange?.to)) && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {isLoading ? (
                <>
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                </>
              ) : (
                <>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">
                        Total quantity
                      </CardTitle>
                      <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{totalUnits}</div>
                      <p className="text-xs text-muted-foreground">
                        Sum of qty on all lines (filtered)
                      </p>
                      {distinctOrders > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Across {distinctOrders} order
                          {distinctOrders !== 1 ? "s" : ""}
                        </p>
                      )}
                      <DeltaBadge
                        current={totalUnits}
                        previous={prevTotalQty}
                        loading={Boolean(
                          compareEnabled &&
                            ordersQueryEnabled &&
                            prevOrdersLoading
                        )}
                      />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">
                        Line items
                      </CardTitle>
                      <Rows3 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{rows.length}</div>
                      <p className="text-xs text-muted-foreground">
                        Order lines in table
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">
                        Products
                      </CardTitle>
                      <Package className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {productQtyStats.length}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Products with qty in period
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">
                        Variants (dimensions)
                      </CardTitle>
                      <Ruler className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {variantQtyStats.length}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Variants (SKUs) with qty
                      </p>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>

            {!isLoading && insights && (insights.topP || rows.length > 0) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="border-matles-100 bg-matles-50/40">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Lightbulb className="h-4 w-4 text-matles-700" />
                      Key insights
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground space-y-2">
                    {insights.topP && (
                      <p>
                        <span className="font-medium text-foreground">
                          Top product:{" "}
                        </span>
                        {insights.topP.name} — {insights.topP.totalQty} pcs
                        ({insights.topPShare}% of total qty in this view).
                      </p>
                    )}
                    {insights.topV && (
                      <p>
                        <span className="font-medium text-foreground">
                          Top variant:{" "}
                        </span>
                        {insights.topV.fullName} — {insights.topV.totalQty} pcs
                        ({insights.topVShare}% of total qty).
                      </p>
                    )}
                    {distinctOrders > 0 && (
                      <p>
                        <span className="font-medium text-foreground">
                          Basket mix:{" "}
                        </span>
                        ~{insights.avgLines} line{insights.avgLines !== 1 ? "s" : ""}{" "}
                        per order on average.
                      </p>
                    )}
                    {insights.busiest && insights.busiest.units > 0 && (
                      <p>
                        <span className="font-medium text-foreground">
                          Peak day (qty):{" "}
                        </span>
                        {insights.busiest.label} → {insights.busiest.units} pcs.
                      </p>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Quantity per day
                    </CardTitle>
                    <p className="text-sm text-muted-foreground font-normal">
                      Total units (Σ line qty) per calendar day in the range.
                    </p>
                  </CardHeader>
                  <CardContent>
                    {trendData.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-8 text-center">
                        No trend data.
                      </p>
                    ) : (
                      <div className="h-[240px] w-full min-h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            data={trendData}
                            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis
                              dataKey="label"
                              tick={{ fontSize: 10 }}
                              minTickGap={28}
                              interval="preserveStartEnd"
                            />
                            <YAxis
                              allowDecimals={false}
                              width={36}
                              tick={{ fontSize: 10 }}
                            />
                            <Tooltip
                              contentStyle={{
                                borderRadius: 8,
                                fontSize: 12,
                              }}
                              labelFormatter={(_, payload) => {
                                const d = payload?.[0]?.payload?.date as string;
                                return d ? format(new Date(d + "T12:00:00"), "PP") : "";
                              }}
                              formatter={(v: number) => [`${v} pcs`, "Qty"]}
                            />
                            <Line
                              type="monotone"
                              dataKey="units"
                              stroke="#4f46e5"
                              strokeWidth={2}
                              dot={{ r: 2, fill: "#4f46e5" }}
                              activeDot={{ r: 5 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Qty by product — ranking</CardTitle>
                  <p className="text-sm text-muted-foreground font-normal leading-relaxed">
                    <span className="text-foreground font-medium">#1</span> = highest
                    total quantity (all variants combined). Numbers at the end of
                    each bar are the qty. Top{" "}
                    <span className="text-foreground font-medium">24</span>{" "}
                    products.
                  </p>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-[320px] w-full" />
                  ) : chartDataProducts.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-12 text-center">
                      No data for this period.
                    </p>
                  ) : (
                    <div className="h-[min(480px,32rem)] w-full min-h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={chartDataProducts}
                          layout="vertical"
                          margin={{ left: 4, right: 52, top: 8, bottom: 8 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" horizontal />
                          <XAxis type="number" allowDecimals={false} />
                          <YAxis
                            type="category"
                            dataKey="name"
                            width={210}
                            tick={ProductBarYAxisTick}
                            interval={0}
                            reversed
                          />
                          <Tooltip
                            formatter={(v: number) => [`${v} pcs`, "Total qty"]}
                            labelFormatter={(_, payload) => {
                              const p = payload?.[0]?.payload as
                                | { rank?: number; fullName?: string }
                                | undefined;
                              if (!p?.fullName) return "";
                              return `#${p.rank ?? ""} — ${p.fullName}`;
                            }}
                          />
                          <Bar dataKey="totalQty" radius={[0, 4, 4, 0]}>
                            <LabelList
                              dataKey="totalQty"
                              position="right"
                              fill="#64748b"
                              fontSize={11}
                              formatter={(v: number) => `${v}`}
                            />
                            {chartDataProducts.map((row, i) => (
                              <Cell
                                key={i}
                                fill={barFillByRank(row.rank, i)}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Qty by variant (dimension / size)</CardTitle>
                  <p className="text-sm text-muted-foreground font-normal">
                    Grouped by product (same color per product), variants sorted
                    by qty within each group. Top 30 lines.
                  </p>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-[320px] w-full" />
                  ) : chartDataVariants.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-12 text-center">
                      No variant data for this period.
                    </p>
                  ) : (
                    <div className="h-[min(520px,34rem)] w-full min-h-[320px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={chartDataVariants}
                          layout="vertical"
                          margin={{ left: 4, right: 16, top: 8, bottom: 8 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" horizontal />
                          <XAxis type="number" allowDecimals={false} />
                          <YAxis
                            type="category"
                            dataKey="name"
                            width={220}
                            tick={VariantBarYAxisTick}
                            interval={0}
                            reversed
                          />
                          <Tooltip
                            formatter={(v: number) => [v, "Qty"]}
                            labelFormatter={(_, payload) =>
                              (payload?.[0]?.payload?.fullName as string) ?? ""
                            }
                          />
                          <Bar dataKey="totalQty" radius={[0, 4, 4, 0]}>
                            {chartDataVariants.map((entry, i) => (
                              <Cell key={i} fill={entry.fill} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {capped && (
                  <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                    Showing {orders.length} of {totalFromApi} matching orders.
                    Increase the export limit or narrow the date range for a full
                    export from the API if needed.
                  </p>
                )}
                {isLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : (
                  <>
                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12">#</TableHead>
                            <TableHead>Order</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>City</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Product</TableHead>
                            <TableHead>Variant</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pageRows.length === 0 ? (
                            <TableRow>
                              <TableCell
                                colSpan={8}
                                className="text-center text-muted-foreground py-10"
                              >
                                No lines for these filters.
                              </TableCell>
                            </TableRow>
                          ) : (
                            pageRows.map((row, idx) => (
                              <TableRow
                                key={`${row.orderId}-${row.productId}-${row.variantLabel}-${idx}`}
                              >
                                <TableCell className="text-muted-foreground">
                                  {(page - 1) * pageSize + idx + 1}
                                </TableCell>
                                <TableCell className="font-medium">
                                  #{row.orderId}
                                </TableCell>
                                <TableCell>
                                  {format(
                                    new Date(row.orderDate),
                                    "MMM d, yyyy"
                                  )}
                                </TableCell>
                                <TableCell>{row.city}</TableCell>
                                <TableCell>
                                  <OrderStatusBadge status={row.status} />
                                </TableCell>
                                <TableCell>{row.productName}</TableCell>
                                <TableCell className="max-w-[200px] truncate" title={row.variantLabel}>
                                  {row.variantLabel}
                                </TableCell>
                                <TableCell className="text-right">
                                  {row.quantity}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                    {pageRows.length > 0 && (
                      <PaginationControls
                        currentPage={page}
                        totalPages={totalPages}
                        itemsPerPage={pageSize}
                        totalItems={rows.length}
                        startIndex={(page - 1) * pageSize}
                        endIndex={Math.min(page * pageSize, rows.length)}
                        onPageChange={setPage}
                        onItemsPerPageChange={(n) => {
                          setPageSize(n);
                          setPage(1);
                        }}
                      />
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </MainLayout>
  );
};

export default ProductOverview;
