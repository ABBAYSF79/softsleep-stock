import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
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
import { Badge } from "@/components/ui/badge";
import { Eye, LineChart, Package, Plus, Printer, RefreshCw, Search } from "lucide-react";
import { ORDER_STATUSES, formatPrice } from "@/utils/order-utils";
import { usePaginatedPillowOrders, useUpdatePillowOrderStatus } from "@/hooks/useApi";
import { PillowOrderDialog } from "@/components/pillow-orders/PillowOrderDialog";
import { PillowOrderPreviewDialog } from "@/components/pillow-orders/PillowOrderPreviewDialog";
import { OrderTicketDialog } from "@/components/orders/OrderTicketDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { useDebounce } from "@/hooks/useDebounce";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import api from "@/lib/api";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

const PillowOrders = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") || "");
  const [currentPage, setCurrentPage] = useState(Number(searchParams.get("page") || 1));
  const [itemsPerPage, setItemsPerPage] = useState(Number(searchParams.get("limit") || 25));
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewOrder, setPreviewOrder] = useState<any>(null);
  const [ticketOrder, setTicketOrder] = useState<any>(null);
  const [isStockUnlockOpen, setIsStockUnlockOpen] = useState(false);
  const [stockCode, setStockCode] = useState("");
  const [isStockUnlocking, setIsStockUnlocking] = useState(false);

  const debouncedSearch = useDebounce(searchQuery, 150);
  const { data, isLoading, error, refetch, isRefetching } = usePaginatedPillowOrders({
    page: currentPage,
    limit: itemsPerPage,
    search: debouncedSearch || undefined,
  });
  const { mutate: updateStatus, isPending: isUpdating } = useUpdatePillowOrderStatus();

  const orders = (data?.data || []) as any[];
  const meta = data?.meta;

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (searchQuery) next.set("search", searchQuery);
    else next.delete("search");
    next.set("page", String(currentPage));
    next.set("limit", String(itemsPerPage));
    setSearchParams(next, { replace: true });
  }, [searchQuery, currentPage, itemsPerPage, searchParams, setSearchParams]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch]);

  const filtered = useMemo(() => {
    return orders;
  }, [orders]);

  const errorMessage =
    (error as any)?.response?.data?.error ||
    (error as any)?.message ||
    "Error loading accessoires orders";

  const getStatusBadge = (status: string) => {
    const s = (ORDER_STATUSES as any)[status];
    if (!s) return <Badge variant="outline">{status}</Badge>;
    return <Badge className={s.color}>{s.label}</Badge>;
  };

  const getItemsCount = (items: any[]) => {
    if (!items || items.length === 0) return 0;
    return items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
  };

  const openTicket = (order: any) => {
    setIsPreviewOpen(false);
    setTicketOrder({
      ...order,
      items: [],
      pillowItems: Array.isArray(order?.items) ? order.items : [],
    });
  };

  const totalItems = meta?.total ?? filtered.length;
  const totalPages = meta?.totalPages ?? 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + filtered.length;

  return (
    <MainLayout>
      <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Accessoires Orders</h1>
          <div className="text-sm text-gray-500">Orders for accessoires only (separate from mattress orders)</div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {isAdmin && (
            <Button
              variant="outline"
              onClick={() => setIsStockUnlockOpen(true)}
              className="flex-1 gap-2 sm:flex-none"
            >
              <Package className="h-4 w-4" />
              Accessoires Stock
            </Button>
          )}
          {isAdmin && (
            <Button
              variant="outline"
              onClick={() => navigate("/pillow-stock-analytics")}
              className="flex-1 gap-2 sm:flex-none"
            >
              <LineChart className="h-4 w-4" />
              Analytics
            </Button>
          )}
          <Button variant="outline" onClick={() => refetch()} disabled={isRefetching} className="flex-1 gap-2 sm:flex-none">
            <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button onClick={() => setIsCreateOpen(true)} className="flex-1 gap-2 bg-matles-600 hover:bg-matles-700 sm:flex-none">
            <Plus className="h-4 w-4" />
            Create Order
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm sm:p-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search name / phone / city..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-3 md:hidden">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-4 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : isLoading ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-gray-500">
              Loading...
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 px-3 py-8 text-center text-sm text-gray-500">
              No accessoires orders found.
            </div>
          ) : (
            filtered.map((o: any) => (
              <article key={o.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-matles-700">
                      Order #{o.id}
                    </p>
                    <p className="mt-1 truncate text-base font-semibold text-slate-900">
                      {o.customerName || "Client"}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" disabled={isUpdating} className="shrink-0">
                        {getStatusBadge(o.status)}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {Object.values(ORDER_STATUSES).map((s) => (
                        <DropdownMenuItem
                          key={s.value}
                          onSelect={() => {
                            if (!isUpdating) updateStatus({ id: o.id, status: s.value });
                          }}
                        >
                          {s.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 border-y border-slate-100 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">Phone</p>
                    <p className="truncate text-slate-700">{o.phone || "—"}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">City</p>
                    <p className="truncate text-slate-700">{o.city || "—"}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">Items</p>
                    <p className="text-slate-700">{getItemsCount(o.items)}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">Created</p>
                    <p className="truncate text-slate-700">
                      {o.createdAt ? format(new Date(o.createdAt), "dd/MM/yy HH:mm") : "—"}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-500">Total</span>
                  <span className="font-semibold tabular-nums text-slate-900">
                    {formatPrice(o.totalAmount)} MAD
                  </span>
                </div>

                <div className="mt-3 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-2"
                    onClick={() => {
                      setPreviewOrder(o);
                      setIsPreviewOpen(true);
                    }}
                  >
                    <Eye className="h-4 w-4" />
                    View
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-2"
                    onClick={() => openTicket(o)}
                  >
                    <Printer className="h-4 w-4" />
                    Ticket
                  </Button>
                </div>
              </article>
            ))
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
        <Table className="min-w-[1050px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">N°</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>City</TableHead>
              <TableHead>Delivery</TableHead>
              <TableHead className="text-right">Items</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {error ? (
              <TableRow>
                <TableCell colSpan={10}>
                  <div className="flex items-center justify-between gap-4 py-4">
                    <div className="text-sm text-red-600">{errorMessage}</div>
                    <Button variant="outline" onClick={() => refetch()} disabled={isRefetching}>
                      Retry
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : isLoading ? (
              <TableRow>
                <TableCell colSpan={10}>
                  <div className="py-6 text-sm text-gray-500">Loading...</div>
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10}>
                  <div className="py-8 text-center text-sm text-gray-500">No accessoires orders found.</div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((o: any) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium text-gray-700">#{o.id}</TableCell>
                  <TableCell className="font-medium">{o.customerName}</TableCell>
                  <TableCell>{o.phone || "-"}</TableCell>
                  <TableCell>{o.city || "-"}</TableCell>
                  <TableCell>{o.deliveryService?.name || "-"}</TableCell>
                  <TableCell className="text-right font-medium">{getItemsCount(o.items)}</TableCell>
                  <TableCell className="text-right font-medium">{formatPrice(o.totalAmount)} MAD</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" disabled={isUpdating} className="cursor-pointer">
                          {getStatusBadge(o.status)}
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {Object.values(ORDER_STATUSES).map((s) => (
                          <DropdownMenuItem
                            key={s.value}
                            onSelect={() => {
                              if (isUpdating) return;
                              updateStatus({ id: o.id, status: s.value });
                            }}
                          >
                            {s.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                  <TableCell className="text-xs text-gray-500 whitespace-nowrap">
                    {o.createdAt ? format(new Date(o.createdAt), "dd/MM/yy HH:mm") : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setPreviewOrder(o);
                          setIsPreviewOpen(true);
                        }}
                        aria-label={`View order ${o.id}`}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openTicket(o)}
                        aria-label={`Print ticket for order ${o.id}`}
                      >
                        <Printer className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        </div>

        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          itemsPerPage={itemsPerPage}
          onItemsPerPageChange={(n) => {
            setItemsPerPage(n);
            setCurrentPage(1);
          }}
          totalItems={totalItems}
          startIndex={startIndex}
          endIndex={endIndex}
        />
      </div>

      <PillowOrderDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
      <PillowOrderPreviewDialog
        open={isPreviewOpen}
        onOpenChange={setIsPreviewOpen}
        order={previewOrder}
        statusBusy={isUpdating}
        onOpenTicket={openTicket}
        onStatusChange={(status) => {
          if (!previewOrder) return;
          updateStatus({ id: previewOrder.id, status });
        }}
      />
      <OrderTicketDialog
        open={Boolean(ticketOrder)}
        onOpenChange={(open) => !open && setTicketOrder(null)}
        order={ticketOrder}
        requireInProcessTracking={false}
      />

      <Dialog open={isStockUnlockOpen} onOpenChange={(open) => !isStockUnlocking && setIsStockUnlockOpen(open)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Open Accessoires Stock</DialogTitle>
            <DialogDescription>Enter security code to access accessoires stock management.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (isStockUnlocking) return;
              setIsStockUnlocking(true);
              try {
                const { data } = await api.get("/pillow-orders/pillow-stock-link", {
                  params: { code: stockCode.trim() },
                });
                sessionStorage.setItem("pillow-stock-unlocked", "1");
                setIsStockUnlockOpen(false);
                setStockCode("");
                navigate(String(data?.url || "/pillow-stock"));
              } catch (err: any) {
                toast.error(err?.response?.data?.error || "Invalid code");
              } finally {
                setIsStockUnlocking(false);
              }
            }}
          >
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="pillow-stock-code">Security code</Label>
                <Input
                  id="pillow-stock-code"
                  type="password"
                  value={stockCode}
                  onChange={(e) => setStockCode(e.target.value)}
                  placeholder="Enter code"
                  autoFocus
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsStockUnlockOpen(false)} disabled={isStockUnlocking}>
                Cancel
              </Button>
              <Button type="submit" disabled={!stockCode.trim() || isStockUnlocking} className="bg-matles-600 hover:bg-matles-700">
                {isStockUnlocking ? "Checking..." : "Open"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default PillowOrders;
