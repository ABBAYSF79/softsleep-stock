import type { ReactNode } from "react";
import {
  Copy,
  Eye,
  History,
  MapPin,
  Pencil,
  Phone,
  ScanBarcode,
} from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AmanaParcelStatusBadge } from "@/components/amana/AmanaParcelStatusBadge";
import type {
  AmanaManagementOrderRow,
  AmanaParcelStatusOption,
} from "@/hooks/useApi";
import { cn } from "@/lib/utils";

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function DateCell({
  label,
  title,
  value,
}: {
  label: string;
  title?: string;
  value?: string | null;
}) {
  const d = parseDate(value);
  return (
    <div className="min-w-0 px-3 first:pl-0 last:pr-0">
      <dt
        className="truncate text-[10px] font-medium uppercase tracking-[0.06em] text-slate-400"
        title={title ?? label}
      >
        {label}
      </dt>
      {d ? (
        <dd className="mt-0.5 leading-tight">
          <span className="block text-xs font-semibold tabular-nums text-slate-800">
            {format(d, "dd/MM/yyyy")}
          </span>
          <span className="block text-[11px] tabular-nums text-slate-500">
            {format(d, "HH:mm")}
          </span>
        </dd>
      ) : (
        <dd className="mt-0.5 text-xs font-medium text-slate-400">—</dd>
      )}
    </div>
  );
}

function TrackingIconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={label}
          className="h-7 w-7 shrink-0 rounded-md text-slate-500 hover:bg-white hover:text-slate-900 hover:shadow-sm"
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

type Props = {
  order: AmanaManagementOrderRow;
  statusCatalog: AmanaParcelStatusOption[];
  canMutateStatus: boolean;
  isLoadingDetails?: boolean;
  onViewDetails: () => void;
  onViewHistory: () => void;
  onUpdateStatus: () => void;
  onOpenBarcode: () => void;
  onCopyTracking: () => void;
  selected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
  className?: string;
};

export function AmanaParcelCard({
  order,
  statusCatalog,
  canMutateStatus,
  isLoadingDetails,
  onViewDetails,
  onViewHistory,
  onUpdateStatus,
  onOpenBarcode,
  onCopyTracking,
  selected = false,
  onSelectedChange,
  className,
}: Props) {
  const tracking = order.amanaTracking;
  const trackingCode = order.trackingCode?.trim() || "";
  const address = order.address?.trim() || "";
  // Backend source of truth for init date (inProcessAt or legacy createdAt fallback)
  const departureAt = tracking?.initialStatusAt ?? null;

  return (
    <article
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-px hover:border-slate-300 hover:shadow-md",
        selected && "border-slate-900/70 ring-2 ring-slate-900/10 hover:border-slate-900/70",
        className
      )}
    >
      <div className="flex flex-1 flex-col px-4 pt-3.5">
        {/* A. Header */}
        <header className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            {onSelectedChange && (
              <Checkbox
                checked={selected}
                onCheckedChange={(v) => onSelectedChange(v === true)}
                aria-label={`Sélectionner la commande #${order.id}`}
                className="mt-[3px] border-slate-300 data-[state=checked]:border-slate-900 data-[state=checked]:bg-slate-900 [&_svg]:h-3 [&_svg]:w-3"
              />
            )}
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                Commande
              </p>
              <p className="text-base font-semibold leading-tight tabular-nums tracking-tight text-slate-900">
                #{order.id}
              </p>
            </div>
          </div>
          {tracking?.status ? (
            <AmanaParcelStatusBadge
              status={tracking.status}
              catalog={statusCatalog}
              withDot
              className="mt-0.5 max-w-[62%] shrink-0 rounded-full px-2.5 py-0.5 text-[11px] leading-snug"
            />
          ) : (
            <Badge
              variant="outline"
              className="mt-0.5 shrink-0 rounded-full border-dashed border-amber-300 bg-amber-50/60 px-2.5 py-0.5 text-[11px] font-medium text-amber-800"
            >
              <span aria-hidden className="mr-1.5 h-1.5 w-1.5 rounded-full bg-amber-500" />
              Non initialisé
            </Badge>
          )}
        </header>

        {/* B. Customer & destination */}
        <section className="mt-3 min-w-0">
          <p className="truncate text-[15px] font-semibold leading-snug text-slate-900" title={order.customerName}>
            {order.customerName}
          </p>
          <div className="mt-1 flex min-w-0 items-center gap-x-3 text-xs text-slate-600">
            <span className="flex min-w-0 shrink-0 items-center gap-1.5 tabular-nums">
              <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              {order.phone || "—"}
            </span>
            <span aria-hidden className="h-3 w-px shrink-0 bg-slate-200" />
            <span className="flex min-w-0 items-center gap-1.5 font-medium text-slate-700">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="truncate">{order.city || "—"}</span>
            </span>
          </div>
          {address ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="mt-1 cursor-default truncate text-xs text-slate-500">{address}</p>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{address}</TooltipContent>
            </Tooltip>
          ) : (
            <p className="mt-1 text-xs text-slate-400">Adresse non renseignée</p>
          )}
        </section>

        {/* C. Tracking code */}
        <section className="mt-3 flex min-w-0 items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50 py-2 pl-3 pr-1.5">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
              Tracking code
            </p>
            {trackingCode ? (
              <p
                className="truncate font-mono text-[13px] font-semibold tracking-wide text-slate-900"
                title={trackingCode}
              >
                {trackingCode}
              </p>
            ) : (
              <p className="text-xs font-medium text-amber-700">Sans code de suivi</p>
            )}
          </div>
          {trackingCode && (
            <div className="flex shrink-0 items-center gap-0.5">
              <TrackingIconButton label="Code-barres" onClick={onOpenBarcode}>
                <ScanBarcode />
              </TrackingIconButton>
              <TrackingIconButton label="Copier" onClick={onCopyTracking}>
                <Copy />
              </TrackingIconButton>
            </div>
          )}
        </section>

        {/* D. Dates */}
        <dl className="mb-3.5 mt-3 grid grid-cols-3 divide-x divide-slate-100">
          <DateCell label="Création" value={order.createdAt} />
          <DateCell label="Départ Amana" value={departureAt} />
          <DateCell
            label="Dernière modif."
            title="Dernière modification"
            value={tracking?.lastStatusAt}
          />
        </dl>
      </div>

      {/* E. Actions */}
      <footer className="flex items-center gap-1.5 border-t border-slate-100 bg-slate-50/60 px-3 py-2.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 min-w-0 flex-1 gap-1.5 bg-white px-2 [&_svg]:size-3.5 text-xs font-medium text-slate-700 shadow-none hover:text-slate-900"
          disabled={isLoadingDetails}
          onClick={onViewDetails}
        >
          <Eye />
          <span className="truncate">Détails</span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 min-w-0 flex-1 gap-1.5 bg-white px-2 [&_svg]:size-3.5 text-xs font-medium text-slate-700 shadow-none hover:text-slate-900"
          disabled={!tracking}
          onClick={onViewHistory}
        >
          <History />
          <span className="truncate">Historique</span>
        </Button>
        {canMutateStatus && (
          <Button
            type="button"
            size="sm"
            className="h-8 min-w-0 flex-[1.45] gap-1.5 px-2 [&_svg]:size-3.5 text-xs font-medium shadow-sm"
            disabled={!tracking}
            onClick={onUpdateStatus}
            title="Modifier le statut"
          >
            <Pencil />
            <span className="truncate">Modifier le statut</span>
          </Button>
        )}
      </footer>
    </article>
  );
}
