import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AmanaParcelStatusBadge } from "@/components/amana/AmanaParcelStatusBadge";
import {
  useAmanaParcelTracking,
  type AmanaManagementOrderRow,
  type AmanaParcelStatusOption,
} from "@/hooks/useApi";
import { cn } from "@/lib/utils";

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "dd MMM yyyy · HH:mm");
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: AmanaManagementOrderRow | null;
  statusCatalog: AmanaParcelStatusOption[];
};

export function AmanaParcelHistorySheet({
  open,
  onOpenChange,
  order,
  statusCatalog,
}: Props) {
  const orderId = order?.id ?? null;
  const { data, isLoading, isError, error, refetch, isFetching } =
    useAmanaParcelTracking(orderId, open && Boolean(orderId));

  const detail = data?.data;
  const tracking = detail?.amanaTracking ?? null;
  const history = tracking?.history ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="space-y-1 border-b border-slate-100 pb-4 text-left">
          <SheetTitle>Historique Amana</SheetTitle>
          <SheetDescription>
            {order
              ? `#${order.id} · ${order.customerName}`
              : "Suivi manuel des statuts"}
          </SheetDescription>
          {order?.trackingCode?.trim() ? (
            <code className="mt-1 inline-block rounded bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-slate-600">
              {order.trackingCode}
            </code>
          ) : null}
        </SheetHeader>

        <div className="flex-1 py-4">
          {isLoading ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Chargement de l’historique…
            </div>
          ) : isError ? (
            <div className="flex h-40 flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm font-medium text-red-600">
                Impossible de charger l’historique
              </p>
              <p className="text-xs text-muted-foreground">
                {(error as any)?.response?.data?.error ||
                  (error as Error)?.message ||
                  "Erreur réseau"}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                {isFetching ? "Nouvelle tentative…" : "Réessayer"}
              </Button>
            </div>
          ) : !tracking ? (
            <div className="flex h-40 flex-col items-center justify-center gap-1 text-center">
              <p className="text-sm font-medium text-slate-700">
                Aucun suivi Amana
              </p>
              <p className="text-xs text-muted-foreground">
                Cette commande n’a pas encore de suivi initialisé.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Statut actuel
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <AmanaParcelStatusBadge
                    status={tracking.status}
                    catalog={statusCatalog}
                  />
                </div>
                <dl className="mt-2 space-y-1 text-[11px] text-slate-600">
                  <div className="flex justify-between gap-2">
                    <dt>Initialisation</dt>
                    <dd className="font-medium">
                      {formatDateTime(tracking.initialStatusAt)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>Dernière modification</dt>
                    <dd className="font-medium">
                      {formatDateTime(tracking.lastStatusAt)}
                    </dd>
                  </div>
                </dl>
              </div>

              {history.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 px-3 py-8 text-center text-sm text-muted-foreground">
                  Aucune entrée d’historique
                </div>
              ) : (
                <ol className="relative space-y-0">
                  {history.map((item, index) => {
                    const isLast = index === history.length - 1;
                    const isInitial = item.oldStatus === null;
                    return (
                      <li
                        key={item.id}
                        className="relative grid grid-cols-[14px_minmax(0,1fr)] gap-x-3 pb-5 last:pb-0"
                      >
                        <div className="relative flex justify-center pt-1.5" aria-hidden>
                          {!isLast && (
                            <span className="absolute top-3 bottom-[-20px] w-px bg-slate-200" />
                          )}
                          <span
                            className={cn(
                              "relative z-[1] mt-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white",
                              isInitial ? "bg-blue-600" : "bg-slate-500"
                            )}
                          />
                        </div>
                        <div
                          className={cn(
                            "min-w-0 space-y-1.5 pb-4",
                            !isLast && "border-b border-slate-100"
                          )}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            {isInitial && (
                              <Badge
                                variant="secondary"
                                className="h-5 px-1.5 text-[10px] font-medium"
                              >
                                Initialisation
                              </Badge>
                            )}
                            <AmanaParcelStatusBadge
                              status={item.newStatus}
                              catalog={statusCatalog}
                            />
                          </div>
                          {item.oldStatus ? (
                            <p className="text-[11px] text-slate-500">
                              Depuis{" "}
                              <span className="font-medium text-slate-600">
                                {item.oldStatus.label}
                              </span>
                            </p>
                          ) : null}
                          <p className="text-[11px] text-slate-500">
                            {formatDateTime(item.changedAt)}
                          </p>
                          <p className="text-xs text-slate-600">
                            {item.changedBy?.name?.trim() || "Utilisateur inconnu"}
                            {item.changedBy?.role
                              ? ` · ${item.changedBy.role}`
                              : ""}
                          </p>
                          {item.note?.trim() ? (
                            <p className="rounded-md bg-slate-50 px-2 py-1.5 text-xs text-slate-700 ring-1 ring-slate-100">
                              {item.note}
                            </p>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
