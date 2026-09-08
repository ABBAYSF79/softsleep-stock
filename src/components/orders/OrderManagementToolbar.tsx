import { Activity, Plus, RotateCw, Search, X } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type OrderManagementToolbarProps = {
  totalOrders: number;
  subtitle: string;
  isAdmin: boolean;
  isLivreur: boolean;
  isRefetching: boolean;
  onRefresh: () => void;
  onAddOrder: () => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  salesmanIdFilter: string;
  onSalesmanIdFilterChange: (value: string) => void;
  deliveryServiceIdFilter: string;
  onDeliveryServiceIdFilterChange: (value: string) => void;
  dateFilter: string;
  onDateFilterChange: (value: string) => void;
  customDateRange: DateRange | undefined;
  onCustomDateRangeChange: (value: DateRange | undefined) => void;
  salesmanOptions: Array<{ label: string; value: string }>;
  deliveryServiceOptions: Array<{ label: string; value: string }>;
  activeFiltersCount: number;
  onClearFilters: () => void;
};

export function OrderManagementToolbar({
  totalOrders,
  subtitle,
  isAdmin,
  isLivreur,
  isRefetching,
  onRefresh,
  onAddOrder,
  searchQuery,
  onSearchQueryChange,
  statusFilter,
  onStatusFilterChange,
  salesmanIdFilter,
  onSalesmanIdFilterChange,
  deliveryServiceIdFilter,
  onDeliveryServiceIdFilterChange,
  dateFilter,
  onDateFilterChange,
  customDateRange,
  onCustomDateRangeChange,
  salesmanOptions,
  deliveryServiceOptions,
  activeFiltersCount,
  onClearFilters,
}: OrderManagementToolbarProps) {
  return (
    <section
      className="overflow-hidden rounded-lg border border-slate-200 bg-white"
      data-testid="order-management-toolbar"
    >
      {/* Header row */}
      <div
        className="flex items-start justify-between gap-2 px-3 py-2 sm:items-center sm:gap-3 sm:px-4 sm:py-2.5"
        data-testid="order-management-header"
      >
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <div className="flex min-w-0 items-center gap-2">
              <div className="hidden h-6 w-6 shrink-0 items-center justify-center rounded bg-matles-50 text-matles-700 ring-1 ring-inset ring-matles-100 sm:flex">
                <Activity className="h-3.5 w-3.5" aria-hidden />
              </div>
              <h1 className="truncate text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
                Order Management
              </h1>
            </div>
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700"
              data-testid="order-management-live"
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-600" />
              </span>
              Live
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-500 sm:text-sm">
            <span
              className="font-semibold tabular-nums text-slate-700"
              data-testid="order-management-count"
            >
              {totalOrders.toLocaleString()}
            </span>{" "}
            order{totalOrders !== 1 ? "s" : ""}
            <span className="mx-1.5 text-slate-300">·</span>
            {subtitle}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isRefetching}
            className="h-8 gap-1.5 px-2.5"
            data-testid="order-management-refresh"
          >
            <RotateCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {!isLivreur && (
            <Button
              onClick={onAddOrder}
              size="sm"
              className="h-8 gap-1.5 bg-matles-600 px-2.5 hover:bg-matles-700"
              data-testid="order-management-add"
            >
              <Plus className="h-3.5 w-3.5" />
              Add order
            </Button>
          )}
        </div>
      </div>

      {/* Filter toolbar */}
      <div
        className="border-t border-slate-100 bg-slate-50/40 px-3 py-2 sm:px-4"
        data-testid="order-management-filters"
      >
        <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2 lg:flex-nowrap">
          {/* Search — block on mobile so flex/basis never stretch height */}
          <div className="relative w-full shrink-0 sm:min-w-0 sm:flex-[1.4] sm:basis-[200px]">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") onSearchQueryChange("");
              }}
              placeholder="Search orders..."
              aria-label="Search orders by customer, phone, city, or order number"
              className="h-9 w-full rounded-md border-slate-200 bg-white pl-8 pr-8 text-sm shadow-none placeholder:text-slate-400 focus-visible:border-matles-300 focus-visible:ring-matles-200/50 focus-visible:ring-offset-0"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => onSearchQueryChange("")}
                className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-matles-300"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          <div className="grid w-full grid-cols-2 gap-1.5 sm:contents">
            <Select value={statusFilter} onValueChange={onStatusFilterChange}>
              <SelectTrigger
                className="h-9 w-full min-w-0 border-slate-200 bg-white text-sm shadow-none sm:flex-1 sm:basis-[140px]"
                aria-label="Filter by status"
              >
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="IN_PROCESS">In Process</SelectItem>
                <SelectItem value="DELIVERED">Delivered</SelectItem>
                <SelectItem value="RETURNED">Returned</SelectItem>
              </SelectContent>
            </Select>

            <Select value={dateFilter} onValueChange={onDateFilterChange}>
              <SelectTrigger
                className="h-9 w-full min-w-0 border-slate-200 bg-white text-sm shadow-none sm:flex-1 sm:basis-[140px]"
                aria-label="Filter by date"
              >
                <SelectValue placeholder="Date" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="last3months">Last 3 months</SelectItem>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="last7days">Last 7 days</SelectItem>
                <SelectItem value="thisMonth">This month</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid w-full grid-cols-2 gap-1.5 sm:contents">
            {isAdmin ? (
              <SearchableSelect
                value={salesmanIdFilter}
                onValueChange={(value) => onSalesmanIdFilterChange(value || "all")}
                options={[{ label: "All salesmen", value: "all" }, ...salesmanOptions]}
                placeholder="Salesman"
                searchPlaceholder="Search..."
                aria-label="Filter by salesman"
                className="h-9 w-full min-w-0 border-slate-200 bg-white text-sm shadow-none sm:flex-1 sm:basis-[150px]"
              />
            ) : null}

            <SearchableSelect
              value={deliveryServiceIdFilter}
              onValueChange={(value) => onDeliveryServiceIdFilterChange(value || "all")}
              options={[
                { label: "All delivery services", value: "all" },
                ...deliveryServiceOptions,
              ]}
              placeholder="Delivery service"
              searchPlaceholder="Search service..."
              aria-label="Filter by delivery service"
              className={
                isAdmin
                  ? "h-9 w-full min-w-0 border-slate-200 bg-white text-sm shadow-none sm:flex-1 sm:basis-[160px]"
                  : "col-span-2 h-9 w-full min-w-0 border-slate-200 bg-white text-sm shadow-none sm:col-span-1 sm:flex-1 sm:basis-[160px]"
              }
            />
          </div>

          {dateFilter === "custom" ? (
            <div className="w-full shrink-0 sm:min-w-0 sm:flex-[1.2] sm:basis-[180px]">
              <DateRangePicker value={customDateRange} onChange={onCustomDateRangeChange} />
            </div>
          ) : null}

          {activeFiltersCount > 0 ? (
            <div className="flex shrink-0 items-center gap-1.5 pt-0.5 sm:pt-0">
              <Badge
                variant="secondary"
                className="h-6 px-2 text-xs tabular-nums"
                data-testid="order-management-active-filters"
              >
                {activeFiltersCount} filter{activeFiltersCount !== 1 ? "s" : ""}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearFilters}
                className="h-8 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                data-testid="order-management-clear-filters"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
