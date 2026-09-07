import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { ORDER_STATUSES, generateAmanaTrackingCode } from "@/utils/order-utils";
import { Car } from "lucide-react";
import { toast } from "sonner";

export type QuickStatusTarget = keyof typeof ORDER_STATUSES;

/** Status targets allowed from a row, by role + current status. */
export function getQuickStatusTargets(
  currentStatus: string,
  role: { isAdmin: boolean; isSuivi: boolean; isLivreur: boolean; isSales?: boolean }
): QuickStatusTarget[] {
  const current = currentStatus?.toUpperCase();

  if (role.isLivreur) {
    return current === "PENDING" ? ["DELIVERED"] : [];
  }

  if (role.isSuivi) {
    if (current === "PENDING") return ["IN_PROCESS", "DELIVERED"];
    if (current === "IN_PROCESS") return ["DELIVERED", "RETURNED"];
    return [];
  }

  // ADMIN / SALES / others with full access
  // PENDING never goes to RETURNED — no stock reservation yet
  if (role.isAdmin || role.isSales) {
    return (Object.keys(ORDER_STATUSES) as QuickStatusTarget[]).filter((s) => {
      if (s === current) return false;
      if (current === "PENDING" && s === "RETURNED") return false;
      return true;
    });
  }

  return [];
}

function requiresTrackingCode(from: string, to: string): boolean {
  return from?.toUpperCase() === "PENDING" && to?.toUpperCase() === "IN_PROCESS";
}

type PendingChange = {
  order: any;
  nextStatus: QuickStatusTarget;
  mode: "tracking" | "confirm";
};

type OrderQuickStatusControlProps = {
  order: any;
  isAdmin: boolean;
  isSuivi: boolean;
  isLivreur: boolean;
  isSales?: boolean;
  disabled?: boolean;
  onConfirmStatus: (args: {
    id: number;
    status: string;
    trackingCode?: string;
  }) => void | Promise<void>;
};

/**
 * Clickable status badge with dropdown + confirm / tracking dialogs.
 * stopPropagation so table row click still opens view.
 */
export function OrderQuickStatusControl({
  order,
  isAdmin,
  isSuivi,
  isLivreur,
  isSales = false,
  disabled,
  onConfirmStatus,
}: OrderQuickStatusControlProps) {
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [trackingCode, setTrackingCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const targets = useMemo(
    () =>
      getQuickStatusTargets(order?.status, {
        isAdmin,
        isSuivi,
        isLivreur,
        isSales,
      }),
    [order?.status, isAdmin, isSuivi, isLivreur, isSales]
  );

  useEffect(() => {
    if (!pending) return;
    setTrackingCode(
      typeof pending.order?.trackingCode === "string"
        ? pending.order.trackingCode
        : ""
    );
  }, [pending]);

  const requestChange = (nextStatus: QuickStatusTarget) => {
    if (disabled || nextStatus === order?.status) return;
    const mode = requiresTrackingCode(order?.status, nextStatus)
      ? "tracking"
      : "confirm";
    setPending({ order, nextStatus, mode });
  };

  const closePending = () => {
    if (submitting) return;
    setPending(null);
    setTrackingCode("");
  };

  const submitPending = async () => {
    if (!pending) return;
    if (pending.mode === "tracking" && !trackingCode.trim()) {
      toast.error("Tracking code is required");
      return;
    }

    setSubmitting(true);
    try {
      await onConfirmStatus({
        id: pending.order.id,
        status: pending.nextStatus,
        ...(pending.mode === "tracking"
          ? { trackingCode: trackingCode.trim() }
          : {}),
      });
      setPending(null);
      setTrackingCode("");
    } finally {
      setSubmitting(false);
    }
  };

  const nextLabel =
    pending && ORDER_STATUSES[pending.nextStatus]
      ? ORDER_STATUSES[pending.nextStatus].label
      : pending?.nextStatus;

  return (
    <>
      {targets.length === 0 ? (
        <OrderStatusBadge status={order?.status} />
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              className="rounded-md outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-matles-500/40 disabled:opacity-60"
              onClick={(e) => e.stopPropagation()}
              aria-label={`Change status for order ${order?.id}`}
            >
              <OrderStatusBadge status={order?.status} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onClick={(e) => e.stopPropagation()}
          >
            {targets.map((value) => (
              <DropdownMenuItem
                key={value}
                disabled={disabled}
                onSelect={() => requestChange(value)}
              >
                {ORDER_STATUSES[value].label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Dialog
        open={Boolean(pending)}
        onOpenChange={(open) => {
          if (!open) closePending();
        }}
      >
        <DialogContent
          className="sm:max-w-[440px]"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>
              {pending?.mode === "tracking"
                ? "Tracking code requis"
                : "Confirmer le statut"}
            </DialogTitle>
            <DialogDescription>
              Commande #{pending?.order?.id} —{" "}
              {ORDER_STATUSES[pending?.order?.status as QuickStatusTarget]
                ?.label || pending?.order?.status}{" "}
              → {nextLabel}
            </DialogDescription>
          </DialogHeader>

          {pending?.mode === "tracking" ? (
            <div className="space-y-3 py-1">
              <p className="text-sm text-slate-600">
                Pour passer en <strong>In Process</strong>, saisissez le code
                tracking puis confirmez.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="quick-tracking">Tracking code</Label>
                <div className="flex gap-2">
                  <Input
                    id="quick-tracking"
                    value={trackingCode}
                    onChange={(e) => setTrackingCode(e.target.value)}
                    placeholder="Tracking code"
                    autoFocus
                    className="h-10 border-slate-200"
                  />
                  {pending?.order?.id != null && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 shrink-0 border-slate-200"
                      onClick={() => {
                        const code = generateAmanaTrackingCode(pending.order.id);
                        setTrackingCode(code);
                        toast.success(`Code généré: ${code}`);
                      }}
                      aria-label="Generate Amana tracking code"
                    >
                      <Car className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="py-1 text-sm text-slate-600">
              Confirmer le passage au statut <strong>{nextLabel}</strong> ?
            </p>
          )}

          <DialogFooter className="gap-2 sm:space-x-0">
            <Button
              type="button"
              variant="outline"
              onClick={closePending}
              disabled={submitting}
              className="border-slate-200"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void submitPending()}
              disabled={
                submitting ||
                (pending?.mode === "tracking" && !trackingCode.trim())
              }
              className="bg-matles-600 hover:bg-matles-700"
            >
              {submitting ? "Saving..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
