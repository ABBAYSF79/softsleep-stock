import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DateRange } from "react-day-picker";
import {
  endOfDay,
  format,
  startOfDay,
  startOfMonth,
  subMonths,
} from "date-fns";
import {
  AlertTriangle,
  History,
  LineChart,
  RefreshCw,
  Search,
} from "lucide-react";
import { PaginationControls } from "@/components/ui/pagination-controls";
import {
  usePaginatedStockHistory,
  useProducts,
  useStockAnalytics,
} from "@/hooks/useApi";
import { cn } from "@/lib/utils";

type CatalogVariant = {
  id: number;
  name?: string;
  size?: { value: string } | null;
  color?: string;
};

function formatCatalogVariantLabel(variant: CatalogVariant): string {
  const s = variant.size;
  let sizeStr = "";
  if (s && typeof s === "object" && "value" in s) {
    sizeStr = s.value;
  } else {
    sizeStr = variant.name || "—";
  }
  const colorStr = variant.color ? ` • ${variant.color}` : "";
  return `${sizeStr}${colorStr}`;
}

function parseFilterId(value: string): number | null {
  if (value === "all" || !value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const TYPE_LABELS: Record<string, string> = {
  INITIAL: "Initial",
  SUPPLY: "Supply",
  ORDER: "Order",
  RETURN: "Return",
  ADJUSTMENT: "Correction",
};

function typeBadgeClass(type: string, quantity: number) {
  switch (type) {
    case "SUPPLY":
      return "bg-green-100 text-green-800";
    case "ORDER":
      return "bg-blue-100 text-blue-800";
    case "RETURN":
      return "bg-yellow-100 text-yellow-800";
    case "ADJUSTMENT":
      return quantity > 0
        ? "bg-indigo-100 text-indigo-800"
        : "bg-red-100 text-red-800";
    case "INITIAL":
      return "bg-gray-100 text-gray-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

const MetricCard = ({
  title,
  value,
  subtitle,
  tone = "neutral",
}: {
  title: string;
  value: string | number;
  subtitle: string;
  tone?: "neutral" | "green" | "red" | "blue" | "slate";
}) => {
  const border =
    tone === "green"
      ? "border-l-emerald-500"
      : tone === "red"
        ? "border-l-red-500"
        : tone === "blue"
          ? "border-l-blue-500"
          : tone === "slate"
            ? "border-l-slate-400"
            : "border-l-slate-200";

  return (
    <Card className={cn("border-l-4", border)}>
      <CardContent className="p-4">
        <div className="text-xs font-medium text-muted-foreground">{title}</div>
        <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>
      </CardContent>
    </Card>
  );
};

const StockHistory = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [productFilter, setProductFilter] = useState(
    searchParams.get("productId") || "all"
  );
  const [variantFilter, setVariantFilter] = useState(
    searchParams.get("variantId") || "all"
  );
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<string>("allTime");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [historySearch, setHistorySearch] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLimit, setHistoryLimit] = useState(50);

  const { data: products = [] } = useProducts();

  useEffect(() => {
    const variantIdParam = searchParams.get("variantId");
    const productIdParam = searchParams.get("productId");
    if (productIdParam) setProductFilter(productIdParam);
    if (variantIdParam) {
      setVariantFilter(variantIdParam);
      if (!productIdParam && products.length) {
        const owner = (
          products as { id: number; variants?: { id: number }[] }[]
        ).find((p) => p.variants?.some((v) => String(v.id) === variantIdParam));
        if (owner) setProductFilter(String(owner.id));
      }
    }
  }, [searchParams, products]);

  const selectedProductId = parseFilterId(productFilter);
  const selectedVariantId = parseFilterId(variantFilter);
  const variantFilterEnabled = selectedProductId !== null;

  const handleProductFilterChange = (value: string) => {
    setProductFilter(value || "all");
    setVariantFilter("all");
  };

  useEffect(() => {
    if (dateFilter === "custom") return;
    const now = new Date();
    if (dateFilter === "allTime") {
      setDateRange(undefined);
      return;
    }
    if (dateFilter === "thisMonth") {
      setDateRange({ from: startOfMonth(now), to: endOfDay(now) });
      return;
    }
    if (dateFilter === "last3Months") {
      setDateRange({
        from: startOfMonth(subMonths(now, 2)),
        to: endOfDay(now),
      });
      return;
    }
    if (dateFilter === "last6Months") {
      setDateRange({
        from: startOfMonth(subMonths(now, 5)),
        to: endOfDay(now),
      });
      return;
    }
    setDateRange({
      from: startOfMonth(subMonths(now, 11)),
      to: endOfDay(now),
    });
  }, [dateFilter]);

  const rangeFrom = dateRange?.from
    ? startOfDay(dateRange.from).toISOString()
    : undefined;
  const rangeTo = dateRange?.to ? endOfDay(dateRange.to).toISOString() : undefined;

  const {
    data: analytics,
    isLoading: isLoadingAnalytics,
    refetch: refetchAnalytics,
    isRefetching,
  } = useStockAnalytics({
    from: rangeFrom,
    to: rangeTo,
    productId: selectedProductId ?? undefined,
    variantId: selectedVariantId ?? undefined,
  });

  const { data: historyData, isLoading: isLoadingHistory } =
    usePaginatedStockHistory({
      page: historyPage,
      limit: historyLimit,
      productId: selectedProductId ?? undefined,
      variantId: selectedVariantId ?? undefined,
      type: typeFilter,
      from: rangeFrom,
      to: rangeTo,
      search: historySearch || undefined,
    });

  useEffect(() => {
    setHistoryPage(1);
  }, [
    productFilter,
    variantFilter,
    typeFilter,
    rangeFrom,
    rangeTo,
    historySearch,
    historyLimit,
  ]);

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

  const variantOptions = useMemo(() => {
    if (selectedProductId === null) {
      return [{ label: "Select a product first", value: "all", disabled: true }];
    }
    const product = (
      products as { id: number; variants?: CatalogVariant[] }[]
    ).find((p) => p.id === selectedProductId);
    if (!product?.variants?.length) {
      return [
        { label: "No variants for this product", value: "all", disabled: true },
      ];
    }
    return [
      { label: "All variants", value: "all" },
      ...product.variants.map((variant) => ({
        label: formatCatalogVariantLabel(variant),
        value: String(variant.id),
      })),
    ];
  }, [products, selectedProductId]);

  const summary = analytics?.summary ?? {
    openingStock: 0,
    closingStock: 0,
    currentStock: 0,
    supplyQty: 0,
    orderQty: 0,
    returnQty: 0,
    adjustmentNet: 0,
    initialQty: 0,
    netQty: 0,
    operations: 0,
  };

  const perVariant = useMemo(
    () => (Array.isArray(analytics?.perVariant) ? analytics.perVariant : []),
    [analytics?.perVariant]
  );

  const monthlyChartData = useMemo(() => {
    const monthly = Array.isArray(analytics?.monthly) ? analytics.monthly : [];
    return monthly.map((m: Record<string, number | string>) => {
      const labelDate = new Date(`${m.month}-01T00:00:00`);
      return {
        month: format(labelDate, "MMM yyyy"),
        supply: Number(m.supplyQty || 0),
        order: Number(m.orderQty || 0),
        returned: Number(m.returnQty || 0),
        adjustment: Number(m.adjustmentNet || 0),
        net: Number(m.netQty || 0),
      };
    });
  }, [analytics?.monthly]);

  const historyRows = (historyData?.data || []) as Array<{
    id: number;
    createdAt: string;
    type: string;
    quantity: number;
    previousStock: number;
    newStock: number;
    reason?: string;
    user?: { name?: string };
    variant?: {
      name: string;
      product?: { name: string };
    };
  }>;
  const historyMeta = historyData?.meta;
  const totalItems = historyMeta?.total ?? historyRows.length;
  const totalPages = historyMeta?.totalPages ?? 1;
  const startIndex = (historyPage - 1) * historyLimit;
  const endIndex = startIndex + historyRows.length;

  const viewingThroughNow =
    dateFilter === "allTime" ||
    !rangeTo ||
    Math.abs(
      endOfDay(new Date(rangeTo)).getTime() - endOfDay(new Date()).getTime()
    ) < 86400000;

  const stockMismatch =
    viewingThroughNow &&
    perVariant.some((p: { stockMismatch?: boolean }) => p.stockMismatch);

  const rangeLabel =
    analytics?.range?.from && analytics?.range?.to
      ? `${format(new Date(analytics.range.from), "dd/MM/yyyy")} → ${format(new Date(analytics.range.to), "dd/MM/yyyy")}`
      : dateFilter === "allTime"
        ? "All time"
        : "—";

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <History className="h-6 w-6" />
              Stock History & Finance
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Full stock movement ledger with product / variant filters, opening &
              closing balances, and reconciliation against current stock.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate("/stock")}>
              Stock Management
            </Button>
            <Button
              variant="outline"
              onClick={() => refetchAnalytics()}
              disabled={isRefetching}
              className="gap-2"
            >
              <RefreshCw
                className={cn("h-4 w-4", isRefetching && "animate-spin")}
              />
              Refresh
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
              <div className="space-y-2">
                <div className="text-sm font-medium">Product</div>
                <SearchableSelect
                  options={productOptions}
                  value={productFilter}
                  onValueChange={handleProductFilterChange}
                  placeholder="All products"
                  searchPlaceholder="Search product..."
                  emptyMessage="No product found."
                />
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Variant</div>
                <SearchableSelect
                  options={variantOptions}
                  value={variantFilter}
                  onValueChange={(v) => setVariantFilter(v || "all")}
                  placeholder={
                    variantFilterEnabled
                      ? "All variants"
                      : "Select a product first"
                  }
                  searchPlaceholder="Search variant..."
                  emptyMessage="No variant found."
                  disabled={!variantFilterEnabled}
                />
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Movement type</div>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    <SelectItem value="INITIAL">Initial</SelectItem>
                    <SelectItem value="SUPPLY">Supply</SelectItem>
                    <SelectItem value="ORDER">Order</SelectItem>
                    <SelectItem value="RETURN">Return</SelectItem>
                    <SelectItem value="ADJUSTMENT">Correction</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Period</div>
                <Select value={dateFilter} onValueChange={setDateFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="allTime">All time</SelectItem>
                    <SelectItem value="thisMonth">This month</SelectItem>
                    <SelectItem value="last3Months">Last 3 months</SelectItem>
                    <SelectItem value="last6Months">Last 6 months</SelectItem>
                    <SelectItem value="last12Months">Last 12 months</SelectItem>
                    <SelectItem value="custom">Custom range</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 xl:col-span-2">
                <div className="text-sm font-medium">Date range</div>
                <DateRangePicker
                  value={dateRange}
                  onChange={(range) => {
                    setDateFilter("custom");
                    setDateRange(range);
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {stockMismatch && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-medium">Stock reconciliation warning: </span>
              Closing balance from history ({summary.closingStock}) does not match
              current stock ({summary.currentStock}) for at least one variant in
              this view. Review corrections, missing history, or manual edits.
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-3">
          <MetricCard
            title="Current stock"
            value={summary.currentStock}
            subtitle="Live DB balance"
          />
          <MetricCard
            title="Opening"
            value={summary.openingStock}
            subtitle="Before period"
            tone="slate"
          />
          <MetricCard
            title="Closing"
            value={summary.closingStock}
            subtitle="End of period"
            tone="slate"
          />
          <MetricCard
            title="Supply"
            value={summary.supplyQty}
            subtitle="Restock in"
            tone="green"
          />
          <MetricCard
            title="Orders"
            value={summary.orderQty}
            subtitle="Stock out"
            tone="red"
          />
          <MetricCard
            title="Returns"
            value={summary.returnQty}
            subtitle="Stock back"
            tone="blue"
          />
          <MetricCard
            title="Corrections"
            value={summary.adjustmentNet}
            subtitle="Net adjustment"
            tone="blue"
          />
          <MetricCard
            title="Net change"
            value={summary.netQty}
            subtitle="Σ movements"
          />
          <MetricCard
            title="Operations"
            value={summary.operations}
            subtitle="History lines"
            tone="slate"
          />
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <LineChart className="h-4 w-4" />
              Monthly movement — {rangeLabel}
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[320px]">
            {isLoadingAnalytics ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : monthlyChartData.length === 0 ? (
              <div className="text-sm text-muted-foreground py-12 text-center">
                No movement data for this filter.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="supply" name="Supply" fill="#16a34a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="order" name="Orders" fill="#dc2626" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="returned" name="Returns" fill="#ca8a04" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="adjustment" name="Corrections" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {(selectedProductId !== null && selectedVariantId === null) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Per variant summary</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Variant</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Opening</TableHead>
                    <TableHead className="text-right">Closing</TableHead>
                    <TableHead className="text-right">Current</TableHead>
                    <TableHead className="text-right">Supply</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Returns</TableHead>
                    <TableHead className="text-right">Corr.</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {perVariant.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                        No variant data.
                      </TableCell>
                    </TableRow>
                  ) : (
                    perVariant.map((row: {
                      variantId: number;
                      variantName: string;
                      sku: string;
                      openingStock: number;
                      closingStock: number;
                      currentStock: number;
                      supplyQty: number;
                      orderQty: number;
                      returnQty: number;
                      adjustmentNet: number;
                      netQty: number;
                      stockMismatch?: boolean;
                    }) => (
                      <TableRow key={row.variantId}>
                        <TableCell className="font-medium">{row.variantName}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{row.sku}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.openingStock}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.closingStock}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{row.currentStock}</TableCell>
                        <TableCell className="text-right text-green-700 tabular-nums">{row.supplyQty}</TableCell>
                        <TableCell className="text-right text-red-700 tabular-nums">{row.orderQty}</TableCell>
                        <TableCell className="text-right text-amber-700 tabular-nums">{row.returnQty}</TableCell>
                        <TableCell className="text-right text-blue-700 tabular-nums">{row.adjustmentNet}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{row.netQty}</TableCell>
                        <TableCell>
                          {row.stockMismatch && (
                            <Badge variant="outline" className="text-amber-700 border-amber-300">
                              Mismatch
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Full history ledger</CardTitle>
            <p className="text-sm text-muted-foreground font-normal">
              {totalItems} movement{totalItems !== 1 ? "s" : ""} — paginated, complete history for your filters.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="pl-10"
                placeholder="Search reason..."
              />
            </div>

            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Variant</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Change</TableHead>
                    <TableHead className="text-right">Previous</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>User</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingHistory ? (
                    <TableRow>
                      <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                        Loading history...
                      </TableCell>
                    </TableRow>
                  ) : historyRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                        No history found for these filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    historyRows.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="whitespace-nowrap text-xs tabular-nums">
                          {format(new Date(item.createdAt), "dd/MM/yy HH:mm")}
                        </TableCell>
                        <TableCell className="max-w-[140px] truncate" title={item.variant?.product?.name}>
                          {item.variant?.product?.name ?? "—"}
                        </TableCell>
                        <TableCell className="max-w-[120px] truncate" title={item.variant?.name}>
                          {item.variant?.name ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={typeBadgeClass(item.type, item.quantity)}
                            variant="outline"
                          >
                            {TYPE_LABELS[item.type] ?? item.type}
                          </Badge>
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-medium tabular-nums",
                            item.quantity > 0 ? "text-green-600" : "text-red-600"
                          )}
                        >
                          {item.quantity > 0 ? "+" : ""}
                          {item.quantity}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {item.previousStock}
                        </TableCell>
                        <TableCell className="text-right font-bold tabular-nums">
                          {item.newStock}
                        </TableCell>
                        <TableCell
                          className="text-xs text-muted-foreground max-w-[200px] truncate"
                          title={item.reason}
                        >
                          {item.reason || "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {item.user?.name ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {historyRows.length > 0 && (
              <PaginationControls
                currentPage={historyPage}
                totalPages={totalPages}
                itemsPerPage={historyLimit}
                totalItems={totalItems}
                startIndex={startIndex}
                endIndex={endIndex}
                onPageChange={setHistoryPage}
                onItemsPerPageChange={(n) => {
                  setHistoryLimit(n);
                  setHistoryPage(1);
                }}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
};

export default StockHistory;
