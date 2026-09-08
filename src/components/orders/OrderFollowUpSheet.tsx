import { useState, type FormEvent } from "react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { useAddOrderFollowUp, useOrderFollowUps } from "@/hooks/useApi";
import { cn } from "@/lib/utils";
import type { OrderFollowUpItem } from "@/hooks/useApi";

type OrderFollowUpSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: {
    id: number;
    customerName?: string;
    phone?: string | null;
    city?: string | null;
    status?: string;
  } | null;
};

export function followUpAuthorInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function formatFollowUpTimestamp(iso: string | Date): string {
  return format(new Date(iso), "dd MMM yyyy · HH:mm");
}

export function FollowUpTimeline({
  items,
  className,
}: {
  items: OrderFollowUpItem[];
  className?: string;
}) {
  return (
    <ol className={cn("relative space-y-0", className)} data-testid="suivi-timeline">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <li
            key={item.id}
            className="relative grid grid-cols-[14px_minmax(0,1fr)] gap-x-3 pb-5 last:pb-0"
            data-testid="suivi-timeline-item"
          >
            <div className="relative flex justify-center pt-1.5" aria-hidden>
              {!isLast && (
                <span className="absolute top-3 bottom-[-20px] w-px bg-matles-200" />
              )}
              <span className="relative z-[1] mt-0.5 h-2.5 w-2.5 rounded-full bg-matles-600 ring-2 ring-white" />
            </div>
            <div
              className={cn(
                "min-w-0 space-y-1.5 pb-4",
                !isLast && "border-b border-slate-100"
              )}
            >
              <p className="text-[11px] leading-none text-slate-500">
                {formatFollowUpTimestamp(item.createdAt)}
              </p>
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[9px] font-semibold text-slate-600">
                  {followUpAuthorInitials(item.userName)}
                </span>
                <p className="truncate text-xs font-medium text-slate-500">
                  {item.userName}
                </p>
              </div>
              <p className="whitespace-pre-wrap break-words text-[15px] font-medium leading-snug text-slate-900">
                {item.content}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function OrderFollowUpSheet({ open, onOpenChange, order }: OrderFollowUpSheetProps) {
  const [content, setContent] = useState("");
  const orderId = order?.id ?? null;

  const historyQuery = useOrderFollowUps(orderId, open && Boolean(orderId));
  const addMutation = useAddOrderFollowUp();

  const items = historyQuery.data?.items ?? [];
  const phoneCity = [order?.phone, order?.city].filter(Boolean).join(" · ");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || addMutation.isPending || !orderId) return;
    addMutation.mutate(
      { orderId, content: trimmed },
      {
        onSuccess: () => setContent(""),
      }
    );
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) setContent("");
        onOpenChange(next);
      }}
    >
      <SheetContent
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[440px]"
        data-testid="suivi-sheet"
      >
        <SheetHeader className="shrink-0 space-y-0 border-b border-slate-100 px-4 pb-3 pt-4 pr-12 text-left sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <SheetTitle className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Suivi
              </SheetTitle>
              <p
                className="text-xl font-semibold tabular-nums tracking-tight text-matles-700"
                data-testid="suivi-order-id"
              >
                #{order?.id ?? "—"}
              </p>
              <SheetDescription className="sr-only">
                Journal de suivi pour la commande #{order?.id}
              </SheetDescription>
            </div>
            {order?.status ? (
              <div className="shrink-0 pt-0.5" data-testid="suivi-status">
                <OrderStatusBadge status={order.status} />
              </div>
            ) : null}
          </div>
          {order ? (
            <div className="mt-2 min-w-0 space-y-0.5" data-testid="suivi-order-meta">
              <p className="truncate text-sm font-medium text-slate-900">
                {order.customerName || "—"}
              </p>
              {phoneCity ? (
                <p className="truncate text-xs text-slate-500">{phoneCity}</p>
              ) : null}
            </div>
          ) : null}
        </SheetHeader>

        <form
          onSubmit={handleSubmit}
          className="shrink-0 space-y-2 border-b border-slate-100 px-4 py-3 sm:px-5"
          data-testid="suivi-add-form"
        >
          <Label htmlFor="suivi-content" className="text-sm font-medium text-slate-800">
            Ajouter un suivi
          </Label>
          <Textarea
            id="suivi-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Écrire la situation de la commande..."
            rows={3}
            className="min-h-[88px] max-h-[140px] resize-y border-slate-200 px-3 py-2 text-sm shadow-none focus-visible:ring-matles-500/30 focus-visible:ring-offset-0"
          />
          <Button
            type="submit"
            disabled={!content.trim() || addMutation.isPending}
            className="h-10 w-full bg-matles-600 hover:bg-matles-700"
          >
            {addMutation.isPending ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Ajouter…
              </span>
            ) : (
              "Ajouter le suivi"
            )}
          </Button>
        </form>

        <section
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5"
          data-testid="suivi-history"
        >
          <h3 className="mb-3 text-sm font-semibold text-slate-800">Historique du suivi</h3>

          {historyQuery.isLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement…
            </div>
          ) : historyQuery.isError ? (
            <p className="py-4 text-sm text-red-600">Impossible de charger l’historique.</p>
          ) : items.length === 0 ? (
            <p
              className="py-4 text-sm text-slate-500"
              data-testid="suivi-empty"
            >
              Aucun suivi pour cette commande.
            </p>
          ) : (
            <FollowUpTimeline items={items} />
          )}
        </section>
      </SheetContent>
    </Sheet>
  );
}
