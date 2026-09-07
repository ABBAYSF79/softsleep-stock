import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { InventoryLayout } from '@/features/inventory/components/InventoryLayout';
import { InventoryEmptyState } from '@/features/inventory/components/InventoryEmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import api from '@/lib/api';
import { RefreshCw } from 'lucide-react';

type Tab = 'saisie' | 'readiness' | 'legacy' | 'count' | 'recon' | 'execution';

type OpeningRow = {
  pillowId: number;
  name: string;
  legacyStock: number;
  warehousePhysical: number;
  showroomPhysical: number;
  showroomPresentation: number;
};

export default function InventoryCutoverPage() {
  const [tab, setTab] = useState<Tab>('saisie');
  const [rows, setRows] = useState<OpeningRow[]>([]);
  const [cutoverDate, setCutoverDate] = useState('');
  const [confirmBackup, setConfirmBackup] = useState(false);
  const [confirmExecute, setConfirmExecute] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const qc = useQueryClient();

  const form = useQuery({
    queryKey: ['inventory', 'cutover', 'opening-manual'],
    queryFn: async () => {
      const { data } = await api.get('/inventory/cutover/opening-manual', { timeout: 20000 });
      return data;
    },
  });

  useEffect(() => {
    if (!form.data) return;
    setCutoverDate(form.data.cutoverDate || new Date().toISOString().slice(0, 10));
    setRows(
      (form.data.pillows || []).map((p: OpeningRow) => ({
        pillowId: p.pillowId,
        name: p.name,
        legacyStock: p.legacyStock,
        warehousePhysical: Number(p.warehousePhysical) || 0,
        showroomPhysical: Number(p.showroomPhysical) || 0,
        showroomPresentation: Number(p.showroomPresentation) || 0,
      }))
    );
    setPreview(null);
    setConfirmBackup(false);
    setConfirmExecute(false);
  }, [form.data]);

  const readiness = useQuery({
    queryKey: ['inventory', 'cutover', 'readiness'],
    queryFn: async () => {
      const { data } = await api.get('/inventory/cutover/readiness', { timeout: 30000 });
      return data;
    },
    enabled: tab === 'readiness',
  });

  const legacy = useQuery({
    queryKey: ['inventory', 'cutover', 'legacy-orders'],
    queryFn: async () => {
      const { data } = await api.get('/inventory/cutover/legacy-orders', { timeout: 30000 });
      return data;
    },
    enabled: tab === 'legacy',
  });

  const countSheet = useQuery({
    queryKey: ['inventory', 'cutover', 'count-sheet'],
    queryFn: async () => {
      const { data } = await api.get('/inventory/cutover/physical-count-sheet', { timeout: 15000 });
      return data;
    },
    enabled: tab === 'count',
  });

  const recon = useQuery({
    queryKey: ['inventory', 'cutover', 'recon-preview'],
    queryFn: async () => {
      const { data } = await api.get('/inventory/cutover/reconciliation-preview', { timeout: 15000 });
      return data;
    },
    enabled: tab === 'recon',
  });

  const execution = useQuery({
    queryKey: ['inventory', 'cutover', 'execution'],
    queryFn: async () => {
      const { data } = await api.get('/inventory/cutover/execution', { timeout: 15000 });
      return data;
    },
    enabled: tab === 'execution',
  });

  const transition = useMutation({
    mutationFn: async (args: { source: string; id: number; action: string }) => {
      const { data } = await api.post(
        `/inventory/cutover/legacy-orders/${args.source}/${args.id}/transition`,
        { action: args.action, confirm: true },
        { timeout: 20000 }
      );
      return data;
    },
    onSuccess: () => {
      toast.success('Transition recorded');
      void qc.invalidateQueries({ queryKey: ['inventory', 'cutover'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Transition failed');
    },
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(
        '/inventory/cutover/opening-manual/preview',
        {
          cutoverDate,
          notes: 'Manual opening inventory entry (UI)',
          entries: rows.map((r) => ({
            pillowId: r.pillowId,
            warehousePhysical: r.warehousePhysical,
            showroomPhysical: r.showroomPhysical,
            showroomPresentation: r.showroomPresentation,
          })),
        },
        { timeout: 30000 }
      );
      return data;
    },
    onSuccess: (data) => {
      setPreview(data);
      if (data.canExecute) toast.success('Preview OK — ready to apply');
      else if (data.alreadyCutover) toast.message('Already cut over');
      else toast.error('Preview has errors — check rows');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Preview failed');
    },
  });

  const executeMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(
        '/inventory/cutover/opening-manual/execute',
        {
          cutoverDate,
          notes: 'Manual opening inventory entry (UI)',
          confirmBackup: true,
          confirmExecute: true,
          entries: rows.map((r) => ({
            pillowId: r.pillowId,
            warehousePhysical: r.warehousePhysical,
            showroomPhysical: r.showroomPhysical,
            showroomPresentation: r.showroomPresentation,
          })),
        },
        { timeout: 60000 }
      );
      return data;
    },
    onSuccess: (data) => {
      if (data.status === 'EXECUTED') {
        toast.success('Opening stock applied — Inventory mode active');
      } else if (data.status === 'ALREADY_CUTOVER') {
        toast.message('Already cut over');
      } else {
        toast.success(`Done: ${data.status}`);
      }
      setPreview(null);
      setConfirmBackup(false);
      setConfirmExecute(false);
      void qc.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Execute failed');
    },
  });

  const updateRow = (pillowId: number, patch: Partial<OpeningRow>) => {
    setRows((prev) => prev.map((r) => (r.pillowId === pillowId ? { ...r, ...patch } : r)));
    setPreview(null);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'saisie', label: 'Saisie stock' },
    { id: 'readiness', label: 'Readiness' },
    { id: 'legacy', label: 'Legacy Orders' },
    { id: 'count', label: 'Physical Count' },
    { id: 'recon', label: 'Reconciliation' },
    { id: 'execution', label: 'Execution' },
  ];

  const canApply =
    confirmBackup &&
    confirmExecute &&
    preview?.canExecute === true &&
    !form.data?.alreadyCutover &&
    !executeMutation.isPending;

  return (
    <InventoryLayout
      title="Cutover / Opening stock"
      description="Saisir le stock accessoires par emplacement (entrepôt / showroom). Pas de fichier ni de commande."
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => void qc.invalidateQueries({ queryKey: ['inventory', 'cutover'] })}
        >
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Refresh
        </Button>
      }
    >
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              tab === t.id ? 'bg-matles-700 text-white' : 'bg-gray-100 text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'saisie' && (
        <section className="space-y-4 pt-4">
          {form.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : form.error ? (
            <InventoryEmptyState title="Form failed" description="Could not load accessories." />
          ) : form.data?.alreadyCutover ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
              <p className="font-medium">Opening déjà appliqué (mode INVENTORY)</p>
              <p className="mt-1 text-muted-foreground">
                Pour ajouter du stock après cutover, utilisez Stock → Add Stock (supply).
              </p>
            </div>
          ) : !form.data?.locationsReady ? (
            <InventoryEmptyState
              title="Locations manquantes"
              description="WH-MAIN et SR-MAIN doivent exister (seed locations) avant la saisie."
            />
          ) : (
            <>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
                <p className="font-medium">Saisie initiale (une seule fois)</p>
                <p className="mt-1 text-muted-foreground">
                  Entrez les quantités physiques réelles. L’ancien stock ({' '}
                  <span className="whitespace-nowrap">legacy</span>) est informatif seulement. Mode
                  actuel: {form.data.inventoryMode}.
                </p>
              </div>

              <div className="max-w-xs space-y-1.5">
                <Label htmlFor="cutover-date">Date cutover</Label>
                <Input
                  id="cutover-date"
                  type="date"
                  value={cutoverDate}
                  onChange={(e) => {
                    setCutoverDate(e.target.value);
                    setPreview(null);
                  }}
                />
              </div>

              <div className="overflow-x-auto rounded-lg border">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Accessoire</th>
                      <th className="px-3 py-2">Legacy</th>
                      <th className="px-3 py-2">Entrepôt (WH)</th>
                      <th className="px-3 py-2">Showroom phys.</th>
                      <th className="px-3 py-2">Présentation SR</th>
                      <th className="px-3 py-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const total = r.warehousePhysical + r.showroomPhysical;
                      return (
                        <tr key={r.pillowId} className="border-t">
                          <td className="px-3 py-2 font-medium">
                            {r.name}
                            <span className="ml-1 text-xs text-muted-foreground">#{r.pillowId}</span>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{r.legacyStock}</td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              min={0}
                              step={1}
                              className="h-8 w-24"
                              value={r.warehousePhysical}
                              onChange={(e) =>
                                updateRow(r.pillowId, {
                                  warehousePhysical: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                                })
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              min={0}
                              step={1}
                              className="h-8 w-24"
                              value={r.showroomPhysical}
                              onChange={(e) =>
                                updateRow(r.pillowId, {
                                  showroomPhysical: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                                })
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              min={0}
                              step={1}
                              className="h-8 w-24"
                              value={r.showroomPresentation}
                              onChange={(e) =>
                                updateRow(r.pillowId, {
                                  showroomPresentation: Math.max(
                                    0,
                                    Math.floor(Number(e.target.value) || 0)
                                  ),
                                })
                              }
                            />
                          </td>
                          <td className="px-3 py-2 font-medium">{total}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {rows.length === 0 ? (
                <InventoryEmptyState
                  title="Aucun accessoire"
                  description="Créez d’abord les pillows (accessoires) dans le catalogue."
                />
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={previewMutation.isPending || rows.length === 0}
                  onClick={() => previewMutation.mutate()}
                >
                  {previewMutation.isPending ? 'Preview…' : 'Vérifier (preview)'}
                </Button>
              </div>

              {preview ? (
                <div
                  className={`rounded-lg border px-4 py-3 text-sm ${
                    preview.canExecute
                      ? 'border-emerald-200 bg-emerald-50'
                      : preview.alreadyCutover
                        ? 'border-gray-200 bg-gray-50'
                        : 'border-red-200 bg-red-50'
                  }`}
                >
                  <p className="font-medium">
                    {preview.canExecute
                      ? 'OK — prêt à appliquer'
                      : preview.alreadyCutover
                        ? 'Already cutover'
                        : 'Erreurs de validation'}
                  </p>
                  {(preview.errors || []).length > 0 ? (
                    <ul className="mt-2 list-disc pl-5 text-xs">
                      {preview.errors.map((e: string, i: number) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  ) : null}
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {(preview.rows || []).map((r: any) => (
                      <li key={r.pillowId}>
                        {r.name}: WH {r.warehousePhysical} + SR {r.showroomPhysical} (prés.{' '}
                        {r.showroomPresentation}) = {r.newCompanyPhysical} · diff vs legacy{' '}
                        {r.differenceVsOld} · {r.status}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {preview?.canExecute ? (
                <div className="space-y-3 rounded-lg border border-gray-200 px-4 py-3 text-sm">
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={confirmBackup}
                      onChange={(e) => setConfirmBackup(e.target.checked)}
                    />
                    <span>J’ai une sauvegarde MySQL (backup) avant d’appliquer.</span>
                  </label>
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={confirmExecute}
                      onChange={(e) => setConfirmExecute(e.target.checked)}
                    />
                    <span>
                      Confirmer l’application du stock d’ouverture et le passage en mode INVENTORY.
                    </span>
                  </label>
                  <Button
                    type="button"
                    disabled={!canApply}
                    onClick={() => executeMutation.mutate()}
                  >
                    {executeMutation.isPending ? 'Application…' : 'Appliquer le stock d’ouverture'}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </section>
      )}

      {tab === 'readiness' && (
        <section className="space-y-3 pt-4">
          {readiness.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : readiness.error ? (
            <InventoryEmptyState title="Readiness failed" description="Could not load readiness." />
          ) : (
            <>
              <div
                className={`rounded-lg border px-4 py-3 text-sm ${
                  readiness.data?.ready
                    ? 'border-emerald-200 bg-emerald-50'
                    : 'border-amber-200 bg-amber-50'
                }`}
              >
                <p className="font-medium">
                  {readiness.data?.ready ? 'Ready' : 'Not ready for CLI cutover execute'}
                </p>
                <p className="mt-1 text-muted-foreground">
                  Mode {readiness.data?.inventoryMode} · Status {readiness.data?.cutoverStatus} ·{' '}
                  {readiness.data?.blockers?.length ?? 0} blocker(s). Pour un petit catalogue,
                  utilisez l’onglet Saisie stock.
                </p>
              </div>
              <ul className="space-y-2 text-sm">
                {(readiness.data?.checks || []).map((c: any) => (
                  <li
                    key={c.name}
                    className="flex flex-col gap-0.5 rounded border border-gray-200 px-3 py-2 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <span className="font-medium">{c.name}</span>
                    <span
                      className={
                        c.status === 'PASS'
                          ? 'text-emerald-700'
                          : c.status === 'BLOCKED'
                            ? 'text-red-700'
                            : 'text-amber-700'
                      }
                    >
                      {c.status}: {c.message}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {tab === 'legacy' && (
        <section className="space-y-3 pt-4 text-sm">
          {legacy.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <>
              {(legacy.data?.orders || []).map((row: any) => (
                <div key={`${row.type}-${row.id}`} className="rounded border border-gray-200 px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      {row.type} #{row.id} · {row.classification}
                    </span>
                    <div className="flex flex-wrap gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={transition.isPending}
                        onClick={() =>
                          transition.mutate({
                            source: row.type,
                            id: row.id,
                            action: 'CLOSE_UNDER_LEGACY',
                          })
                        }
                      >
                        Close under LEGACY
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={transition.isPending}
                        onClick={() =>
                          transition.mutate({
                            source: row.type,
                            id: row.id,
                            action: 'FREEZE',
                          })
                        }
                      >
                        Freeze
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={transition.isPending}
                        onClick={() =>
                          transition.mutate({
                            source: row.type,
                            id: row.id,
                            action: 'MIGRATE_TO_INVENTORY',
                          })
                        }
                      >
                        Migrate (safe-check)
                      </Button>
                    </div>
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    locationId={String(row.locationId)} · reservation={String(row.hasReservation)} ·
                    legacy={row.legacyStockEffect} · qty={row.accessoryQuantities}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{row.recommendedAction}</p>
                </div>
              ))}
              {(legacy.data?.summary?.total ?? 0) === 0 ? (
                <InventoryEmptyState
                  title="No open accessory flows"
                  description="No PENDING/IN_PROCESS accessory orders require transition."
                />
              ) : null}
            </>
          )}
        </section>
      )}

      {tab === 'count' && (
        <section className="space-y-3 pt-4 text-sm">
          <p className="text-muted-foreground">
            Feuille de comptage (lecture seule). Pour saisir et appliquer, utilisez{' '}
            <button type="button" className="underline" onClick={() => setTab('saisie')}>
              Saisie stock
            </button>
            .
          </p>
          {countSheet.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Pillow</th>
                    <th className="px-3 py-2">Location</th>
                    <th className="px-3 py-2">Physical</th>
                    <th className="px-3 py-2">Presentation</th>
                    <th className="px-3 py-2">Rules</th>
                  </tr>
                </thead>
                <tbody>
                  {(countSheet.data?.rows || []).map((r: any, idx: number) => (
                    <tr key={idx} className="border-t">
                      <td className="px-3 py-2">
                        {r.pillowId}:{r.pillowName}
                      </td>
                      <td className="px-3 py-2">{r.location}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {r.physicalCount ?? '— fill'}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {r.location === 'WH-MAIN' ? '0' : (r.presentationCount ?? '— fill')}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.rules}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'recon' && (
        <section className="space-y-3 pt-4 text-sm">
          <p className="text-muted-foreground">
            Comparaison informative legacy vs fichier opening (optionnel). La saisie UI n’a pas
            besoin de fichier.
          </p>
          {recon.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (recon.data?.rows || []).length === 0 ? (
            <InventoryEmptyState
              title="No opening file yet"
              description={recon.data?.note || 'Optional CLI file path only.'}
            />
          ) : (
            <ul className="space-y-2">
              {recon.data.rows.map((r: any) => (
                <li key={r.pillowId} className="rounded border px-3 py-2">
                  <span className="font-medium">{r.pillowName}</span> · legacy {r.legacyStock} ·
                  physical {r.companyPhysical} · diff {r.difference} · {r.status}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === 'execution' && (
        <section className="space-y-3 pt-4 text-sm">
          {execution.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950">
              <p className="font-medium">Préférez Saisie stock</p>
              <p className="mt-1">{execution.data?.reason}</p>
              <Button type="button" className="mt-3" size="sm" onClick={() => setTab('saisie')}>
                Ouvrir Saisie stock
              </Button>
            </div>
          )}
        </section>
      )}
    </InventoryLayout>
  );
}
