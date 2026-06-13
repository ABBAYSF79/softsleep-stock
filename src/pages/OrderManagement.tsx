import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { DeleteConfirmDialog } from "@/components/common/DeleteConfirmDialog";
import { FloatingActionBar } from "@/components/common/FloatingActionBar";
import { OrderManagementDialog } from "@/components/orders/OrderManagementDialog";
import { OrderTicketDialog } from "@/components/orders/OrderTicketDialog";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { useDeleteOrder, usePaginatedOrders, useUsers } from "@/hooks/useApi";
import { useDebounce } from "@/hooks/useDebounce";
import { useRowSelection } from "@/hooks/useRowSelection";
import { formatPrice, formatVariantDetails, getProductName } from "@/utils/order-utils";
import { exportOrdersToExcel } from "@/utils/excel-export";
import { exportSelectedOrdersToPdfArabic } from "@/utils/order-management-pdf";
import Barcode from "react-barcode";
import { toast } from "sonner";
import { Barcode as BarcodeIcon, Copy, Eye, FileSpreadsheet, FileText, MoreHorizontal, Pencil, Plus, Printer, RotateCw, Trash2 } from "lucide-react";
import { DateRange } from "react-day-picker";
import { endOfDay, endOfMonth, startOfDay, startOfMonth, subDays } from "date-fns";

