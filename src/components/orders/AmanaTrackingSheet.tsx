import { CheckCircle2, Loader2, MapPin, Package, RotateCw, Truck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAmanaTracking, useUpdateOrderStatus, type AmanaTrackingData } from "@/hooks/useApi";
import api from "@/lib/api";
import {
  amanaStatusBadgeClass,
  amanaStatusDotClass,
  formatAmanaDateTime,
  formatAmanaDisplayDate,
  suggestedOrderStatusFromAmana,
  type AmanaStatusCode,
} from "@/utils/amanaTracking";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type AmanaTrackingSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: {
    id: number;
    status?: string | null;
    trackingCode?: string | null;
    deliveryService?: { name?: string | null } | null;
  } | null;
  onOrderStatusPatched?: (orderId: number, status: string) => void;
};

function MetaCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
      <p className="mt-1.5 break-words text-[13px] font-semibold leading-snug text-slate-900">
        {value ?? "—"}
      </p>
    </div>
  );
}

function TrackingSkeleton() {
  return (
    <div className="space-y-5 animate-pulse" data-testid="amana-tracking-skeleton">
      <div className="overflow-hidden rounded-2xl bg-slate-100/80 p-5">
        <div className="h-3 w-20 rounded-full bg-slate-200" />
        <div className="mt-4 h-8 w-36 rounded-full bg-slate-200" />
        <div className="mt-5 h-3 w-full rounded-full bg-slate-200" />
        <div className="mt-2 h-3 w-2/3 rounded-full bg-slate-200" />
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-slate-100">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-white p-4">
            <div className="h-2.5 w-16 rounded-full bg-slate-100" />
            <div className="mt-3 h-4 w-24 rounded-full bg-slate-100" />
          </div>
        ))}
      </div>
      <div className="space-y-4 pt-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-3">
            <div className="mt-1 h-2.5 w-2.5 rounded-full bg-slate-200" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-28 rounded-full bg-slate-100" />
              <div className="h-4 w-32 rounded-full bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrackingTimeline({ data }: { data: AmanaTrackingData }) {
  return (
    <ol className="relative space-y-0" data-testid="amana-tracking-timeline">
      {data.history.map((item, index) => {
        const isFirst = index === 0;
        const isLast = index === data.history.length - 1;
        const statusCode = item.statusCode as AmanaStatusCode;
        return (
          <li
            key={`${item.date}-${item.time}-${index}`}
            className="relative grid grid-cols-[20px_minmax(0,1fr)] gap-x-3 pb-5 last:pb-0"
          >
            <div className="relative flex justify-center pt-1.5" aria-hidden>
              {!isLast && (
                <span className="absolute top-4 bottom-[-20px] w-px bg-gradient-to-b from-slate-300 to-slate-100" />
              )}
              <span
                className={cn(
                  "relative z-[1] rounded-full ring-[3px] ring-white",
                  isFirst ? "h-3 w-3 shadow-sm" : "h-2 w-2",
                  amanaStatusDotClass(statusCode)
                )}
              />
            </div>
            <div
              className={cn(
                "min-w-0 rounded-xl px-3 py-2.5 transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
                isFirst
                  ? "bg-slate-900/[0.03] ring-1 ring-slate-900/[0.04]"
                  : "hover:bg-slate-50/80"
              )}
            >
              <p className="text-[11px] font-medium tabular-nums text-slate-400">
                {formatAmanaDisplayDate(item.date)}
                {item.time ? ` · ${item.time}` : ""}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <Badge
                  className={cn(
                    "h-6 border-0 px-2.5 text-[11px] font-semibold shadow-none",
                    amanaStatusBadgeClass(statusCode)
                  )}
                >
                  {item.statusLabel}
                </Badge>
              </div>
              {item.rawStatus ? (
                <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{item.rawStatus}</p>
              ) : null}
              {item.location ? (
                <p className="mt-1 flex items-start gap-1 text-xs font-medium text-slate-700">
                  <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" aria-hidden />
                  <span>{item.location}</span>
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function AmanaTrackingSheet({
  open,
  onOpenChange,
  order,
  onOrderStatusPatched,
}: AmanaTrackingSheetProps) {
  const orderId = order?.id ?? null;
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const query = useAmanaTracking(orderId, open && Boolean(orderId));
  const updateStatus = useUpdateOrderStatus();
  const data = query.data?.data;
  const trackingCode = order?.trackingCode?.trim() || data?.trackingCode || "—";
  const currentOrderStatus = order?.status ?? null;
  const suggestedStatus = data
    ? suggestedOrderStatusFromAmana(data.status.code)
    : null;
  const canPatchOrder =
    Boolean(orderId) &&
    Boolean(suggestedStatus) &&
    suggestedStatus !== currentOrderStatus &&
    !updateStatus.isPending;

  useEffect(() => {
    if (!open) {
      setRefreshError(null);
      if (orderId) {
        void queryClient.cancelQueries({ queryKey: ["amana-tracking", "order", orderId] });
      }
    }
  }, [open, orderId, queryClient]);

  const handleRefresh = async () => {
    if (!orderId || isRefreshing) return;
    setIsRefreshing(true);
    setRefreshError(null);
    try {
      const { data: payload } = await api.get(`/amana-tracking/order/${orderId}`, {
        params: { refresh: 1 },
        timeout: 30000,
      });
      queryClient.setQueryData(["amana-tracking", "order", orderId], payload);
    } catch (error: any) {
      const message =
        error?.response?.data?.error ||
        (error?.code === "ECONNABORTED"
          ? "Request timed out — the VPS could not reach AMANA in time"
          : "Unable to refresh AMANA tracking");
      setRefreshError(message);
      console.error("AMANA tracking refresh failed", error?.response?.data || error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleApplyOrderStatus = async () => {
    if (!orderId || !suggestedStatus || !canPatchOrder) return;
    try {
      await updateStatus.mutateAsync({ id: orderId, status: suggestedStatus });
      onOrderStatusPatched?.(orderId, suggestedStatus);
      toast.success(`Order #${orderId} updated to ${suggestedStatus}`);
    } catch {
      // Error toast handled by useUpdateOrderStatus
    }
  };

  const showInitialLoading = query.isLoading && !data;
  const errorFromQuery =
    (query.error as any)?.response?.data?.error ||
    ((query.error as any)?.code === "ECONNABORTED"
      ? "Request timed out — the VPS could not reach AMANA in time"
      : null) ||
    (query.isError ? "We couldn't retrieve AMANA tracking information." : null);
  const displayError = refreshError || errorFromQuery;
  const showError = !data && Boolean(displayError);
  const statusCode = data?.status.code as AmanaStatusCode | undefined;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="flex w-full flex-col gap-0 overflow-hidden border-l border-slate-200/80 bg-[#f7f8fa] p-0 sm:max-w-[460px]"
        data-testid="amana-tracking-sheet"
      >
        <SheetHeader className="relative shrink-0 space-y-0 overflow-hidden border-b border-slate-200/70 bg-white px-5 pb-4 pt-5 pr-12 text-left">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_0%_0%,rgba(15,23,42,0.04),transparent_55%)]"
            aria-hidden
          />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm shadow-slate-900/10">
                  <Truck className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                </span>
                <SheetTitle className="text-[15px] font-semibold tracking-tight text-slate-900">
                  Shipment Tracking
                </SheetTitle>
                {data && !query.isError ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700 ring-1 ring-emerald-600/10">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    </span>
                    Live
                  </span>
                ) : null}
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Amana · Order #{order?.id ?? "—"}
                </p>
                <p
                  className="font-mono text-[15px] font-semibold tracking-tight text-slate-900"
                  data-testid="amana-tracking-code"
                >
                  {trackingCode}
                </p>
              </div>
              <SheetDescription className="sr-only">
                AMANA shipment tracking for order #{order?.id}
              </SheetDescription>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 shrink-0 gap-1.5 rounded-full border-slate-200 bg-white px-3.5 text-slate-700 shadow-sm shadow-slate-900/[0.03] hover:bg-slate-50"
              onClick={() => void handleRefresh()}
              disabled={isRefreshing || !orderId || showInitialLoading}
              aria-label="Refresh tracking"
              title="Refresh tracking"
            >
              <RotateCw
                className={cn(
                  "h-3.5 w-3.5 transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]",
                  isRefreshing && "animate-spin"
                )}
              />
              Refresh
            </Button>
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          {showInitialLoading ? (
            <div className="space-y-3">
              <p className="text-center text-[11px] font-medium tracking-wide text-slate-400">
                Contacting AMANA…
              </p>
              <TrackingSkeleton />
            </div>
          ) : showError ? (
            <div
              className="flex flex-col items-center rounded-2xl bg-white px-5 py-10 text-center shadow-sm shadow-slate-900/[0.03] ring-1 ring-slate-900/[0.05]"
              data-testid="amana-tracking-error"
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                <Package className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <p className="text-sm font-semibold text-slate-900">Unable to retrieve tracking</p>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">{displayError}</p>
              {(query.error as any)?.response?.data?.detail ? (
                <p className="mt-2 break-all text-xs text-slate-400">
                  {(query.error as any).response.data.detail}
                </p>
              ) : null}
              {(query.error as any)?.response?.data?.code ? (
                <p className="mt-1 text-xs tabular-nums text-slate-400">
                  code: {(query.error as any).response.data.code}
                </p>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-5 h-9 rounded-full px-4"
                onClick={() => void handleRefresh()}
                disabled={isRefreshing}
              >
                {isRefreshing ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                Retry
              </Button>
            </div>
          ) : data ? (
            <div className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
              {/* Status hero */}
              <section className="overflow-hidden rounded-2xl bg-white shadow-sm shadow-slate-900/[0.04] ring-1 ring-slate-900/[0.05]">
                <div className="border-b border-slate-100/80 px-5 pb-4 pt-5">
                  {data.product ? (
                    <p className="text-[11px] font-medium text-slate-400">{data.product}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-2.5">
                    <Badge
                      className={cn(
                        "h-7 border-0 px-3 text-xs font-semibold shadow-none",
                        statusCode ? amanaStatusBadgeClass(statusCode) : ""
                      )}
                    >
                      {data.status.label}
                    </Badge>
                    {data.status.raw ? (
                      <span className="text-xs text-slate-400">{data.status.raw}</span>
                    ) : null}
                  </div>

                  <div className="mt-4 space-y-3">
                    <div className="flex gap-2.5">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" strokeWidth={1.75} />
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                          Current location
                        </p>
                        <p className="mt-0.5 text-sm font-semibold leading-snug text-slate-900">
                          {data.currentPosition || "—"}
                        </p>
                      </div>
                    </div>
                    <p className="pl-[26px] text-[11px] tabular-nums text-slate-400">
                      Last update ·{" "}
                      {data.lastUpdate
                        ? formatAmanaDateTime(data.lastUpdate.date, data.lastUpdate.time)
                        : "—"}
                    </p>
                  </div>
                </div>

                {suggestedStatus && suggestedStatus !== currentOrderStatus ? (
                  <div
                    className={cn(
                      "px-5 py-4",
                      suggestedStatus === "DELIVERED"
                        ? "bg-emerald-50/90"
                        : "bg-rose-50/90"
                    )}
                    data-testid="amana-apply-status"
                  >
                    <p
                      className={cn(
                        "text-sm font-semibold leading-snug",
                        suggestedStatus === "DELIVERED" ? "text-emerald-950" : "text-rose-950"
                      )}
                    >
                      AMANA reports {data.status.label}. Order is still{" "}
                      <span className="font-bold">{currentOrderStatus || "—"}</span>.
                    </p>
                    <p
                      className={cn(
                        "mt-1 text-xs leading-relaxed",
                        suggestedStatus === "DELIVERED" ? "text-emerald-800/75" : "text-rose-800/75"
                      )}
                    >
                      Apply to sync order status with the normal inventory flow.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      className={cn(
                        "mt-3 h-9 gap-1.5 rounded-full px-4 text-white shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]",
                        suggestedStatus === "DELIVERED"
                          ? "bg-emerald-700 hover:bg-emerald-800"
                          : "bg-rose-700 hover:bg-rose-800"
                      )}
                      disabled={!canPatchOrder}
                      onClick={() => void handleApplyOrderStatus()}
                    >
                      {updateStatus.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                      )}
                      Mark as {suggestedStatus === "DELIVERED" ? "Delivered" : "Returned"}
                    </Button>
                  </div>
                ) : null}

                {suggestedStatus && suggestedStatus === currentOrderStatus ? (
                  <div className="border-t border-slate-100 px-5 py-3">
                    <p
                      className={cn(
                        "text-xs font-medium",
                        suggestedStatus === "DELIVERED" ? "text-emerald-700" : "text-rose-700"
                      )}
                    >
                      Order status already matches AMANA ({suggestedStatus}).
                    </p>
                  </div>
                ) : null}
              </section>

              {/* Shipment meta */}
              <section className="grid grid-cols-2 divide-x divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-sm shadow-slate-900/[0.03] ring-1 ring-slate-900/[0.05]">
                <MetaCell label="Destination" value={data.destination || "—"} />
                <MetaCell
                  label="Weight"
                  value={
                    data.weightRaw ||
                    (data.weight != null ? `${data.weight} Kg` : "—")
                  }
                />
                <MetaCell
                  label="COD amount"
                  value={
                    data.amountRaw ||
                    (data.amount != null
                      ? `${data.amount.toLocaleString("fr-MA")} DH`
                      : "—")
                  }
                />
                <MetaCell
                  label="Deposit date"
                  value={formatAmanaDisplayDate(data.depositDate)}
                />
              </section>

              {/* History */}
              <section className="rounded-2xl bg-white px-4 py-4 shadow-sm shadow-slate-900/[0.03] ring-1 ring-slate-900/[0.05] sm:px-5">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <h3 className="text-[13px] font-semibold tracking-tight text-slate-900">
                    Tracking history
                  </h3>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                    {data.history.length} event{data.history.length === 1 ? "" : "s"}
                  </span>
                </div>
                {data.history.length === 0 ? (
                  <p className="text-sm text-slate-500">No tracking events available.</p>
                ) : (
                  <TrackingTimeline data={data} />
                )}
              </section>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
