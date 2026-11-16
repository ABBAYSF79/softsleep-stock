import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckSquare,
  FileSpreadsheet,
  Loader2,
  MessageCircle,
  Package,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { MainLayout } from "@/components/layout/MainLayout";
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
import { PaginationControls } from "@/components/ui/pagination-controls";
import { BarcodeDialog } from "@/components/orders/BarcodeDialog";
import { OrderManagementDialog } from "@/components/orders/OrderManagementDialog";
import { AmanaParcelStatusDialog } from "@/components/amana/AmanaParcelStatusDialog";
import { AmanaParcelCard } from "@/components/amana/AmanaParcelCard";
import { AmanaParcelHistorySheet } from "@/components/amana/AmanaParcelHistorySheet";
import { AmanaSmartCopyDialog } from "@/components/amana/AmanaSmartCopyDialog";
import { AmanaParcelAlerts } from "@/components/amana/AmanaParcelAlerts";
import {
  AmanaStatusOverview,
  AMANA_STATUS_FILTER_UNINITIALIZED,
} from "@/components/amana/AmanaStatusOverview";
import { useAuth } from "@/contexts/AuthContext";
import { useDebounce } from "@/hooks/useDebounce";
import {
  fetchAmanaManagementExport,
  useAmanaManagementOrders,
  useAmanaParcelAlerts,
  useAmanaParcelStatuses,
  useDeliveryServices,
  useUpdateAmanaParcelStatus,
  type AmanaManagementOrderRow,
} from "@/hooks/useApi";
import { copyText } from "@/utils/clipboard";
import { exportAmanaManagementToExcel } from "@/utils/amanaManagementExcel";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

