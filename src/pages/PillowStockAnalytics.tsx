import { useEffect, useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { DateRange } from "react-day-picker";
import { endOfDay, format, startOfDay, startOfMonth, subMonths } from "date-fns";
import { LineChart, RefreshCw, Search } from "lucide-react";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { usePaginatedPillowStockHistory, usePillowStock, usePillowStockAnalytics } from "@/hooks/useApi";
import { formatPrice } from "@/utils/order-utils";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

type MetricTone = "neutral" | "green" | "red" | "blue" | "slate";

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const rows = payload
    .filter((p: any) => p && p.value !== undefined && p.value !== null)
    .map((p: any) => ({
      name: String(p.name || p.dataKey || ""),
      value: Number(p.value || 0),
      color: p.color,
    }));

  return (
    <div className="rounded-xl border border-slate-200/70 bg-white px-3 py-2 shadow-[0_20px_45px_-28px_rgba(15,23,42,0.45)]">
      <div className="text-xs font-medium text-slate-700">{label}</div>
      <div className="mt-2 space-y-1">
        {rows.map((r: any) => (
          <div key={r.name} className="flex items-center justify-between gap-6 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: r.color }} />
              <div className="truncate text-slate-600">{r.name}</div>
            </div>
            <div className="font-semibold tabular-nums text-slate-900">{r.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const ChartLegend = ({ payload }: any) => {
  if (!payload?.length) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-slate-600">
      {payload.map((entry: any) => (
        <div key={entry.value} className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <div className="font-medium">{entry.value}</div>
        </div>
      ))}
    </div>
  );
};

const MetricCard = ({
  title,
  value,
  subtitle,
  tone = "neutral",
  className,
}: {
  title: string;
  value: string | number;
  subtitle: string;
  tone?: MetricTone;
  className?: string;
}) => {
  const toneBorder =
    tone === "green"
      ? "border-l-4 border-l-emerald-500"
      : tone === "red"
      ? "border-l-4 border-l-red-500"
      : tone === "blue"
      ? "border-l-4 border-l-blue-500"
      : tone === "slate"
      ? "border-l-4 border-l-slate-400"
      : "border-l-4 border-l-slate-200";

  const toneDot =
    tone === "green"
      ? "bg-emerald-500"
      : tone === "red"
      ? "bg-red-500"
      : tone === "blue"
      ? "bg-blue-500"
      : tone === "slate"
      ? "bg-slate-400"
      : "bg-slate-300";

  return (
    <Card
      className={cn(
        "h-full min-h-[112px] rounded-xl border border-slate-200/70 bg-white shadow-[0_10px_30px_-22px_rgba(15,23,42,0.35)]",
        toneBorder,
        className
      )}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-slate-600 truncate">{title}</div>
            <div className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-slate-900">
              {value}
            </div>
            <div className="mt-1 text-xs text-slate-500">{subtitle}</div>
          </div>
          <div className="pt-1">
            <div className={cn("h-2 w-2 rounded-full", toneDot)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const PillowStockAnalytics = () => {
  const navigate = useNavigate();
  const [selectedPillowId, setSelectedPillowId] = useState<string>("ALL");
  const [dateFilter, setDateFilter] = useState<string>("last6Months");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [historySearch, setHistorySearch] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLimit, setHistoryLimit] = useState(50);

  const { data: pillows } = usePillowStock();

  useEffect(() => {
    const now = new Date();
    if (dateFilter === "custom") return;
    if (dateFilter === "thisMonth") {
      setDateRange({ from: startOfMonth(now), to: endOfDay(now) });
      return;
    }
    if (dateFilter === "last3Months") {
      setDateRange({ from: startOfMonth(subMonths(now, 2)), to: endOfDay(now) });
      return;
    }
    setDateRange({ from: startOfMonth(subMonths(now, 5)), to: endOfDay(now) });
  }, [dateFilter]);

  const rangeFrom = dateRange?.from ? startOfDay(dateRange.from).toISOString() : undefined;
  const rangeTo = dateRange?.to ? endOfDay(dateRange.to).toISOString() : undefined;

  const pillowIdNumber = selectedPillowId === "ALL" ? undefined : Number(selectedPillowId);
  const { data: analytics, isLoading: isLoadingAnalytics, refetch: refetchAnalytics, isRefetching } = usePillowStockAnalytics({
    from: rangeFrom,
    to: rangeTo,
    pillowId: pillowIdNumber,
  });

  const { data: historyData, isLoading: isLoadingHistory } = usePaginatedPillowStockHistory({
    page: historyPage,
    limit: historyLimit,
    pillowId: pillowIdNumber,
    from: rangeFrom,
    to: rangeTo,
    search: historySearch || undefined,
  });

  useEffect(() => {
    setHistoryPage(1);
  }, [selectedPillowId, rangeFrom, rangeTo, historySearch, historyLimit]);

  const summary = analytics?.summary || {
    openingStock: 0,
    closingStock: 0,
    currentStock: 0,
    supplyQty: 0,
    outgoingQty: 0,
    adjustmentNet: 0,
    initialQty: 0,
    netQty: 0,
    operations: 0,
  };

  const monthlyChartData = useMemo(() => {
    const monthly = Array.isArray(analytics?.monthly) ? analytics.monthly : [];
    return monthly.map((m: any) => {
      const labelDate = new Date(`${m.month}-01T00:00:00`);
      return {
        month: format(labelDate, "MMM yyyy"),
        supply: Number(m.supplyQty || 0),
        outgoing: Number(m.outgoingQty || 0),
        adjustment: Number(m.adjustmentNet || 0),
        initial: Number(m.initialQty || 0),
        net: Number(m.netQty || 0),
        operations: Number(m.operations || 0),
      };
    });
  }, [analytics?.monthly]);

  const perPillow = useMemo(() => {
    return Array.isArray(analytics?.perPillow) ? analytics.perPillow : [];
  }, [analytics?.perPillow]);

  const historyRows = (historyData?.data || []) as any[];
  const historyMeta = historyData?.meta;
  const totalItems = historyMeta?.total ?? historyRows.length;
  const totalPages = historyMeta?.totalPages ?? 1;
  const startIndex = (historyPage - 1) * historyLimit;
  const endIndex = startIndex + historyRows.length;

  const currentStockTotal = useMemo(() => {
    if (!Array.isArray(pillows)) return 0;
    if (pillowIdNumber) {
      const p = pillows.find((x: any) => Number(x.id) === pillowIdNumber);
      return Number(p?.stock || 0);
    }
    return pillows.reduce((sum: number, p: any) => sum + Number(p.stock || 0), 0);
  }, [pillows, pillowIdNumber]);

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <LineChart className="h-6 w-6" />
              Accessoires Stock Analytics
            </h1>
            <div className="text-sm text-gray-500">Entrée / Sortie history + monthly analysis</div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate("/pillow-orders")}>
              Accessoires Orders
            </Button>
            <Button variant="outline" onClick={() => navigate("/pillow-stock")}>
              Accessoires Stock
            </Button>
            <Button variant="outline" onClick={() => refetchAnalytics()} disabled={isRefetching} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-4 space-y-2">
                <div className="text-sm font-medium">Accessoire</div>
                <Select value={selectedPillowId} onValueChange={setSelectedPillowId}>
                  <SelectTrigger>
                    <SelectValue placeholder="All accessoires" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All accessoires</SelectItem>
                    {(Array.isArray(pillows) ? pillows : []).map((p: any) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name} (Stock {p.stock} | MAD {formatPrice(p.price)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-3 space-y-2">
                <div className="text-sm font-medium">Date Filter</div>
                <Select value={dateFilter} onValueChange={setDateFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="thisMonth">This month</SelectItem>
                    <SelectItem value="last3Months">Last 3 months</SelectItem>
                    <SelectItem value="last6Months">Last 6 months</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-5 space-y-2">
                <div className="text-sm font-medium">Range</div>
                <DateRangePicker date={dateRange} onSelect={setDateRange} />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-8 gap-4">
          <MetricCard
            className="lg:col-span-2"
            title="Current Stock"
            value={currentStockTotal}
            subtitle="All time (current)"
            tone="neutral"
          />
          <MetricCard title="Opening Stock" value={summary.openingStock} subtitle="Before range" tone="slate" />
          <MetricCard title="Closing Stock" value={summary.closingStock} subtitle="End of range" tone="slate" />
          <MetricCard title="Supply" value={summary.supplyQty} subtitle="Only SUPPLY" tone="green" />
          <MetricCard title="Outgoing" value={summary.outgoingQty} subtitle="Only OUTGOING" tone="red" />
          <MetricCard title="Adjustment" value={summary.adjustmentNet} subtitle="Net ADJUSTMENT" tone="blue" />
          <MetricCard title="Initial" value={summary.initialQty} subtitle="Only INITIAL" tone="slate" />
        </div>

        <Card className="rounded-xl border border-slate-200/70 bg-white shadow-[0_10px_30px_-22px_rgba(15,23,42,0.35)]">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-base tracking-tight">Monthly Movement</CardTitle>
                <div className="mt-1 text-xs text-slate-500">Supply / Outgoing / Adjustment / Initial per month</div>
              </div>
              <div className="text-xs text-slate-500 tabular-nums">
                {dateRange?.from && dateRange?.to ? `${format(dateRange.from, "dd/MM/yy")} → ${format(dateRange.to, "dd/MM/yy")}` : "All time"}
              </div>
            </div>
          </CardHeader>
          <CardContent className="h-[360px] pt-0">
            {isLoadingAnalytics ? (
              <div className="text-sm text-gray-500">Loading...</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={monthlyChartData}
                  margin={{ top: 10, right: 18, left: 0, bottom: 6 }}
                  barCategoryGap="22%"
                  barGap={6}
                >
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
                  <XAxis
                    dataKey="month"
                    axisLine={false}
                    tickLine={false}
                    tickMargin={10}
                    tick={{ fill: "#64748b", fontSize: 12 }}
                  />
                  <YAxis axisLine={false} tickLine={false} tickMargin={10} tick={{ fill: "#64748b", fontSize: 12 }} />
                  <Tooltip cursor={{ fill: "rgba(148, 163, 184, 0.12)" }} content={<ChartTooltip />} />
                  <Legend content={<ChartLegend />} />
                  <Bar dataKey="supply" name="Supply" fill="#16a34a" radius={[10, 10, 2, 2]} maxBarSize={52} />
                  <Bar dataKey="outgoing" name="Outgoing" fill="#dc2626" radius={[10, 10, 2, 2]} maxBarSize={52} />
                  <Bar dataKey="adjustment" name="Adjustment" fill="#2563eb" radius={[10, 10, 2, 2]} maxBarSize={52} />
                  <Bar dataKey="initial" name="Initial" fill="#64748b" radius={[10, 10, 2, 2]} maxBarSize={52} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-slate-200/70 bg-white shadow-[0_10px_30px_-22px_rgba(15,23,42,0.35)]">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-base tracking-tight">Monthly Breakdown</CardTitle>
                <div className="mt-1 text-xs text-slate-500">Clean breakdown to compare months quickly</div>
              </div>
              <div className="text-xs text-slate-500 tabular-nums">
                Rows: <span className="font-medium text-slate-700">{monthlyChartData.length}</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-hidden rounded-xl border border-slate-200/70">
              <Table>
                <TableHeader className="bg-slate-50/70">
                  <TableRow className="hover:bg-slate-50/70">
                    <TableHead className="h-11 text-xs font-semibold tracking-tight text-slate-600">Month</TableHead>
                    <TableHead className="h-11 text-xs font-semibold tracking-tight text-slate-600 text-right">Supply</TableHead>
                    <TableHead className="h-11 text-xs font-semibold tracking-tight text-slate-600 text-right">Outgoing</TableHead>
                    <TableHead className="h-11 text-xs font-semibold tracking-tight text-slate-600 text-right">Adjustment</TableHead>
                    <TableHead className="h-11 text-xs font-semibold tracking-tight text-slate-600 text-right">Initial</TableHead>
                    <TableHead className="h-11 text-xs font-semibold tracking-tight text-slate-600 text-right">Net</TableHead>
                    <TableHead className="h-11 text-xs font-semibold tracking-tight text-slate-600 text-right">Ops</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyChartData.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-500">
                        No history found for this range.
                      </TableCell>
                    </TableRow>
                  ) : (
                    monthlyChartData.map((row: any) => (
                      <TableRow key={row.month} className="hover:bg-slate-50/60">
                        <TableCell className="py-4 font-medium text-slate-900">{row.month}</TableCell>
                        <TableCell className="py-4 text-right font-semibold tabular-nums text-emerald-700">{row.supply}</TableCell>
                        <TableCell className="py-4 text-right font-semibold tabular-nums text-red-700">{row.outgoing}</TableCell>
                        <TableCell className="py-4 text-right font-semibold tabular-nums text-blue-700">{row.adjustment}</TableCell>
                        <TableCell className="py-4 text-right font-semibold tabular-nums text-slate-700">{row.initial}</TableCell>
                        <TableCell className="py-4 text-right font-semibold tabular-nums text-slate-900">{row.net}</TableCell>
                        <TableCell className="py-4 text-right tabular-nums text-slate-600">{row.operations}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Per Accessoire Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Accessoire</TableHead>
                  <TableHead className="text-right">Initial</TableHead>
                  <TableHead className="text-right">Opening</TableHead>
                  <TableHead className="text-right">Closing</TableHead>
                  <TableHead className="text-right">Current</TableHead>
                  <TableHead className="text-right">Supply</TableHead>
                  <TableHead className="text-right">Out</TableHead>
                  <TableHead className="text-right">Adj</TableHead>
                  <TableHead className="text-right">Init</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {perPillow.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-8 text-center text-sm text-gray-500">
                      No data.
                    </TableCell>
                  </TableRow>
                ) : (
                  perPillow.map((p: any) => (
                    <TableRow key={p.pillowId}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-right">{p.initialStock}</TableCell>
                      <TableCell className="text-right">{p.openingStock}</TableCell>
                      <TableCell className="text-right">{p.closingStock}</TableCell>
                      <TableCell className="text-right font-medium">{p.currentStock}</TableCell>
                      <TableCell className="text-right text-green-700 font-medium">{p.supplyQty}</TableCell>
                      <TableCell className="text-right text-red-700 font-medium">{p.outgoingQty}</TableCell>
                      <TableCell className="text-right text-blue-700 font-medium">{p.adjustmentNet}</TableCell>
                      <TableCell className="text-right text-slate-700 font-medium">{p.initialQty}</TableCell>
                      <TableCell className="text-right font-medium">{p.netQty}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              <div className="md:col-span-6 space-y-2">
                <div className="text-sm font-medium">Search (Reason)</div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    className="pl-10"
                    placeholder="Search reason..."
                  />
                </div>
              </div>
              <div className="md:col-span-6 text-sm text-gray-500">
                {dateRange?.from && dateRange?.to
                  ? `${format(dateRange.from, "dd/MM/yyyy")} → ${format(dateRange.to, "dd/MM/yyyy")}`
                  : "All dates"}
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Date</TableHead>
                    <TableHead>Accessoire</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Prev</TableHead>
                    <TableHead className="text-right">New</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>User</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingHistory ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-6 text-sm text-gray-500">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : historyRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-sm text-gray-500">
                        No history found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    historyRows.map((h: any) => (
                      <TableRow key={h.id}>
                        <TableCell className="whitespace-nowrap text-xs text-gray-500">
                          {h.createdAt ? format(new Date(h.createdAt), "dd/MM/yy HH:mm") : "-"}
                        </TableCell>
                        <TableCell className="font-medium">{h.pillow?.name || "-"}</TableCell>
                        <TableCell className="text-xs">{h.type}</TableCell>
                        <TableCell className={`text-right font-medium ${Number(h.quantity) >= 0 ? "text-green-700" : "text-red-700"}`}>
                          {Number(h.quantity) >= 0 ? `+${h.quantity}` : h.quantity}
                        </TableCell>
                        <TableCell className="text-right text-xs text-gray-600">{h.previousStock}</TableCell>
                        <TableCell className="text-right text-xs text-gray-600">{h.newStock}</TableCell>
                        <TableCell className="text-xs">{h.reason || "-"}</TableCell>
                        <TableCell className="text-xs">{h.user?.name || "-"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <PaginationControls
              currentPage={historyPage}
              totalPages={totalPages}
              onPageChange={setHistoryPage}
              itemsPerPage={historyLimit}
              onItemsPerPageChange={setHistoryLimit}
              totalItems={totalItems}
              startIndex={startIndex}
              endIndex={endIndex}
            />
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
};

export default PillowStockAnalytics;