const OrderManagement = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [viewingOrder, setViewingOrder] = useState<any>(null);

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingOrder, setDeletingOrder] = useState<any>(null);
  const [isTicketOpen, setIsTicketOpen] = useState(false);
  const [ticketOrder, setTicketOrder] = useState<any>(null);

  const [barcodeValue, setBarcodeValue] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  const { data: users } = useUsers();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [salesmanIdFilter, setSalesmanIdFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>();

  const debouncedSearch = useDebounce(searchQuery, 150);

  const dateParams = useMemo(() => {
    if (dateFilter === "all") return {};

    const now = new Date();

    if (dateFilter === "custom") {
      if (!customDateRange?.from || !customDateRange?.to) return {};
      const from = startOfDay(customDateRange.from);
      const to = endOfDay(customDateRange.to);
      return { startDate: from.toISOString(), endDate: to.toISOString() };
    }

    if (dateFilter === "today") {
      const from = startOfDay(now);
      const to = endOfDay(now);
      return { startDate: from.toISOString(), endDate: to.toISOString() };
    }

    if (dateFilter === "yesterday") {
      const d = subDays(now, 1);
      const from = startOfDay(d);
      const to = endOfDay(d);
      return { startDate: from.toISOString(), endDate: to.toISOString() };
    }

    if (dateFilter === "last7days") {
      const from = startOfDay(subDays(now, 6));
      const to = endOfDay(now);
      return { startDate: from.toISOString(), endDate: to.toISOString() };
    }

    if (dateFilter === "thisMonth") {
      const from = startOfMonth(now);
      const to = endOfDay(endOfMonth(now));
      return { startDate: from.toISOString(), endDate: to.toISOString() };
    }

    return {};
  }, [dateFilter, customDateRange]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (searchQuery.trim()) count += 1;
    if (statusFilter !== "all") count += 1;
    if (isAdmin && salesmanIdFilter !== "all") count += 1;
    if (dateFilter !== "all") count += 1;
    return count;
  }, [searchQuery, statusFilter, isAdmin, salesmanIdFilter, dateFilter]);

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setSalesmanIdFilter("all");
    setDateFilter("all");
    setCustomDateRange(undefined);
  };

  const paginatedFilters = useMemo(
    () => ({
      page: currentPage,
      limit: itemsPerPage,
      status: statusFilter,
      search: debouncedSearch,
      ...(isAdmin && salesmanIdFilter !== "all" ? { salesmanId: salesmanIdFilter } : {}),
      ...dateParams,
    }),
    [
      currentPage,
      itemsPerPage,
      debouncedSearch,
      statusFilter,
      isAdmin,
      salesmanIdFilter,
      dateParams,
    ]
  );

  const { data: ordersData, isLoading, error, refetch, isRefetching } = usePaginatedOrders(paginatedFilters);
  const orders = ordersData?.data || [];
  const meta = ordersData?.meta || { total: 0, page: 1, limit: itemsPerPage, totalPages: 0 };

  const deleteOrderMutation = useDeleteOrder();
  const { selectedIds, clear: clearSelection, toggleOne, setManySelected } = useRowSelection<number>();
  const selectedOrders = useMemo(
    () => orders.filter((o: any) => selectedIds.has(Number(o.id))),
    [orders, selectedIds]
  );

  const handleNewOrder = () => {
    setViewingOrder(null);
    setIsDialogOpen(true);
  };

  const handleViewOrder = (order: any) => {
    setViewingOrder(order);
    setIsDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      setViewingOrder(null);
    }
    setIsDialogOpen(open);
  };

  const handleDeleteClick = useCallback((order: any) => {
    setDeletingOrder(order);
    setIsDeleteDialogOpen(true);
  }, []);

  const handleConfirmDelete = (password: string) => {
    if (!deletingOrder) return;
    deleteOrderMutation.mutate(
      { id: deletingOrder.id, password },
      {
        onSuccess: () => {
          setIsDeleteDialogOpen(false);
          setDeletingOrder(null);
        },
      }
    );
  };

  const copyToClipboard = useCallback(async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied");
    } catch {
      toast.error("Failed to copy");
    }
  }, []);

  const buildOrderCopyText = useCallback((order: any) => {
    const lines: string[] = [];
    const items = Array.isArray(order.items) ? order.items : [];
    const supplementaryItems = Array.isArray(order.pillowItems) ? order.pillowItems : [];
    const note = typeof order.note === "string" ? order.note.trim() : "";

    lines.push(`Commande #${order.id ?? "-"}`);
    lines.push(`Client: ${order.customerName || "-"}`);
    lines.push(`Tél: ${order.phone || "-"}`);
    lines.push(`Ville: ${order.city || "-"}`);
    lines.push(`Adresse: ${order.address || "-"}`);
    lines.push(`Prix: ${formatPrice(order.totalAmount)} MAD`);
    lines.push("Produits:");

    for (const it of items) {
      const name = getProductName(it);
      const variant = formatVariantDetails(it);
      const qty = it.quantity ?? 0;
      lines.push(`- ${qty}x ${name} (${variant})`);
    }

    for (const it of supplementaryItems) {
      const name = it.pillowName || "Produit supplémentaire";
      const qty = it.quantity ?? 0;
      lines.push(`- ${qty}x ${name} (supplimentaire)`);
    }

    if (items.length === 0 && supplementaryItems.length === 0) {
      lines.push("-");
    }

    lines.push(`Note: ${note}`);

    return lines.join("\n");
  }, []);

  const handleToggleSelected = useCallback((id: number) => {
    toggleOne(Number(id));
  }, [toggleOne]);

  const handleOpenBarcode = useCallback((value: string) => {
    setBarcodeValue(value);
  }, []);

  const handlePrintOrder = useCallback((order: any) => {
    setTicketOrder(order);
    setIsTicketOpen(true);
  }, []);

  const handleNavigateAdvanced = useCallback((id: number) => {
    navigate(`/advanced-edit?orderId=${id}`);
  }, [navigate]);

  const handleCopyOrderInfo = useCallback((order: any) => {
    copyToClipboard(buildOrderCopyText(order));
  }, [buildOrderCopyText, copyToClipboard]);

  const handleBulkCopy = useCallback(async () => {
    const text = selectedOrders
      .map((o: any) => buildOrderCopyText(o))
      .join("\n\n--------------------------------\n\n");
    await copyToClipboard(text);
    clearSelection();
  }, [selectedOrders, buildOrderCopyText, copyToClipboard, clearSelection]);

  const handleBulkExcel = useCallback(async () => {
    if (!selectedOrders.length) return;
    try {
      await exportOrdersToExcel(
        selectedOrders,
        `orders-selected-${new Date().toISOString().slice(0, 10)}.xlsx`
      );
      toast.success("Excel exported");
      clearSelection();
    } catch {
      toast.error("Failed to export Excel");
    }
  }, [selectedOrders, clearSelection]);

  const handleBulkPdf = useCallback(async () => {
    if (!selectedOrders.length) return;
    try {
      await exportSelectedOrdersToPdfArabic(
        selectedOrders,
        `orders-selected-${new Date().toISOString().slice(0, 10)}.pdf`
      );
      toast.success("PDF exported");
      clearSelection();
    } catch {
      toast.error("Failed to export PDF");
    }
  }, [selectedOrders, clearSelection]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleItemsPerPageChange = (items: number) => {
    setItemsPerPage(items);
    setCurrentPage(1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, salesmanIdFilter, dateFilter, dateParams]);

  useEffect(() => {
    clearSelection();
  }, [currentPage, itemsPerPage, searchQuery, statusFilter, salesmanIdFilter, dateFilter, dateParams, clearSelection]);

  const pageRowIds = useMemo(() => orders.map((o: any) => Number(o.id)).filter((n: number) => Number.isFinite(n)), [orders]);

  const pageSelectedCount = useMemo(() => {
    let count = 0;
    for (const id of pageRowIds) {
      if (selectedIds.has(id)) count += 1;
    }
    return count;
  }, [pageRowIds, selectedIds]);

  const selectAllState: boolean | "indeterminate" = useMemo(() => {
    if (pageRowIds.length === 0) return false;
    if (pageSelectedCount === 0) return false;
    if (pageSelectedCount === pageRowIds.length) return true;
    return "indeterminate";
  }, [pageRowIds.length, pageSelectedCount]);

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-lg">Loading orders...</div>
        </div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center h-[50vh] gap-4">
          <div className="text-lg text-red-600 font-medium">Error loading orders</div>
          <p className="text-gray-500">
            {(error as any)?.response?.data?.error || (error as Error).message}
          </p>
          <Button onClick={() => refetch()} variant="outline" disabled={isRefetching}>
            {isRefetching ? "Retrying..." : "Try Again"}
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className={selectedIds.size ? "space-y-6 pb-24" : "space-y-6"}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">Order Management</h1>
            <div className="text-sm text-muted-foreground">
              Create orders fast, review details, and run admin-only operations.
            </div>
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Filters</CardTitle>
            <div className="flex items-center gap-2">
              <Button onClick={handleNewOrder} size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Add order
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isRefetching}
                className="gap-2"
              >
                <RotateCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Badge variant="secondary" className="tabular-nums">
                {activeFiltersCount}
              </Badge>
              <Button variant="outline" size="sm" onClick={clearFilters} disabled={activeFiltersCount === 0}>
                Clear
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">Search</div>
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search ..."
                />
              </div>

              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">Status</div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="IN_PROCESS">In Process</SelectItem>
                    <SelectItem value="DELIVERED">Delivered</SelectItem>
                    <SelectItem value="RETURNED">Returned</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {isAdmin && (
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">Salesman</div>
                  <SearchableSelect
                    value={salesmanIdFilter}
                    onValueChange={(value) => setSalesmanIdFilter(value || "all")}
                    options={[
                      { label: "All", value: "all" },
                      ...(Array.isArray(users)
                        ? users
                            .filter((u: any) => u.active !== false && u.role !== "ADMIN")
                            .map((u: any) => ({ label: u.name, value: String(u.id) }))
                        : []),
                    ]}
                    placeholder="All"
                    searchPlaceholder="Search salesman..."
                  />
                </div>
              )}

              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">Date</div>
                <Select value={dateFilter} onValueChange={setDateFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All time" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All time</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="yesterday">Yesterday</SelectItem>
                    <SelectItem value="last7days">Last 7 days</SelectItem>
                    <SelectItem value="thisMonth">This month</SelectItem>
                    <SelectItem value="custom">Custom range</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {dateFilter === "custom" && (
              <div className="max-w-md">
                <DateRangePicker value={customDateRange} onChange={setCustomDateRange} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Orders</CardTitle>
            <Badge variant="secondary" className="tabular-nums">
              {meta.total}
            </Badge>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <div className="flex items-center justify-center">
                      <Checkbox
                        checked={selectAllState}
                        onCheckedChange={(checked) => {
                          setManySelected(pageRowIds, Boolean(checked));
                        }}
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Select all rows"
                      />
                    </div>
                  </TableHead>
                  <TableHead>Order #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Delivery service</TableHead>
                  <TableHead>City / Tracking</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order: any) => (
                  <OrderRow
                    key={order.id}
                    order={order}
                    isAdmin={isAdmin}
                    isSelected={selectedIds.has(Number(order.id))}
                    onRowClick={handleViewOrder}
                    onToggleSelected={handleToggleSelected}
                    onCopyPhone={copyToClipboard}
                    onCopyTracking={copyToClipboard}
                    onOpenBarcode={handleOpenBarcode}
                    onPrintOrder={handlePrintOrder}
                    onNavigateAdvanced={handleNavigateAdvanced}
                    onDelete={handleDeleteClick}
                    onCopyOrderInfo={handleCopyOrderInfo}
                  />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <PaginationControls
          currentPage={currentPage}
          totalPages={meta.totalPages}
          onPageChange={handlePageChange}
          itemsPerPage={itemsPerPage}
          onItemsPerPageChange={handleItemsPerPageChange}
          totalItems={meta.total}
          startIndex={(currentPage - 1) * itemsPerPage}
          endIndex={Math.min(currentPage * itemsPerPage, meta.total)}
        />
      </div>

      <OrderManagementDialog open={isDialogOpen} onOpenChange={handleDialogClose} order={viewingOrder} />
      <OrderTicketDialog
        open={isTicketOpen}
        onOpenChange={setIsTicketOpen}
        order={ticketOrder}
        requireInProcessTracking={false}
      />

      {isAdmin && (
        <DeleteConfirmDialog
          open={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
          onConfirm={handleConfirmDelete}
          title="Delete Order"
          description="Enter admin code to delete this order. This action cannot be undone."
          itemName={`Order #${deletingOrder?.id} - ${deletingOrder?.customerName}`}
          isPending={deleteOrderMutation.isPending}
        />
      )}

      <Dialog
        open={Boolean(barcodeValue)}
        onOpenChange={(open) => {
          if (!open) setBarcodeValue(null);
        }}
      >
        <DialogContent className="w-[96vw] max-w-[96vw] sm:w-[760px] sm:max-w-[760px]">
          <DialogHeader>
            <DialogTitle>Tracking barcode</DialogTitle>
          </DialogHeader>
          {barcodeValue && (
            <div className="space-y-3">
              <div className="bg-white rounded-md border p-4 w-full max-w-full overflow-x-auto">
                <div className="min-w-max flex justify-center">
                  <Barcode
                    value={barcodeValue}
                    format="CODE128"
                    displayValue
                    height={92}
                    width={1.25}
                    fontSize={14}
                    margin={0}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-muted-foreground tabular-nums break-all">{barcodeValue}</div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(barcodeValue)}
                >
                  Copy
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <FloatingActionBar open={selectedIds.size > 0}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <Badge variant="secondary" className="tabular-nums">
            {selectedIds.size} selected
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => clearSelection()}
          >
            Clear selection
          </Button>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-[repeat(3,minmax(120px,1fr))]">
          <Button
            type="button"
            size="sm"
            onClick={handleBulkCopy}
            disabled={selectedOrders.length === 0}
          >
            <Copy className="h-4 w-4 mr-2" />
            Copy
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleBulkExcel}
            disabled={selectedOrders.length === 0}
          >
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Excel
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleBulkPdf}
            disabled={selectedOrders.length === 0}
          >
            <FileText className="h-4 w-4 mr-2" />
            PDF
          </Button>
        </div>
      </FloatingActionBar>
    </MainLayout>
  );
};

export default OrderManagement;

type OrderRowProps = {
  order: any;
  isAdmin: boolean;
  isSelected: boolean;
  onRowClick: (order: any) => void;
  onToggleSelected: (id: number) => void;
  onCopyPhone: (value: string) => void;
  onCopyTracking: (value: string) => void;
  onOpenBarcode: (value: string) => void;
  onPrintOrder: (order: any) => void;
  onNavigateAdvanced: (id: number) => void;
  onDelete: (order: any) => void;
  onCopyOrderInfo: (order: any) => void;
};

const OrderRow = memo(function OrderRow({
  order,
  isAdmin,
  isSelected,
  onRowClick,
  onToggleSelected,
  onCopyPhone,
  onCopyTracking,
  onOpenBarcode,
  onPrintOrder,
  onNavigateAdvanced,
  onDelete,
  onCopyOrderInfo,
}: OrderRowProps) {
  return (
    <TableRow
      onClick={() => onRowClick(order)}
      className="cursor-pointer hover:bg-muted/50"
      data-selected={isSelected ? "true" : "false"}
    >
      <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-center">
          <Checkbox checked={isSelected} onCheckedChange={() => onToggleSelected(Number(order.id))} aria-label="Select row" />
        </div>
      </TableCell>
      <TableCell className="font-medium tabular-nums">{order.id}</TableCell>
      <TableCell>{order.customerName}</TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        {order.phone ? (
          <button
            type="button"
            onClick={() => onCopyPhone(String(order.phone).trim())}
            className="text-primary hover:underline tabular-nums"
          >
            {order.phone}
          </button>
        ) : (
          "-"
        )}
      </TableCell>
      <TableCell>{order.deliveryService?.name || "-"}</TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span>{order.city || "-"}</span>
          {order.trackingCode && (
            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => onCopyTracking(order.trackingCode)}
                className="text-xs text-muted-foreground tabular-nums hover:text-foreground"
              >
                {order.trackingCode}
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onOpenBarcode(order.trackingCode)}
                aria-label="Generate barcode"
                title="Generate barcode"
              >
                <BarcodeIcon className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </TableCell>
      <TableCell>
        {new Date(order.createdAt).toLocaleString(undefined, {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </TableCell>
      <TableCell>
        <OrderStatusBadge status={order.status} />
      </TableCell>
      <TableCell className="text-right tabular-nums">
        MAD {formatPrice(order.totalAmount)}
      </TableCell>
      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Print order ticket"
            title="Print order ticket"
            onClick={() => onPrintOrder(order)}
          >
            <Printer className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Order actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onRowClick(order)}>
                <Eye className="h-4 w-4 mr-2" />
                View
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onCopyOrderInfo(order)}>
                <Copy className="h-4 w-4 mr-2" />
                Copy order info
              </DropdownMenuItem>
              {isAdmin && (
                <>
                  <DropdownMenuItem onClick={() => onNavigateAdvanced(Number(order.id))}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Advanced edit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onDelete(order)}
                    className="text-red-600 focus:text-red-600"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
});

