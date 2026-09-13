import { CheckCircle2, Radar, Loader2, RotateCw } from "lucide-react";
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
import {
  useAmanaTrackingHproxy,
  useUpdateOrderStatus,
  type AmanaTrackingHproxyData,
} from "@/hooks/useApi";
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

type AmanaTrackingHproxySheetProps = {
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

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-amber-700/70">{label}</p>
      <p className="mt-0.5 break-words text-sm font-medium text-slate-900">{value ?? "—"}</p>
    </div>
  );
}

function TrackingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse" data-testid="amana-tracking-hproxy-skeleton">
      <div className="space-y-2 rounded-lg border border-amber-100 bg-amber-50/40 p-3">
        <div className="h-3 w-24 rounded bg-amber-200/70" />
        <div className="h-6 w-40 rounded bg-amber-200/70" />
        <div className="h-3 w-32 rounded bg-amber-200/70" />
        <div className="h-4 w-full rounded bg-amber-200/70" />
      </div>
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-3">
            <div className="mt-1 h-2.5 w-2.5 rounded-full bg-amber-200" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-28 rounded bg-amber-100" />
              <div className="h-4 w-36 rounded bg-amber-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrackingTimeline({ data }: { data: AmanaTrackingHproxyData }) {
  return (
    <ol className="relative space-y-0" data-testid="amana-tracking-hproxy-timeline">
      {data.history.map((item, index) => {
        const isFirst = index === 0;
        const isLast = index === data.history.length - 1;
        const statusCode = item.statusCode as AmanaStatusCode;
        return (
          <li
            key={`${item.date}-${item.time}-${index}`}
            className="relative grid grid-cols-[14px_minmax(0,1fr)] gap-x-3 pb-4 last:pb-0"
          >
            <div className="relative flex justify-center pt-1.5" aria-hidden>
              {!isLast && (
                <span className="absolute top-3 bottom-[-16px] w-px bg-amber-200" />
              )}
              <span
                className={cn(
                  "relative z-[1] mt-0.5 rounded-full ring-2 ring-white",
                  isFirst ? "h-3 w-3" : "h-2.5 w-2.5",
                  amanaStatusDotClass(statusCode)
                )}
              />
            </div>
            <div className={cn("min-w-0 space-y-1.5", isFirst && "rounded-md bg-amber-50/70 p-2 -ml-1")}>
              <p className="text-[11px] text-slate-500">
                {formatAmanaDisplayDate(item.date)}
                {item.time ? ` · ${item.time}` : ""}
              </p>
              <Badge
                className={cn(
                  "h-6 px-2 text-xs font-semibold",
                  amanaStatusBadgeClass(statusCode)
                )}
              >
                {item.statusLabel}
              </Badge>
              <p className="text-xs text-slate-500">{item.rawStatus}</p>
              {item.location ? (
                <p className="text-xs font-medium text-slate-700">{item.location}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function AmanaTrackingHproxySheet({
  open,
  onOpenChange,
  order,
  onOrderStatusPatched,
}: AmanaTrackingHproxySheetProps) {
  const orderId = order?.id ?? null;
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const query = useAmanaTrackingHproxy(orderId, open && Boolean(orderId));
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
        void queryClient.cancelQueries({ queryKey: ["amana-tracking-hproxy", "order", orderId] });
      }
    }
  }, [open, orderId, queryClient]);

  const handleRefresh = async () => {
    if (!orderId || isRefreshing) return;
    setIsRefreshing(true);
    setRefreshError(null);
    try {
      const { data: payload } = await api.get(`/amana-tracking-hproxy/order/${orderId}`, {
        params: { refresh: 1 },
        timeout: 30000,
      });
      queryClient.setQueryData(["amana-tracking-hproxy", "order", orderId], payload);
    } catch (error: any) {
      const message =
        error?.response?.data?.error ||
        (error?.code === "ECONNABORTED"
          ? "Request timed out — HProxy path could not reach AMANA in time"
          : "Unable to refresh AMANA tracking (HProxy)");
      setRefreshError(message);
      console.error("AMANA DI tracking refresh failed", error?.response?.data || error);
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
      ? "Request timed out — HProxy path could not reach AMANA in time"
      : null) ||
    (query.isError ? "We couldn't retrieve tracking via HProxy." : null);
  const displayError = refreshError || errorFromQuery;
  const showError = !data && Boolean(displayError);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="flex w-full flex-col gap-0 overflow-hidden border-l-4 border-l-amber-500 p-0 sm:max-w-[440px]"
        data-testid="amana-tracking-hproxy-sheet"
      >
        <SheetHeader className="shrink-0 space-y-0 border-b border-amber-100 bg-gradient-to-br from-amber-50 to-orange-50/80 px-4 pb-3 pt-4 pr-12 text-left sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Radar className="h-4 w-4 text-amber-700" aria-hidden />
                <SheetTitle className="text-base font-semibold text-slate-900">
                  Shipment Tracking
                </SheetTitle>
                <span className="inline-flex items-center rounded-md border border-amber-300 bg-amber-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  HP TEST
                </span>
                {data && !query.isError ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
                    Live
                  </span>
                ) : null}
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                AMANA · HProxy
              </p>
              <p
                className="font-mono text-sm font-semibold tabular-nums text-amber-800"
                data-testid="amana-tracking-hproxy-code"
              >
                {trackingCode}
              </p>
              <p className="text-[11px] text-amber-700/80">
                {data?.proxyLabel || "Proxy test path — compare with the flask / truck icons"}
              </p>
              <SheetDescription className="sr-only">
                AMANA shipment tracking via HProxy for order #{order?.id}
              </SheetDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0 gap-1.5 border-amber-300 bg-white text-amber-800 hover:bg-amber-50"
              onClick={() => void handleRefresh()}
              disabled={isRefreshing || !orderId || showInitialLoading}
              aria-label="Refresh HProxy tracking"
              title="Refresh HProxy tracking"
            >
              <RotateCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5">
          {showInitialLoading ? (
            <div className="space-y-3">
              <p className="text-center text-xs text-amber-700/80">
                Contacting AMANA via HProxy… (max ~30s)
              </p>
              <TrackingSkeleton />
            </div>
          ) : showError ? (
            <div className="space-y-3 py-6 text-center" data-testid="amana-tracking-hproxy-error">
              <p className="text-sm font-semibold text-slate-900">Unable to retrieve tracking</p>
              <p className="text-sm text-slate-500">{displayError}</p>
              {(query.error as any)?.response?.data?.detail ? (
                <p className="break-all text-xs text-slate-400">
                  {(query.error as any).response.data.detail}
                </p>
              ) : null}
              <p className="mx-auto max-w-sm text-xs text-slate-400">
                This is the HProxy test path. Truck = Turnoxy, Flask = DataImpulse.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-amber-300 text-amber-800"
                onClick={() => void handleRefresh()}
                disabled={isRefreshing}
              >
                {isRefreshing ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Retry
              </Button>
            </div>
          ) : data ? (
            <div className="space-y-4">
              <section className="space-y-3 rounded-lg border border-amber-100 bg-white p-3 shadow-sm shadow-amber-100/50">
                {data.product ? (
                  <p className="text-xs font-medium text-slate-500">{data.product}</p>
                ) : null}
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-amber-700/70">
                    Current status
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge className={amanaStatusBadgeClass(data.status.code as AmanaStatusCode)}>
                      {data.status.label}
                    </Badge>
                  </div>
                  {data.status.raw ? (
                    <p className="mt-1 text-xs text-slate-500">"{data.status.raw}"</p>
                  ) : null}
                </div>
                <SummaryRow label="Current location" value={data.currentPosition || "—"} />
                <SummaryRow
                  label="Last update"
                  value={
                    data.lastUpdate
                      ? formatAmanaDateTime(data.lastUpdate.date, data.lastUpdate.time)
                      : "—"
                  }
                />
                {suggestedStatus && suggestedStatus !== currentOrderStatus ? (
                  <div
                    className={cn(
                      "rounded-md border p-3",
                      suggestedStatus === "DELIVERED"
                        ? "border-emerald-200 bg-emerald-50/80"
                        : "border-red-200 bg-red-50/80"
                    )}
                    data-testid="amana-hproxy-apply-status"
                  >
                    <p
                      className={cn(
                        "text-sm font-medium",
                        suggestedStatus === "DELIVERED" ? "text-emerald-900" : "text-red-900"
                      )}
                    >
                      AMANA reports {data.status.label}. Your order is still{" "}
                      <span className="font-semibold">{currentOrderStatus || "—"}</span>.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      className={cn(
                        "mt-2 h-8 gap-1.5 text-white",
                        suggestedStatus === "DELIVERED"
                          ? "bg-emerald-700 hover:bg-emerald-800"
                          : "bg-red-700 hover:bg-red-800"
                      )}
                      disabled={!canPatchOrder}
                      onClick={() => void handleApplyOrderStatus()}
                    >
                      {updateStatus.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      Mark order as {suggestedStatus === "DELIVERED" ? "Delivered" : "Returned"}
                    </Button>
                  </div>
                ) : null}
              </section>

              <section className="grid grid-cols-2 gap-3 rounded-lg border border-amber-100 bg-amber-50/40 p-3">
                <SummaryRow label="Destination" value={data.destination || "—"} />
                <SummaryRow
                  label="Weight"
                  value={
                    data.weightRaw ||
                    (data.weight != null ? `${data.weight} Kg` : "—")
                  }
                />
                <SummaryRow
                  label="COD amount"
                  value={
                    data.amountRaw ||
                    (data.amount != null
                      ? `${data.amount.toLocaleString("fr-MA")} DH`
                      : "—")
                  }
                />
                <SummaryRow
                  label="Deposit date"
                  value={formatAmanaDisplayDate(data.depositDate)}
                />
              </section>

              <section>
                <h3 className="mb-3 text-sm font-semibold text-amber-900">Tracking history</h3>
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
