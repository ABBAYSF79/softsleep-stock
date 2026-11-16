import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  Copy,
  Loader2,
  MessageCircle,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { fetchAmanaManagementExport } from "@/hooks/useApi";
import {
  amanaSmartCopyGroupKey,
  buildAmanaSmartCopyText,
  filterAmanaSmartCopyRows,
  groupAmanaSmartCopyRows,
} from "@/utils/amanaSmartCopy";
import { copyText } from "@/utils/clipboard";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderIds: number[];
};

/** `base` is the generated text the edit started from; unedited drafts follow the generated text. */
type Draft = { text: string; base: string };

export function AmanaSmartCopyDialog({ open, onOpenChange, orderIds }: Props) {
  const sortedIds = useMemo(() => [...orderIds].sort((a, b) => a - b), [orderIds]);

  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ["amana-management", "smart-copy", sortedIds],
    queryFn: () => fetchAmanaManagementExport({ orderIds: sortedIds }),
    enabled: open && sortedIds.length > 0,
    staleTime: 0,
    gcTime: 0,
  });

  const [excludedGroups, setExcludedGroups] = useState<Set<string>>(() => new Set());
  const [excludedOrderIds, setExcludedOrderIds] = useState<Set<number>>(() => new Set());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showOrders, setShowOrders] = useState(false);
  const [justCopied, setJustCopied] = useState(false);

  // Report-local state starts fresh on every open; the page selection is never touched.
  useEffect(() => {
    if (!open) return;
    setExcludedGroups(new Set());
    setExcludedOrderIds(new Set());
    setDraft(null);
    setShowOrders(false);
    setJustCopied(false);
  }, [open]);

  useEffect(() => {
    if (!justCopied) return;
    const t = window.setTimeout(() => setJustCopied(false), 1800);
    return () => window.clearTimeout(t);
  }, [justCopied]);

  const rows = useMemo(() => data?.data ?? [], [data]);
  const allGroups = useMemo(() => groupAmanaSmartCopyRows(rows), [rows]);
  const includedRows = useMemo(
    () => filterAmanaSmartCopyRows(rows, { groups: excludedGroups, orderIds: excludedOrderIds }),
    [rows, excludedGroups, excludedOrderIds]
  );
  const generatedText = useMemo(() => buildAmanaSmartCopyText(includedRows), [includedRows]);

  const includedCountByGroup = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of includedRows) {
      const k = amanaSmartCopyGroupKey(r);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [includedRows]);

  const isEdited = draft !== null && draft.text !== draft.base;
  const text = isEdited ? draft.text : generatedText;
  const editsOutdated = isEdited && draft.base !== generatedText;
  const lineCount = text ? text.split("\n").length : 0;

  const visibleGroups = allGroups.filter((g) => !excludedGroups.has(g.key));
  const missing = data ? sortedIds.length - rows.length : 0;

  const handleTextChange = (value: string) => {
    setDraft((prev) =>
      prev && prev.text !== prev.base ? { ...prev, text: value } : { text: value, base: generatedText }
    );
  };

  const resetText = () => setDraft(null);

  const toggleGroup = (key: string) =>
    setExcludedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const setOrderIncluded = (orderId: number, included: boolean) =>
    setExcludedOrderIds((prev) => {
      const next = new Set(prev);
      if (included) next.delete(orderId);
      else next.add(orderId);
      return next;
    });

  const handleCopy = async () => {
    if (!text.trim()) return;
    if (await copyText(text)) {
      setJustCopied(true);
      toast.success("Rapport copié — prêt pour WhatsApp");
    } else {
      toast.error("Impossible de copier");
    }
  };

  const apiError = (error as { response?: { data?: { error?: string } } } | null)?.response?.data
    ?.error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92vh,820px)] w-[calc(100vw-1.25rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[680px]">
        <DialogHeader className="space-y-0.5 border-b px-5 pb-3 pt-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <MessageCircle className="h-4 w-4 text-[#25D366]" />
            Smart Copy WhatsApp
          </DialogTitle>
          <DialogDescription className="text-xs">
            {data
              ? `${includedRows.length} commande${includedRows.length === 1 ? "" : "s"} incluse${
                  includedRows.length === 1 ? "" : "s"
                } sur ${rows.length}`
              : `${sortedIds.length} commande${sortedIds.length === 1 ? "" : "s"} sélectionnée${
                  sortedIds.length === 1 ? "" : "s"
                }`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
          {isFetching && !data ? (
            <div className="flex h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement des données à jour…
            </div>
          ) : error ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-center">
              <p className="text-sm font-medium text-red-600">
                {apiError || "Impossible de charger les commandes"}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
                Réessayer
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Aucune commande sélectionnée n'est encore éligible.
            </p>
          ) : (
            <>
              {/* Group management */}
              <div className="space-y-2">
                <div
                  className="flex flex-wrap items-center gap-1.5"
                  role="group"
                  aria-label="Groupes du rapport"
                >
                  {allGroups.map((g) => {
                    const selected = !excludedGroups.has(g.key);
                    const count = selected ? includedCountByGroup.get(g.key) ?? 0 : g.rows.length;
                    return (
                      <button
                        key={g.key}
                        type="button"
                        aria-pressed={selected}
                        title={selected ? "Retirer du rapport" : "Ajouter au rapport"}
                        onClick={() => toggleGroup(g.key)}
                        className={cn(
                          "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          selected
                            ? "border-slate-300 bg-white text-slate-800 shadow-sm hover:border-slate-400"
                            : "border-dashed border-slate-200 bg-slate-50 text-slate-400 hover:border-slate-300 hover:text-slate-600"
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border",
                            selected
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-300 bg-white"
                          )}
                        >
                          {selected && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                        </span>
                        {g.label}
                        <span className="tabular-nums text-slate-400">({count})</span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 font-medium text-slate-600 hover:text-slate-900"
                    aria-expanded={showOrders}
                    onClick={() => setShowOrders((v) => !v)}
                  >
                    <ChevronDown
                      className={cn("h-3.5 w-3.5 transition-transform", showOrders && "rotate-180")}
                    />
                    Gérer les commandes
                  </button>
                  {excludedGroups.size > 0 ? (
                    <button
                      type="button"
                      className="font-medium text-[#128C7E] hover:underline"
                      onClick={() => setExcludedGroups(new Set())}
                    >
                      Tout sélectionner
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="font-medium text-slate-500 hover:text-slate-800 hover:underline"
                      onClick={() => setExcludedGroups(new Set(allGroups.map((g) => g.key)))}
                    >
                      Tout désélectionner
                    </button>
                  )}
                  {excludedOrderIds.size > 0 && (
                    <button
                      type="button"
                      className="font-medium text-[#128C7E] hover:underline"
                      onClick={() => setExcludedOrderIds(new Set())}
                    >
                      Restaurer les commandes ({excludedOrderIds.size})
                    </button>
                  )}
                  <span className="text-muted-foreground">
                    Sélectionner / désélectionner n'affecte que ce rapport (aucune modification de statut).
                  </span>
                </div>

                {showOrders && (
                  <ul
                    className="max-h-44 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200"
                    aria-label="Commandes du rapport"
                  >
                    {visibleGroups.flatMap((g) =>
                      g.rows.map((r) => {
                        const included = !excludedOrderIds.has(r.id);
                        const label = r.trackingCode?.trim() || `#${r.id}`;
                        return (
                          <li key={r.id}>
                            <label className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-xs hover:bg-slate-50">
                              <Checkbox
                                checked={included}
                                onCheckedChange={(v) => setOrderIncluded(r.id, v === true)}
                                aria-label={`Inclure ${label}`}
                                className="h-3.5 w-3.5 border-slate-300 data-[state=checked]:border-slate-900 data-[state=checked]:bg-slate-900 [&_svg]:h-3 [&_svg]:w-3"
                              />
                              <span
                                className={cn(
                                  "min-w-0 truncate font-mono text-[12px] text-slate-800",
                                  !included && "text-slate-400 line-through"
                                )}
                              >
                                {label}
                              </span>
                              <span className="truncate text-slate-500">{r.city || "—"}</span>
                              <span className="ml-auto hidden truncate text-slate-400 sm:inline">
                                {g.label}
                              </span>
                            </label>
                          </li>
                        );
                      })
                    )}
                  </ul>
                )}
              </div>

              {missing > 0 && (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {missing} commande(s) sélectionnée(s) ne sont plus éligibles et ne figurent pas
                  dans le rapport.
                </p>
              )}

              {editsOutdated && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  <span>
                    Les groupes ou commandes ont changé — ton texte modifié n'a pas été remplacé.
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 bg-white px-2 text-xs"
                    onClick={resetText}
                  >
                    Régénérer le texte
                  </Button>
                </div>
              )}

              {/* Editor */}
              <div className="flex min-h-0 flex-1 flex-col gap-1.5">
                <Textarea
                  aria-label="Rapport WhatsApp"
                  value={text}
                  onChange={(e) => handleTextChange(e.target.value)}
                  spellCheck={false}
                  placeholder="Le rapport est vide — restaure des groupes ou écris ton message."
                  className="min-h-[300px] flex-1 resize-y rounded-lg border-slate-200 bg-slate-50/60 px-3.5 py-3 font-sans text-[13.5px] leading-relaxed text-slate-800 focus-visible:bg-white focus-visible:ring-[#25D366]/40"
                />
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{isEdited ? "Texte modifié manuellement" : "Texte généré automatiquement"}</span>
                  <span className="tabular-nums">
                    {text.length} caractère{text.length === 1 ? "" : "s"} · {lineCount} ligne
                    {lineCount === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="flex-row flex-wrap items-center gap-2 border-t bg-muted/30 px-5 py-3 sm:justify-between sm:space-x-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mr-auto gap-1.5 text-xs text-slate-600 [&_svg]:size-3.5"
            disabled={!isEdited}
            onClick={resetText}
          >
            <RotateCcw />
            Réinitialiser
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Fermer
            </Button>
            <Button
              type="button"
              size="sm"
              className="min-w-[170px] gap-1.5 bg-[#25D366] text-white hover:bg-[#1ebe57]"
              disabled={!text.trim() || (isFetching && !data)}
              onClick={handleCopy}
            >
              {justCopied ? <Check /> : <Copy />}
              {justCopied ? "Copié" : "Copier pour WhatsApp"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
