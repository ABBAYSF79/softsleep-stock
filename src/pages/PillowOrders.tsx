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
import { Eye, LineChart, Package, Plus, RefreshCw, Search } from "lucide-react";
import { ORDER_STATUSES, formatPrice } from "@/utils/order-utils";
import { usePaginatedPillowOrders, useUpdatePillowOrderStatus } from "@/hooks/useApi";
import { PillowOrderDialog } from "@/components/pillow-orders/PillowOrderDialog";
import { PillowOrderPreviewDialog } from "@/components/pillow-orders/PillowOrderPreviewDialog";
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

  const totalItems = meta?.total ?? filtered.length;
  const totalPages = meta?.totalPages ?? 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + filtered.length;

  return (
    <MainLayout>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Accessoires Orders</h1>
          <div className="text-sm text-gray-500">Orders for accessoires only (separate from mattress orders)</div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button
              variant="outline"
              onClick={() => setIsStockUnlockOpen(true)}
              className="gap-2"
            >
              <Package className="h-4 w-4" />
              Accessoires Stock
            </Button>
          )}
          {isAdmin && (
            <Button
              variant="outline"
              onClick={() => navigate("/pillow-stock-analytics")}
              className="gap-2"
            >
              <LineChart className="h-4 w-4" />
              Analytics
            </Button>
          )}
          <Button variant="outline" onClick={() => refetch()} disabled={isRefetching} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button onClick={() => setIsCreateOpen(true)} className="gap-2 bg-matles-600 hover:bg-matles-700">
            <Plus className="h-4 w-4" />
            Create Order
          </Button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search name / phone / city..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <Table>
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
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setPreviewOrder(o);
                        setIsPreviewOpen(true);
                      }}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

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
        onStatusChange={(status) => {
          if (!previewOrder) return;
          updateStatus({ id: previewOrder.id, status });
        }}
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
