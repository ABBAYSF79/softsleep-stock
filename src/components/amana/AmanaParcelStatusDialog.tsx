import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AmanaParcelStatusBadge } from "@/components/amana/AmanaParcelStatusBadge";
import type { AmanaManagementOrderRow, AmanaParcelStatusOption } from "@/hooks/useApi";
import { format } from "date-fns";

const DEFAULT_INITIAL_STATUS = "SORTI_A_DESTINATION";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: AmanaManagementOrderRow | null;
  statuses: AmanaParcelStatusOption[];
  canMutate: boolean;
  isSaving: boolean;
  onSubmit: (args: { orderId: number; status: string; note?: string }) => Promise<void>;
};

export function AmanaParcelStatusDialog({
  open,
  onOpenChange,
  order,
  statuses,
  canMutate,
  isSaving,
  onSubmit,
}: Props) {
  const currentCode = order?.amanaTracking?.status?.code ?? "";
  const [nextStatus, setNextStatus] = useState(currentCode);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open && order) {
      setNextStatus(order.amanaTracking?.status?.code ?? DEFAULT_INITIAL_STATUS);
      setNote("");
    }
  }, [open, order]);

  if (!order) return null;

  const isInitialization = !order.amanaTracking;

  const handleConfirm = async () => {
    if (!canMutate || !nextStatus || isSaving) return;
    await onSubmit({
      orderId: order.id,
      status: nextStatus,
      note: note.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isInitialization ? "Initialiser le suivi Amana" : "Statut Amana"}
          </DialogTitle>
          <DialogDescription>
            {isInitialization
              ? "Choisis le statut de départ pour commencer le suivi — n’affecte pas le statut de la commande."
              : "Mise à jour manuelle du suivi Amana — n’affecte pas le statut de la commande."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm">
            <div className="font-medium text-slate-900">{order.customerName}</div>
            <div className="mt-0.5 font-mono text-xs text-slate-600">
              {order.trackingCode?.trim() || "Sans code de suivi"}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Actuel :</span>
              {order.amanaTracking?.status ? (
                <AmanaParcelStatusBadge status={order.amanaTracking.status} catalog={statuses} />
              ) : (
                <span className="text-xs text-amber-700">Non initialisé</span>
              )}
            </div>
            {order.amanaTracking?.lastStatusAt && (
              <div className="mt-1 text-xs text-muted-foreground">
                Dernière màj :{" "}
                {format(new Date(order.amanaTracking.lastStatusAt), "dd MMM yyyy · HH:mm")}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="amana-status">
              {isInitialization ? "Statut initial" : "Nouveau statut"}
            </Label>
            <Select
              value={nextStatus || undefined}
              onValueChange={setNextStatus}
              disabled={!canMutate || isSaving}
            >
              <SelectTrigger id="amana-status">
                <SelectValue placeholder="Choisir un statut" />
              </SelectTrigger>
              <SelectContent>
                {statuses.map((s) => (
                  <SelectItem key={s.code} value={s.code}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amana-note">Note (optionnelle)</Label>
            <Textarea
              id="amana-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex. client absent, report…"
              rows={3}
              maxLength={2000}
              disabled={!canMutate || isSaving}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Annuler
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!canMutate || isSaving || !nextStatus}
          >
            {isSaving ? "Enregistrement…" : isInitialization ? "Initialiser" : "Confirmer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