const AmanaManagement = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const isSuivi = user?.role === "SUIVI";
  const canMutateStatus = isAdmin || isSuivi;

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(24);
  const debouncedSearch = useDebounce(searchQuery, 150);

  const [barcodeValue, setBarcodeValue] = useState<string | null>(null);
  const [statusOrder, setStatusOrder] = useState<AmanaManagementOrderRow | null>(null);
  const [historyOrder, setHistoryOrder] = useState<AmanaManagementOrderRow | null>(null);
  const [viewingOrder, setViewingOrder] = useState<any>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [loadingOrderId, setLoadingOrderId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [smartCopyOpen, setSmartCopyOpen] = useState(false);
  const selectedIdList = useMemo(() => [...selectedIds], [selectedIds]);

  const { data: statusCatalog = [], isLoading: statusesLoading } = useAmanaParcelStatuses();
  const { data: deliveryServices } = useDeliveryServices();
  const updateStatus = useUpdateAmanaParcelStatus();
  const {
    data: alertsData,
    isLoading: alertsLoading,
    refetch: refetchAlerts,
  } = useAmanaParcelAlerts();

  const filters = useMemo(
    () => ({
      page: currentPage,
      limit: itemsPerPage,
      search: debouncedSearch || undefined,
      status: statusFilter !== "all" ? statusFilter : undefined,
      city: cityFilter !== "all" ? cityFilter : undefined,
    }),
    [currentPage, itemsPerPage, debouncedSearch, statusFilter, cityFilter]
  );

  const {
    data: listData,
    isLoading,
    error,
    refetch,
    isRefetching,
    isFetching,
  } = useAmanaManagementOrders(filters);

  const rows = useMemo(() => listData?.data ?? [], [listData]);
  const meta = listData?.meta ?? { total: 0, page: 1, limit: itemsPerPage, totalPages: 0 };
  const summary = listData?.summary;

  const handleStatusFilterChange = useCallback((next: string) => {
    setStatusFilter(next);
    setCurrentPage(1);
  }, []);

  // Selection is scoped to the active filter set; it survives page changes and dialogs.
  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, [debouncedSearch, statusFilter, cityFilter]);

  const pageIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const selectedCount = selectedIds.size;
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));

  const setOrderSelected = useCallback((orderId: number, selected: boolean) => {
    setSelectedIds((prev) => {
      if (prev.has(orderId) === selected) return prev;
      const next = new Set(prev);
      if (selected) next.add(orderId);
      else next.delete(orderId);
      return next;
    });
  }, []);

  const togglePageSelection = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    const ids = [...selectedIds];
    try {
      const result = await fetchAmanaManagementExport(
        ids.length
          ? { orderIds: ids }
          : { search: filters.search, status: filters.status, city: filters.city }
      );
      if (result.data.length === 0) {
        toast.message("Aucune commande à exporter");
        return;
      }
      const exported = await exportAmanaManagementToExcel(result.data);
      toast.success(
        `${exported} commande${exported === 1 ? "" : "s"} exportée${exported === 1 ? "" : "s"}`
      );
      if (ids.length && exported < ids.length) {
        toast.warning(
          `${ids.length - exported} commande(s) sélectionnée(s) ne sont plus éligibles et ont été ignorées`
        );
      }
    } catch (err) {
      const apiError = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(apiError || "Échec de l'export Excel");
    } finally {
      setIsExporting(false);
    }
  };

  const cityOptions = useMemo(() => {
    const cities = new Set<string>();
    if (Array.isArray(deliveryServices)) {
      for (const s of deliveryServices) {
        let parsed: unknown = s.cities;
        if (typeof s.cities === "string") {
          try {
            parsed = JSON.parse(s.cities);
          } catch {
            parsed = [];
          }
        }
        if (Array.isArray(parsed)) {
          for (const c of parsed) {
            if (typeof c === "string" && c.trim()) cities.add(c.trim());
          }
        }
      }
    }
    for (const row of rows) {
      if (row.city?.trim()) cities.add(row.city.trim());
    }
    return [...cities].sort((a, b) => a.localeCompare(b, "fr"));
  }, [deliveryServices, rows]);

  const activeFiltersCount =
    (searchQuery.trim() ? 1 : 0) +
    (statusFilter !== "all" ? 1 : 0) +
    (cityFilter !== "all" ? 1 : 0);

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setCityFilter("all");
    setCurrentPage(1);
  };

  const handleCopyTracking = useCallback(async (code: string) => {
    const ok = await copyText(code);
    if (ok) toast.success("Code de suivi copié");
    else toast.error("Impossible de copier");
  }, []);

  const handleViewOrder = useCallback(async (orderId: number) => {
    setLoadingOrderId(orderId);
    try {
      const { data } = await api.get(`/orders/${orderId}`);
      setViewingOrder(data);
      setIsDialogOpen(true);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Impossible de charger la commande");
    } finally {
      setLoadingOrderId(null);
    }
  }, []);

  const handleStatusSubmit = useCallback(
    async (args: { orderId: number; status: string; note?: string }) => {
      const result = await updateStatus.mutateAsync(args);
      if (result.changed !== false) {
        setStatusOrder(null);
      }
      await refetch();
    },
    [updateStatus, refetch]
  );

  if (error) {
    return (
      <MainLayout>
        <div className="flex h-[50vh] flex-col items-center justify-center gap-4">
          <div className="text-lg font-medium text-red-600">Erreur de chargement</div>
          <p className="text-sm text-muted-foreground">
            {(error as any)?.response?.data?.error || (error as Error).message}
          </p>
          <Button onClick={() => refetch()} variant="outline" disabled={isRefetching}>
            {isRefetching ? "Nouvelle tentative…" : "Réessayer"}
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Package className="h-5 w-5 shrink-0 text-slate-700" />
            <h1 className="text-lg font-semibold tracking-tight text-slate-900">
              Amana Management
            </h1>
            <Badge variant="secondary" className="font-normal">
              {(summary?.totalActive ?? meta.total)} actif
              {(summary?.totalActive ?? meta.total) === 1 ? "" : "s"}
            </Badge>
            {statusFilter !== "all" && (
              <Badge variant="outline" className="max-w-[220px] truncate font-normal">
                {statusFilter === AMANA_STATUS_FILTER_UNINITIALIZED
                  ? "Non initialisé"
                  : statusCatalog.find((s) => s.code === statusFilter)?.label ||
                    statusFilter}
              </Badge>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              refetch();
              refetchAlerts();
            }}
            disabled={isRefetching}
            className="h-8 shrink-0"
          >
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", isRefetching && "animate-spin")} />
            Actualiser
          </Button>
        </div>

        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Client, téléphone, tracking…"
                className="h-8 pl-8 text-sm"
              />
            </div>
            <Select value={cityFilter} onValueChange={setCityFilter}>
              <SelectTrigger className="h-8 min-w-0 flex-1 text-sm sm:w-[160px] sm:flex-none">
                <SelectValue placeholder="Ville" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les villes</SelectItem>
                {cityOptions.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activeFiltersCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-slate-600"
                onClick={clearFilters}
              >
                <X className="mr-1 h-3.5 w-3.5" />
                Effacer
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {pageIds.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 px-2 text-xs text-slate-600 [&_svg]:size-3.5"
                onClick={togglePageSelection}
              >
                <CheckSquare />
                {allPageSelected ? "Désélectionner la page" : "Sélectionner la page"}
              </Button>
            )}
            {selectedCount > 0 && (
              <div className="flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 pl-2.5 pr-1 text-xs">
                <span className="font-medium tabular-nums text-slate-800">
                  {selectedCount} sélectionnée{selectedCount === 1 ? "" : "s"}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-xs text-slate-500 hover:text-slate-900"
                  onClick={clearSelection}
                >
                  Effacer la sélection
                </Button>
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 px-3 text-xs [&_svg]:size-3.5"
              disabled={selectedCount === 0}
              title={selectedCount === 0 ? "Sélectionne des commandes" : undefined}
              onClick={() => setSmartCopyOpen(true)}
            >
              <MessageCircle className="text-[#25D366]" />
              Smart Copy{selectedCount > 0 ? ` (${selectedCount})` : ""}
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5 px-3 text-xs [&_svg]:size-3.5"
              onClick={handleExport}
              disabled={isExporting || (selectedCount === 0 && meta.total === 0)}
            >
              {isExporting ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}
              {isExporting
                ? "Export en cours…"
                : selectedCount > 0
                  ? `Exporter (${selectedCount})`
                  : "Exporter Excel"}
            </Button>
          </div>
        </div>

        <AmanaParcelAlerts
          alerts={alertsData}
          isLoading={alertsLoading}
          statusCatalog={statusCatalog}
          loadingOrderId={loadingOrderId}
          onOpenOrder={handleViewOrder}
        />

        {!isLoading && !statusesLoading && (
          <AmanaStatusOverview
            summary={summary}
            selectedStatus={statusFilter}
            onSelectStatus={handleStatusFilterChange}
          />
        )}

        {isLoading || statusesLoading ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            Chargement des colis…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-200 bg-white text-center">
            <p className="text-sm font-medium text-slate-700">
              {activeFiltersCount ? "Aucun résultat pour ces filtres" : "Aucune commande active"}
            </p>
            <p className="text-xs text-muted-foreground">
              Seules les commandes IN_PROCESS des 3 derniers mois apparaissent ici.
            </p>
            {activeFiltersCount > 0 && (
              <Button type="button" variant="link" size="sm" onClick={clearFilters}>
                Effacer les filtres
              </Button>
            )}
          </div>
        ) : (
          <>
            <div
              className={cn(
                "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3",
                isFetching && !isLoading && "opacity-70"
              )}
            >
              {rows.map((row) => (
                <AmanaParcelCard
                  key={row.id}
                  order={row}
                  statusCatalog={statusCatalog}
                  canMutateStatus={canMutateStatus}
                  isLoadingDetails={loadingOrderId === row.id}
                  onViewDetails={() => handleViewOrder(row.id)}
                  onViewHistory={() => setHistoryOrder(row)}
                  onUpdateStatus={() => setStatusOrder(row)}
                  onOpenBarcode={() => {
                    if (row.trackingCode?.trim()) setBarcodeValue(row.trackingCode);
                  }}
                  onCopyTracking={() => {
                    if (row.trackingCode?.trim()) handleCopyTracking(row.trackingCode);
                  }}
                  selected={selectedIds.has(row.id)}
                  onSelectedChange={(v) => setOrderSelected(row.id, v)}
                />
              ))}
            </div>

            <PaginationControls
              currentPage={meta.page}
              totalPages={meta.totalPages}
              onPageChange={setCurrentPage}
              itemsPerPage={itemsPerPage}
              onItemsPerPageChange={(n) => {
                setItemsPerPage(n);
                setCurrentPage(1);
              }}
              totalItems={meta.total}
              startIndex={(meta.page - 1) * meta.limit}
              endIndex={Math.min(meta.page * meta.limit, meta.total)}
            />
          </>
        )}
      </div>

      <BarcodeDialog
        open={Boolean(barcodeValue)}
        onOpenChange={(open) => {
          if (!open) setBarcodeValue(null);
        }}
        trackingCode={barcodeValue || ""}
      />

      <AmanaParcelStatusDialog
        open={Boolean(statusOrder)}
        onOpenChange={(open) => {
          if (!open) setStatusOrder(null);
        }}
        order={statusOrder}
        statuses={statusCatalog}
        canMutate={canMutateStatus}
        isSaving={updateStatus.isPending}
        onSubmit={handleStatusSubmit}
      />

      <AmanaSmartCopyDialog
        open={smartCopyOpen}
        onOpenChange={setSmartCopyOpen}
        orderIds={selectedIdList}
      />

      <AmanaParcelHistorySheet
        open={Boolean(historyOrder)}
        onOpenChange={(open) => {
          if (!open) setHistoryOrder(null);
        }}
        order={historyOrder}
        statusCatalog={statusCatalog}
      />

      <OrderManagementDialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) setViewingOrder(null);
        }}
        order={viewingOrder}
      />
    </MainLayout>
  );
};

export default AmanaManagement;
