import { useEffect, useState, type FormEvent } from "react";
import { ClipboardList, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FollowUpTimeline } from "@/components/orders/OrderFollowUpSheet";
import { useAddOrderFollowUp, useOrderFollowUps } from "@/hooks/useApi";
import { cn } from "@/lib/utils";

const QUICK_SITUATIONS = [
  "Client injoignable",
  "Ne répond pas",
  "Client absent",
  "Reporté à demain",
  "Rappeler plus tard",
  "Adresse introuvable",
  "Refusé par le client",
];

const COLLAPSED_COUNT = 3;

interface LivreurFollowUpSectionProps {
  orderId: number;
  enabled: boolean;
}

export const LivreurFollowUpSection = ({ orderId, enabled }: LivreurFollowUpSectionProps) => {
  const [content, setContent] = useState("");
  const [showAll, setShowAll] = useState(false);

  const historyQuery = useOrderFollowUps(orderId, enabled);
  const addMutation = useAddOrderFollowUp();
  const items = historyQuery.data?.items ?? [];
  const visibleItems = showAll ? items : items.slice(0, COLLAPSED_COUNT);

  useEffect(() => {
    setContent("");
    setShowAll(false);
  }, [orderId]);

  const handleQuickSituation = (text: string) => {
    setContent((prev) => {
      const current = prev.trim();
      if (!current) return text;
      if (current.includes(text)) return prev;
      return `${current} — ${text}`;
    });
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || addMutation.isPending) return;
    addMutation.mutate(
      { orderId, content: trimmed },
      { onSuccess: () => setContent("") }
    );
  };

  return (
    <div className="space-y-3 rounded-xl border border-matles-200 bg-matles-50/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <Label
          htmlFor="livreur-suivi"
          className="flex items-center gap-1.5 text-sm font-semibold text-slate-900"
        >
          <ClipboardList className="h-4 w-4 text-matles-600" />
          Suivi livraison
        </Label>
        {items.length > 0 && (
          <span className="rounded-full bg-matles-600 px-2 py-0.5 text-xs font-semibold tabular-nums text-white">
            {items.length} suivi{items.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-2.5">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {QUICK_SITUATIONS.map((text) => (
            <button
              key={text}
              type="button"
              onClick={() => handleQuickSituation(text)}
              className={cn(
                "h-9 shrink-0 rounded-full border px-3 text-sm font-medium transition-colors active:scale-[0.97]",
                content.includes(text)
                  ? "border-matles-600 bg-matles-600 text-white"
                  : "border-slate-200 bg-white text-slate-700"
              )}
            >
              {text}
            </button>
          ))}
        </div>

        <Textarea
          id="livreur-suivi"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Situation de la commande, tentative de livraison..."
          rows={3}
          className="min-h-[88px] resize-none border-slate-200 bg-white text-base"
        />

        <Button
          type="submit"
          disabled={!content.trim() || addMutation.isPending}
          className="h-12 w-full bg-matles-600 text-base font-semibold hover:bg-matles-700"
        >
          {addMutation.isPending ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Enregistrement...
            </span>
          ) : (
            <span className="inline-flex items-center gap-2">
              <Send className="h-4 w-4" aria-hidden />
              Ajouter le suivi
            </span>
          )}
        </Button>
      </form>

      <div className="rounded-lg bg-white p-3">
        {historyQuery.isLoading ? (
          <div className="flex items-center gap-2 py-3 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement...
          </div>
        ) : historyQuery.isError ? (
          <p className="py-2 text-sm text-red-600">Impossible de charger le suivi.</p>
        ) : items.length === 0 ? (
          <p className="py-2 text-sm text-slate-500">Aucun suivi pour cette commande.</p>
        ) : (
          <>
            <FollowUpTimeline items={visibleItems} />
            {items.length > COLLAPSED_COUNT && (
              <Button
                type="button"
                variant="ghost"
                className="mt-1 h-10 w-full text-sm font-medium text-matles-700"
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? "Afficher moins" : `Voir tout l'historique (${items.length})`}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
};
