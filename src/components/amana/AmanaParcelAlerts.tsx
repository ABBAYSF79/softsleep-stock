import { useMemo, useState } from "react";
import { Bell, ChevronRight, Clock, Eye, Loader2, MapPin } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AmanaParcelStatusBadge } from "@/components/amana/AmanaParcelStatusBadge";
import type {
  AmanaParcelAlert,
  AmanaParcelAlertSeverity,
  AmanaParcelAlertsResponse,
  AmanaParcelStatusOption,
} from "@/hooks/useApi";
import {
  AMANA_ALERT_SEVERITIES,
  AMANA_ALERT_SEVERITY_META,
  filterAlertsBySeverity,
  formatAlertElapsed,
} from "@/utils/amanaParcelAlerts";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

type Props = {
  alerts?: AmanaParcelAlertsResponse | null;
  isLoading?: boolean;
  statusCatalog?: AmanaParcelStatusOption[];
  loadingOrderId?: number | null;
  onOpenOrder: (orderId: number) => void;
};

function formatDateTime(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : format(d, "dd/MM/yyyy HH:mm");
}

function AlertCard({
  alert,
  statusCatalog,
  isOpening,
  onOpenOrder,
}: {
  alert: AmanaParcelAlert;
  statusCatalog?: AmanaParcelStatusOption[];
  isOpening: boolean;
  onOpenOrder: (orderId: number) => void;
}) {
  const meta = AMANA_ALERT_SEVERITY_META[alert.severity];
  const trackingCode = alert.trackingCode?.trim();

  return (
    <li
      data-severity={alert.severity}
      className={cn(
        "rounded-lg border border-l-[3px] border-slate-200 bg-white px-3 py-2.5",
        meta.accent
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p
            className={cn(
              "truncate font-mono text-[13px] font-semibold",
              trackingCode ? "text-slate-900" : "text-amber-700"
            )}
            title={trackingCode || undefined}
          >
            {trackingCode || "Sans code de suivi"}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
            <MapPin className="h-3 w-3 shrink-0 text-slate-400" />
            <span className="truncate">{alert.city || "—"}</span>
          </p>
        </div>
        <Badge variant="outline" className={cn("shrink-0 text-[11px] font-medium", meta.badge)}>
          {meta.label}
        </Badge>
      </div>

      <div className="mt-2">
        <AmanaParcelStatusBadge
          status={alert.status}
          catalog={statusCatalog}
          withDot
          className="max-w-full truncate rounded-full px-2 py-0 text-[11px]"
        />
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div className="min-w-0">
          <dt className="text-[10px] font-medium uppercase tracking-[0.06em] text-slate-400">
            Sans mise à jour
          </dt>
          <dd className={cn("mt-0.5 flex items-center gap-1 font-semibold tabular-nums", meta.text)}>
            <Clock className="h-3 w-3 shrink-0" />
            {formatAlertElapsed(alert.elapsedMs)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[10px] font-medium uppercase tracking-[0.06em] text-slate-400">
            Dernière mise à jour
          </dt>
          <dd className="mt-0.5 tabular-nums text-slate-700">
            {formatDateTime(alert.lastUpdateAt)}
          </dd>
        </div>
      </dl>

      <div className="mt-2 flex items-end justify-between gap-3 border-t border-slate-100 pt-2">
        <p className="min-w-0 text-xs text-slate-600">{alert.suggestedAction}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 shrink-0 gap-1 px-2 text-xs [&_svg]:size-3.5"
          disabled={isOpening}
          onClick={() => onOpenOrder(alert.orderId)}
          aria-label={`Voir la commande #${alert.orderId}`}
        >
          {isOpening ? <Loader2 className="animate-spin" /> : <Eye />}
          Voir la commande
        </Button>
      </div>
    </li>
  );
}

export function AmanaParcelAlerts({
  alerts,
  isLoading,
  statusCatalog,
  loadingOrderId,
  onOpenOrder,
}: Props) {
  const [open, setOpen] = useState(false);
  const [severity, setSeverity] = useState<AmanaParcelAlertSeverity | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const filtered = useMemo(
    () => filterAlertsBySeverity(alerts?.data ?? [], severity),
    [alerts, severity]
  );
  const visible = filtered.slice(0, visibleCount);
  const total = alerts?.counts.total ?? 0;
  const criticalCount = alerts?.counts.CRITICAL ?? 0;

  const selectSeverity = (next: AmanaParcelAlertSeverity | null) => {
    setSeverity(next);
    setVisibleCount(PAGE_SIZE);
  };

  const tabs: Array<{ key: AmanaParcelAlertSeverity | null; label: string; count: number }> = [
    { key: null, label: "Toutes", count: total },
    ...AMANA_ALERT_SEVERITIES.map((s) => ({
      key: s,
      label: AMANA_ALERT_SEVERITY_META[s].pluralLabel,
      count: alerts?.counts[s] ?? 0,
    })),
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Centre de notifications : ${total} alerte${total === 1 ? "" : "s"} — Voir les alertes`}
        className="flex h-12 w-full items-center gap-3 rounded-md border border-slate-200 bg-white px-3 text-left shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <span className="relative shrink-0">
          <Bell className="h-4 w-4 text-slate-600" />
          {criticalCount > 0 && (
            <span
              aria-hidden
              data-testid="critical-indicator"
              className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"
            />
          )}
        </span>
        <span className="hidden truncate text-sm font-semibold text-slate-900 sm:inline">
          Centre de notifications
        </span>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
            total > 0 ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"
          )}
        >
          {isLoading ? "…" : total}
        </span>

        <span aria-hidden className="hidden h-5 w-px shrink-0 bg-slate-200 sm:block" />

        <span className="flex min-w-0 items-center gap-3 text-xs">
          {AMANA_ALERT_SEVERITIES.map((s) => {
            const meta = AMANA_ALERT_SEVERITY_META[s];
            const count = alerts?.counts[s] ?? 0;
            return (
              <span key={s} className="flex shrink-0 items-center gap-1.5">
                <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                <span className="hidden text-slate-500 md:inline">{meta.pluralLabel}</span>
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    count === 0 ? "text-slate-400" : "text-slate-900"
                  )}
                >
                  {isLoading ? "…" : count}
                </span>
              </span>
            );
          })}
        </span>

        <span className="ml-auto flex shrink-0 items-center gap-0.5 text-xs font-medium text-slate-700">
          <span className="hidden sm:inline">Voir les alertes</span>
          <ChevronRight className="h-4 w-4 text-slate-400" />
        </span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="space-y-1 border-b border-slate-100 px-4 pb-3 pt-4 pr-10 text-left">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4 text-slate-600" />
              Centre de notifications
            </SheetTitle>
            <SheetDescription className="text-xs">
              {total} colis sans mise à jour depuis 24h ou plus
              {alerts?.referenceAt
                ? ` · calculé le ${formatDateTime(alerts.referenceAt)}`
                : ""}
            </SheetDescription>
            <div
              role="group"
              aria-label="Filtrer par niveau"
              className="flex flex-wrap gap-1 pt-2"
            >
              {tabs.map((t) => {
                const selected = severity === t.key;
                return (
                  <button
                    key={t.key ?? "all"}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => selectSeverity(t.key)}
                    className={cn(
                      "flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
                    )}
                  >
                    {t.key && (
                      <span
                        aria-hidden
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          AMANA_ALERT_SEVERITY_META[t.key].dot
                        )}
                      />
                    )}
                    {t.label}
                    <span className="tabular-nums opacity-80">{t.count}</span>
                  </button>
                );
              })}
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto bg-slate-50/60 px-4 py-3">
            {isLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Chargement des alertes…
              </p>
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {total === 0
                  ? "Aucune alerte : tous les colis actifs ont été mis à jour il y a moins de 24h."
                  : "Aucune alerte pour ce niveau."}
              </p>
            ) : (
              <>
                <ul aria-label="Liste des alertes" className="space-y-2">
                  {visible.map((a) => (
                    <AlertCard
                      key={a.orderId}
                      alert={a}
                      statusCatalog={statusCatalog}
                      isOpening={loadingOrderId === a.orderId}
                      onOpenOrder={onOpenOrder}
                    />
                  ))}
                </ul>
                {filtered.length > visible.length && (
                  <div className="pt-2 text-center">
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                    >
                      Afficher plus ({filtered.length - visible.length} restantes)
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="border-t border-slate-100 px-4 py-2.5">
            <SheetClose asChild>
              <Button type="button" variant="outline" size="sm" className="h-8 w-full text-xs">
                Fermer
              </Button>
            </SheetClose>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
