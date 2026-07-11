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
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { DeleteConfirmDialog } from "@/components/common/DeleteConfirmDialog";
import { FloatingActionBar } from "@/components/common/FloatingActionBar";
import { OrderManagementDialog } from "@/components/orders/OrderManagementDialog";
import { OrderGuaranteeDialog } from "@/components/orders/OrderGuaranteeDialog";
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
import { BadgeCheck, Barcode as BarcodeIcon, Copy, Eye, FileSpreadsheet, FileText, MessageSquare, MoreHorizontal, Pencil, Plus, Printer, RotateCw, Search, Trash2, X } from "lucide-react";
import { DateRange } from "react-day-picker";
import { endOfDay, endOfMonth, format, startOfDay, startOfMonth, subDays, subMonths } from "date-fns";

const OrderManagement = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const isLivreur = user?.role === "LIVREUR";
  const isSuivi = user?.role === "SUIVI";

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [viewingOrder, setViewingOrder] = useState<any>(null);

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingOrder, setDeletingOrder] = useState<any>(null);
  const [isTicketOpen, setIsTicketOpen] = useState(false);
  const [ticketOrder, setTicketOrder] = useState<any>(null);
  const [isGuaranteeOpen, setIsGuaranteeOpen] = useState(false);
  const [guaranteeOrder, setGuaranteeOrder] = useState<any>(null);

  const [barcodeValue, setBarcodeValue] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const { data: users } = useUsers({ enabled: isAdmin });

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [salesmanIdFilter, setSalesmanIdFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [dateFilter, setDateFilter] = useState<string>("last3months");
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

    if (dateFilter === "last3months") {
      const from = startOfDay(subMonths(now, 3));
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
    if (dateFilter !== "last3months") count += 1;
    return count;
  }, [searchQuery, statusFilter, isAdmin, salesmanIdFilter, dateFilter]);

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setSalesmanIdFilter("all");
    setDateFilter("last3months");
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
    const salesNote = typeof order.note === "string" ? order.note.trim() : "";
    const livreurNote = typeof order.livreurNote === "string" ? order.livreurNote.trim() : "";

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

    if (salesNote) lines.push(`Note sales: ${salesNote}`);
    if (livreurNote) lines.push(`Note livreur: ${livreurNote}`);
    if (!salesNote && !livreurNote) lines.push("Note: —");

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

  const handleOpenGuarantee = useCallback((order: any) => {
    setGuaranteeOrder(order);
    setIsGuaranteeOpen(true);
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
      <div className={selectedIds.size ? "space-y-4 pb-24" : "space-y-4"}>
        {/* Page header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-gray-900">
              Order Management
            </h1>
            <p className="text-sm text-muted-foreground">
              {meta.total.toLocaleString()} order{meta.total !== 1 ? "s" : ""}
              {isLivreur || isSuivi ? " · assigned delivery services" : " · create, review & manage"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isRefetching}
              className="h-8 gap-1.5"
            >
              <RotateCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            {!isLivreur && (
              <Button onClick={handleNewOrder} size="sm" className="h-8 gap-1.5 bg-matles-600 hover:bg-matles-700">
                <Plus className="h-3.5 w-3.5" />
                Add order
              </Button>
            )}
          </div>
        </div>

        {/* Compact filter toolbar */}
        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search orders..."
                className="h-8 pl-8 text-sm"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-[120px] text-sm">
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

            {isAdmin && (
              <SearchableSelect
                value={salesmanIdFilter}
                onValueChange={(value) => setSalesmanIdFilter(value || "all")}
                options={[
                  { label: "All salesmen", value: "all" },
                  ...(Array.isArray(users)
                    ? users
                        .filter((u: any) => u.active !== false && u.role !== "ADMIN")
                        .map((u: any) => ({ label: u.name, value: String(u.id) }))
                    : []),
                ]}
                placeholder="Salesman"
                searchPlaceholder="Search..."
                className="h-8 w-[140px] text-sm"
              />
            )}

            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="h-8 w-[130px] text-sm">
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

            {dateFilter === "custom" && (
              <DateRangePicker value={customDateRange} onChange={setCustomDateRange} />
            )}

            {activeFiltersCount > 0 && (
              <>
                <Badge variant="secondary" className="h-6 px-2 text-xs tabular-nums">
                  {activeFiltersCount} filter{activeFiltersCount !== 1 ? "s" : ""}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-8 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Orders table */}
        <Card className="overflow-hidden border-gray-200 shadow-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-gray-200 bg-gray-50/90 hover:bg-gray-50/90">
                    <TableHead className="h-10 w-10 px-3">
                      {!isLivreur && !isSuivi && (
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
                      )}
                    </TableHead>
                    <TableHead className="h-10 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Order
                    </TableHead>
                    <TableHead className="h-10 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Customer
                    </TableHead>
                    <TableHead className="h-10 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Phone
                    </TableHead>
                    <TableHead className="h-10 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Delivery
                    </TableHead>
                    <TableHead className="h-10 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      City / Tracking
                    </TableHead>
                    <TableHead className="h-10 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Date
                    </TableHead>
                    <TableHead className="h-10 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Status
                    </TableHead>
                    <TableHead className="h-10 px-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Total
                    </TableHead>
                    <TableHead className="h-10 w-[120px] px-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={10}
                        className="py-16 text-center text-sm text-muted-foreground"
                      >
                        No orders match your filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    orders.map((order: any) => (
                      <OrderRow
                        key={order.id}
                        order={order}
                        isAdmin={isAdmin}
                        isLivreur={isLivreur}
                        isSuivi={isSuivi}
                        isSelected={selectedIds.has(Number(order.id))}
                        onRowClick={handleViewOrder}
                        onToggleSelected={handleToggleSelected}
                        onCopyPhone={copyToClipboard}
                        onCopyTracking={copyToClipboard}
                        onOpenBarcode={handleOpenBarcode}
                        onPrintOrder={handlePrintOrder}
                        onOpenGuarantee={handleOpenGuarantee}
                        onNavigateAdvanced={handleNavigateAdvanced}
                        onDelete={handleDeleteClick}
                        onCopyOrderInfo={handleCopyOrderInfo}
                      />
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
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
      <OrderGuaranteeDialog
        open={isGuaranteeOpen}
        onOpenChange={setIsGuaranteeOpen}
        order={guaranteeOrder}
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

      <FloatingActionBar open={!isLivreur && !isSuivi && selectedIds.size > 0}>
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
  isLivreur: boolean;
  isSuivi: boolean;
  isSelected: boolean;
  onRowClick: (order: any) => void;
  onToggleSelected: (id: number) => void;
  onCopyPhone: (value: string) => void;
  onCopyTracking: (value: string) => void;
  onOpenBarcode: (value: string) => void;
  onPrintOrder: (order: any) => void;
  onOpenGuarantee: (order: any) => void;
  onNavigateAdvanced: (id: number) => void;
  onDelete: (order: any) => void;
  onCopyOrderInfo: (order: any) => void;
};

const OrderRow = memo(function OrderRow({
  order,
  isAdmin,
  isLivreur,
  isSuivi,
  isSelected,
  onRowClick,
  onToggleSelected,
  onCopyPhone,
  onCopyTracking,
  onOpenBarcode,
  onPrintOrder,
  onOpenGuarantee,
  onNavigateAdvanced,
  onDelete,
  onCopyOrderInfo,
}: OrderRowProps) {
  return (
    <TableRow
      onClick={() => onRowClick(order)}
      className={`cursor-pointer border-b border-gray-100 transition-colors hover:bg-gray-50/80 ${
        isSelected ? "bg-matles-50/60" : ""
      }`}
      data-selected={isSelected ? "true" : "false"}
    >
      <TableCell className="w-10 px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
        {!isLivreur && !isSuivi && (
          <div className="flex items-center justify-center">
            <Checkbox checked={isSelected} onCheckedChange={() => onToggleSelected(Number(order.id))} aria-label="Select row" />
          </div>
        )}
      </TableCell>
      <TableCell className="px-3 py-2.5">
        <span className="font-semibold tabular-nums text-matles-700">#{order.id}</span>
      </TableCell>
      <TableCell className="px-3 py-2.5">
        <div className="min-w-0 max-w-[220px]">
          <span className="font-medium text-gray-900">{order.customerName}</span>
          {typeof order.note === "string" && order.note.trim() && (
            <div
              className="mt-1 flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] leading-snug text-amber-950 ring-1 ring-inset ring-amber-200/70"
              title={order.note.trim()}
            >
              <MessageSquare className="h-3 w-3 shrink-0 text-amber-600" aria-hidden />
              <span className="truncate">{order.note.trim()}</span>
            </div>
          )}
        </div>
      </TableCell>
      <TableCell className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
        {order.phone ? (
          <button
            type="button"
            onClick={() => onCopyPhone(String(order.phone).trim())}
            className="text-sm tabular-nums text-matles-600 hover:underline"
          >
            {order.phone}
          </button>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="px-3 py-2.5 text-sm text-gray-700">
        {order.deliveryService?.name || "—"}
      </TableCell>
      <TableCell className="px-3 py-2.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-gray-800">{order.city || "—"}</span>
          {order.trackingCode && (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => onCopyTracking(order.trackingCode)}
                className="max-w-[120px] truncate text-xs tabular-nums text-muted-foreground hover:text-foreground"
                title={order.trackingCode}
              >
                {order.trackingCode}
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => onOpenBarcode(order.trackingCode)}
                aria-label="Generate barcode"
                title="Generate barcode"
              >
                <BarcodeIcon className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap px-3 py-2.5 text-sm text-muted-foreground">
        {format(new Date(order.createdAt), "dd MMM yyyy · HH:mm")}
      </TableCell>
      <TableCell className="px-3 py-2.5">
        <OrderStatusBadge status={order.status} />
      </TableCell>
      <TableCell className="px-3 py-2.5 text-right">
        <span className="font-semibold tabular-nums text-gray-900">
          {formatPrice(order.totalAmount)}
        </span>
        <span className="ml-1 text-xs text-muted-foreground">MAD</span>
      </TableCell>
      <TableCell className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            aria-label="Print order ticket"
            title="Print order ticket"
            onClick={() => onPrintOrder(order)}
          >
            <Printer className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            aria-label="Open guarantee document"
            title="Open guarantee document"
            onClick={() => onOpenGuarantee(order)}
          >
            <BadgeCheck className="h-3.5 w-3.5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Order actions">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onRowClick(order)}>
                <Eye className="mr-2 h-4 w-4" />
                View
              </DropdownMenuItem>
              {!isLivreur && (
                <DropdownMenuItem onClick={() => onCopyOrderInfo(order)}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy order info
                </DropdownMenuItem>
              )}
              {isAdmin && (
                <>
                  <DropdownMenuItem onClick={() => onNavigateAdvanced(Number(order.id))}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Advanced edit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onDelete(order)}
                    className="text-red-600 focus:text-red-600"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
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

