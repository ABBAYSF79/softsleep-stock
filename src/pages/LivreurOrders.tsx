import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LivreurLayout } from "@/components/layout/LivreurLayout";
import { LivreurOrderCard } from "@/components/livreur/LivreurOrderCard";
import { LivreurOrderSheet } from "@/components/livreur/LivreurOrderSheet";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { OrderGuaranteeDialog } from "@/components/orders/OrderGuaranteeDialog";
import { OrderTicketDialog } from "@/components/orders/OrderTicketDialog";
import { useAuth } from "@/contexts/AuthContext";
import {
  type OrderStatusUpdate,
  useDeliveryServices,
  usePaginatedOrders,
  useUpdateOrderStatus,
} from "@/hooks/useApi";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  ReportDateFields,
  emptyReportDate,
  isReportDateValid,
  type ReportDateValue,
} from "@/components/orders/ReportDateFields";
import { formatReportDate, reportDateYmd } from "@/utils/order-utils";
import { useDebounce } from "@/hooks/useDebounce";
import { Search, X } from "lucide-react";
import Barcode from "react-barcode";
import { toast } from "sonner";

const LivreurOrders = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deliveringOrderId, setDeliveringOrderId] = useState<number | null>(null);
  const [reportingOrderId, setReportingOrderId] = useState<number | null>(null);
  const [reportOrder, setReportOrder] = useState<any>(null);
  const [reportForm, setReportForm] = useState<ReportDateValue>(emptyReportDate);
  const [savingNoteOrderId, setSavingNoteOrderId] = useState<number | null>(null);
  const [confirmDeliverOrder, setConfirmDeliverOrder] = useState<any>(null);
  const [ticketOrder, setTicketOrder] = useState<any>(null);
  const [guaranteeOrder, setGuaranteeOrder] = useState<any>(null);
  const [barcodeValue, setBarcodeValue] = useState<string | null>(null);

  const debouncedSearch = useDebounce(searchQuery, 200);
  const updateOrderStatus = useUpdateOrderStatus();
  const { data: deliveryServices } = useDeliveryServices();

  useEffect(() => {
    const statusFromUrl = searchParams.get("status");
    if (statusFromUrl) {
      setStatusFilter(statusFromUrl);
      setCurrentPage(1);
    }
  }, [searchParams]);

  const assignedServiceIds = useMemo(
    () => user?.deliveryServiceIds ?? user?.deliveryServices?.map((s) => s.id) ?? [],
    [user]
  );

  const cityOptions = useMemo(() => {
    const cities = new Set<string>();
    deliveryServices
      ?.filter((service: any) => assignedServiceIds.includes(service.id))
      .forEach((service: any) => {
        service.cities?.forEach((city: string) => cities.add(city));
      });
    return Array.from(cities).sort((a, b) => a.localeCompare(b, "fr"));
  }, [deliveryServices, assignedServiceIds]);

  const filters = useMemo(
    () => ({
      page: currentPage,
      limit: 15,
      status: statusFilter,
      search: debouncedSearch,
      ...(cityFilter !== "all" ? { city: cityFilter } : {}),
    }),
    [currentPage, statusFilter, debouncedSearch, cityFilter]
  );

  const { data, isLoading, error, refetch, isRefetching } = usePaginatedOrders(filters);
  const orders = data?.data ?? [];
  const meta = data?.meta ?? { total: 0, page: 1, limit: 15, totalPages: 0 };

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (searchQuery.trim()) count += 1;
    if (statusFilter !== "all") count += 1;
    if (cityFilter !== "all") count += 1;
    return count;
  }, [searchQuery, statusFilter, cityFilter]);

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setCityFilter("all");
    setCurrentPage(1);
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter, cityFilter]);

  const handleOpenOrder = useCallback((order: any) => {
    setSelectedOrder(order);
    setSheetOpen(true);
  }, []);

  const handleCall = useCallback((phone: string) => {
    window.location.href = `tel:${phone.replace(/\s/g, "")}`;
  }, []);

  const handleMarkDelivered = useCallback((order: any) => {
    setConfirmDeliverOrder(order);
  }, []);

  const confirmDeliver = async () => {
    if (!confirmDeliverOrder) return;
    const orderId = confirmDeliverOrder.id;
    setDeliveringOrderId(orderId);
    try {
      await updateOrderStatus.mutateAsync({
        id: orderId,
        status: "DELIVERED",
      });
      toast.success(`Commande #${orderId} marquée comme livrée`);
      setConfirmDeliverOrder(null);
      setSheetOpen(false);
      setSelectedOrder(null);
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Échec de la mise à jour");
    } finally {
      setDeliveringOrderId(null);
    }
  };

  const openReportForm = (order: any) => {
    setReportForm(
      order.status === "REPORTED"
        ? { date: reportDateYmd(order.reportedUntil) ?? "", reason: order.reportReason ?? "" }
        : emptyReportDate()
    );
    setReportOrder(order);
  };

  const applyStatusUpdate = async (order: any, update: Omit<OrderStatusUpdate, "id">, successMessage: string) => {
    setReportingOrderId(order.id);
    try {
      const updated = await updateOrderStatus.mutateAsync({ id: order.id, ...update });
      toast.success(successMessage);
      setSelectedOrder((prev: any) =>
        prev?.id === order.id
          ? {
              ...prev,
              status: updated.status,
              reportedUntil: updated.reportedUntil,
              reportReason: updated.reportReason,
            }
          : prev
      );
      refetch();
      return true;
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Échec de la mise à jour");
      return false;
    } finally {
      setReportingOrderId(null);
    }
  };

  const submitReport = async () => {
    if (!reportOrder) return;
    if (!isReportDateValid(reportForm)) {
      toast.error("Choisissez une date de report (aujourd'hui ou plus tard)");
      return;
    }
    const ok = await applyStatusUpdate(
      reportOrder,
      {
        ...(reportOrder.status !== "REPORTED" ? { status: "REPORTED" } : {}),
        reportedUntil: reportForm.date,
        reportReason: reportForm.reason.trim(),
      },
      `Commande #${reportOrder.id} reportée au ${formatReportDate(`${reportForm.date}T12:00:00Z`)}`
    );
    if (ok) setReportOrder(null);
  };

  const handleUnreport = (order: any) =>
    applyStatusUpdate(order, { status: "PENDING" }, `Commande #${order.id} remise en attente`);

  const handleSaveNote = useCallback(
    async (orderId: number, note: string) => {
      setSavingNoteOrderId(orderId);
      try {
        await updateOrderStatus.mutateAsync({ id: orderId, livreurNote: note });
        toast.success("Note enregistrée");
        setSelectedOrder((prev: any) => (prev?.id === orderId ? { ...prev, livreurNote: note } : prev));
        refetch();
      } catch (err: any) {
        toast.error(err.response?.data?.error || "Échec de l'enregistrement");
        throw err;
      } finally {
        setSavingNoteOrderId(null);
      }
    },
    [updateOrderStatus, refetch]
  );

  if (error) {
    return (
      <LivreurLayout title="Commandes" onRefresh={() => refetch()} isRefreshing={isRefetching}>
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <p className="text-base font-medium text-red-600">Erreur de chargement</p>
          <p className="text-sm text-muted-foreground">
            {(error as any)?.response?.data?.error || (error as Error).message}
          </p>
          <Button onClick={() => refetch()} variant="outline">
            Réessayer
          </Button>
        </div>
      </LivreurLayout>
    );
  }

  return (
    <LivreurLayout title="Commandes" onRefresh={() => refetch()} isRefreshing={isRefetching}>
      <div className="space-y-3">
        <div className="sticky top-[4.25rem] z-30 -mx-1 space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher client, téléphone, adresse..."
              className="h-11 pl-9 text-base"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-11 text-sm">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous statuts</SelectItem>
                <SelectItem value="PENDING">En attente</SelectItem>
                <SelectItem value="REPORTED">Reporté</SelectItem>
                <SelectItem value="IN_PROCESS">En cours</SelectItem>
                <SelectItem value="DELIVERED">Livré</SelectItem>
                <SelectItem value="RETURNED">Retourné</SelectItem>
              </SelectContent>
            </Select>

            <Select value={cityFilter} onValueChange={setCityFilter}>
              <SelectTrigger className="h-11 text-sm">
                <SelectValue placeholder="Ville" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes villes</SelectItem>
                {cityOptions.map((city) => (
                  <SelectItem key={city} value={city}>
                    {city}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {activeFiltersCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-full gap-1 text-xs text-muted-foreground"
              onClick={clearFilters}
            >
              <X className="h-3.5 w-3.5" />
              Effacer les filtres ({activeFiltersCount})
            </Button>
          )}
        </div>

        <div className="flex items-center justify-between px-1 text-sm text-muted-foreground">
          <span>
            {meta.total} commande{meta.total !== 1 ? "s" : ""}
          </span>
          {user?.deliveryServices?.length ? (
            <span className="truncate text-right text-xs">
              {user.deliveryServices.map((s) => s.name).join(", ")}
            </span>
          ) : null}
        </div>

        {isLoading ? (
          <div className="space-y-3 py-8 text-center text-sm text-muted-foreground">
            Chargement des commandes...
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white py-16 text-center">
            <p className="text-sm font-medium text-slate-700">Aucune commande trouvée</p>
            <p className="mt-1 text-xs text-muted-foreground">Modifiez vos filtres</p>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((order: any) => (
              <LivreurOrderCard
                key={order.id}
                order={order}
                onOpen={handleOpenOrder}
                onCall={handleCall}
                onMarkDelivered={handleMarkDelivered}
                isMarkingDelivered={deliveringOrderId === order.id}
              />
            ))}
          </div>
        )}

        {meta.totalPages > 1 && (
          <div className="flex items-center justify-between gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              Précédent
            </Button>
            <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
              {currentPage} / {meta.totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1"
              disabled={currentPage >= meta.totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
            >
              Suivant
            </Button>
          </div>
        )}
      </div>

      <LivreurOrderSheet
        order={selectedOrder}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onCall={handleCall}
        onPrintTicket={setTicketOrder}
        onOpenGuarantee={setGuaranteeOrder}
        onOpenTracking={setBarcodeValue}
        onMarkDelivered={handleMarkDelivered}
        onReport={openReportForm}
        onUnreport={handleUnreport}
        onSaveNote={handleSaveNote}
        isMarkingDelivered={selectedOrder ? deliveringOrderId === selectedOrder.id : false}
        isTogglingReported={selectedOrder ? reportingOrderId === selectedOrder.id : false}
        isSavingNote={selectedOrder ? savingNoteOrderId === selectedOrder.id : false}
      />

      <OrderTicketDialog
        open={!!ticketOrder}
        onOpenChange={(open) => !open && setTicketOrder(null)}
        order={ticketOrder}
        requireInProcessTracking={false}
        hidePreview
      />

      <OrderGuaranteeDialog
        open={!!guaranteeOrder}
        onOpenChange={(open) => !open && setGuaranteeOrder(null)}
        order={guaranteeOrder}
        hidePreview
      />

      <Dialog open={Boolean(barcodeValue)} onOpenChange={(open) => !open && setBarcodeValue(null)}>
        <DialogContent className="w-[96vw] max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Code de suivi</DialogTitle>
          </DialogHeader>
          {barcodeValue && (
            <div className="space-y-3">
              <div className="flex justify-center overflow-x-auto rounded-lg border bg-white p-4">
                <Barcode
                  value={barcodeValue}
                  format="CODE128"
                  displayValue
                  height={72}
                  width={1.2}
                  fontSize={13}
                  margin={0}
                />
              </div>
              <p className="break-all text-center font-mono text-sm text-muted-foreground">
                {barcodeValue}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Sheet open={!!reportOrder} onOpenChange={(open) => !open && setReportOrder(null)}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl px-4 pb-8">
          <SheetHeader className="text-left">
            <SheetTitle>
              {reportOrder?.status === "REPORTED" ? "Modifier la date de report" : "Reporter la commande"}
            </SheetTitle>
            <p className="text-sm text-muted-foreground">
              #{reportOrder?.id} · {reportOrder?.customerName}
            </p>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            <ReportDateFields value={reportForm} onChange={setReportForm} idPrefix="livreur-report" />
            <Button
              type="button"
              className="h-12 w-full bg-orange-600 text-base font-semibold hover:bg-orange-700"
              disabled={!isReportDateValid(reportForm) || reportingOrderId === reportOrder?.id}
              onClick={() => void submitReport()}
            >
              {reportingOrderId === reportOrder?.id ? "Enregistrement..." : "Confirmer le report"}
            </Button>
            <Button type="button" variant="outline" className="h-11 w-full" onClick={() => setReportOrder(null)}>
              Annuler
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={!!confirmDeliverOrder}
        onOpenChange={(open) => !open && setConfirmDeliverOrder(null)}
      >
        <AlertDialogContent className="max-w-sm rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la livraison</AlertDialogTitle>
            <AlertDialogDescription>
              Marquer la commande #{confirmDeliverOrder?.id} ({confirmDeliverOrder?.customerName})
              comme livrée ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <AlertDialogAction
              className="h-11 w-full bg-matles-600 hover:bg-matles-700"
              onClick={confirmDeliver}
            >
              Oui, livré
            </AlertDialogAction>
            <AlertDialogCancel className="h-11 w-full">Annuler</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </LivreurLayout>
  );
};

export default LivreurOrders;
