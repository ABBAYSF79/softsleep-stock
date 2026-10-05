import { useEffect, useMemo, useState } from "react";
import { endOfDay, startOfDay } from "date-fns";
import { DateRange } from "react-day-picker";
import { Download, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useProducts } from "@/hooks/useApi";
import {
  CONTACT_COLUMNS,
  EXPORT_COLUMNS,
  MATTRESS_ORDER_STATUSES,
  RETARGETING_COLUMNS,
  buildClientExportFilename,
  buildClientExportRows,
  downloadClientExport,
  fetchMattressOrdersForExport,
  type ClientExportTable,
  type ExportColumnId,
  type ExportMode,
  type MattressOrderStatus,
} from "@/features/export/clientExport";

const PREFS_KEY = "client-export-prefs";

type PaymentFilter = "all" | "true" | "false";

type Prefs = {
  columns: ExportColumnId[];
  mode: ExportMode;
  uniquePhone: boolean;
};

function loadPrefs(): Prefs {
  const fallback: Prefs = {
    columns: RETARGETING_COLUMNS,
    mode: "order",
    uniquePhone: false,
  };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    const known = new Set(EXPORT_COLUMNS.map((column) => column.id));
    const columns = (parsed.columns ?? []).filter((id): id is ExportColumnId => known.has(id as ExportColumnId));
    return {
      columns: columns.length ? columns : fallback.columns,
      mode: parsed.mode === "line" ? "line" : "order",
      uniquePhone: Boolean(parsed.uniquePhone),
    };
  } catch {
    return fallback;
  }
}

export default function ClientExport() {
  const initial = useMemo(() => loadPrefs(), []);
  const { data: products = [] } = useProducts();
  const [statuses, setStatuses] = useState<MattressOrderStatus[]>(
    MATTRESS_ORDER_STATUSES.map((status) => status.value)
  );
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [productIds, setProductIds] = useState<number[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [city, setCity] = useState("");
  const [search, setSearch] = useState("");
  const [payment, setPayment] = useState<PaymentFilter>("all");
  const [columns, setColumns] = useState<ExportColumnId[]>(initial.columns);
  const [mode, setMode] = useState<ExportMode>(initial.mode);
  const [uniquePhone, setUniquePhone] = useState(initial.uniquePhone);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [preview, setPreview] = useState<ClientExportTable | null>(null);

  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ columns, mode, uniquePhone }));
  }, [columns, mode, uniquePhone]);

  const productList = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    return [...products]
      .filter((product: { name?: string }) => !query || product.name?.toLowerCase().includes(query))
      .sort((a: { name?: string }, b: { name?: string }) => (a.name || "").localeCompare(b.name || "", "fr"));
  }, [products, productSearch]);

  function toggleStatus(value: MattressOrderStatus, checked: boolean) {
    setStatuses((current) =>
      checked ? [...current, value] : current.filter((status) => status !== value)
    );
  }

  function toggleProduct(id: number, checked: boolean) {
    setProductIds((current) => (checked ? [...current, id] : current.filter((item) => item !== id)));
  }

  function toggleColumn(id: ExportColumnId, checked: boolean) {
    setColumns((current) => {
      if (!checked) return current.filter((column) => column !== id);
      return EXPORT_COLUMNS.map((column) => column.id).filter(
        (columnId) => current.includes(columnId) || columnId === id
      );
    });
  }

  async function run(download: boolean) {
    if (!statuses.length) {
      toast.error("Choisis au moins un statut");
      return;
    }
    if (!columns.length) {
      toast.error("Choisis au moins une colonne");
      return;
    }

    setLoading(true);
    setProgress("Chargement des commandes…");
    try {
      const from = dateRange?.from ? startOfDay(dateRange.from) : undefined;
      const to = dateRange?.from ? endOfDay(dateRange.to ?? dateRange.from) : undefined;
      const result = await fetchMattressOrdersForExport(
        {
          statuses,
          productIds,
          startDate: from?.toISOString(),
          endDate: to?.toISOString(),
          city,
          search,
          isPaid: payment === "all" ? undefined : payment,
        },
        (loaded, total) => setProgress(`${loaded} / ${total} commandes`)
      );

      const table = buildClientExportRows(result.orders, {
        mode,
        columns,
        productIds,
        uniquePhone,
      });
      setPreview(table);

      if (result.truncated) {
        toast.warning(`Export limité à ${result.orders.length} sur ${result.total} commandes. Affine les filtres.`);
      }
      if (!table.rows.length) {
        toast.error("Aucune commande pour ces filtres");
        return;
      }
      if (download) {
        const filename = buildClientExportFilename({
          mode,
          statuses,
          from: dateRange?.from,
          to: dateRange?.to,
        });
        await downloadClientExport(table, filename);
        toast.success(`${table.rows.length} lignes exportées`);
      }
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error ||
        (error as { message?: string })?.message ||
        "Impossible de charger les commandes";
      toast.error(message);
    } finally {
      setLoading(false);
      setProgress("");
    }
  }

  const previewRows = preview?.rows.slice(0, 12) ?? [];

  return (
    <MainLayout>
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Export clients</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Commandes matelas uniquement. Tu choisis les colonnes et les filtres, puis tu télécharges un Excel prêt pour le retargeting ou un autre usage.
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={loading} onClick={() => run(false)}>
              Aperçu
            </Button>
            <Button type="button" disabled={loading} onClick={() => run(true)}>
              <Download className="mr-2 h-4 w-4" />
              Exporter Excel
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Filtres</CardTitle>
              <CardDescription>Rien de coché dans les produits veut dire tous les produits.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Statut</Label>
                <div className="grid grid-cols-2 gap-2">
                  {MATTRESS_ORDER_STATUSES.map((status) => (
                    <label key={status.value} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={statuses.includes(status.value)}
                        onCheckedChange={(checked) => toggleStatus(status.value, checked === true)}
                      />
                      {status.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Période</Label>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setDateRange(undefined)}>
                    Toute la période
                  </Button>
                </div>
                <DateRangePicker value={dateRange} onChange={setDateRange} />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="export-city">Ville (nom exact)</Label>
                  <Input
                    id="export-city"
                    value={city}
                    placeholder="Casablanca"
                    onChange={(event) => setCity(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="export-search">Client ou téléphone</Label>
                  <Input
                    id="export-search"
                    value={search}
                    placeholder="Nom ou 06…"
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Paiement</Label>
                <Select value={payment} onValueChange={(value) => setPayment(value as PaymentFilter)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous</SelectItem>
                    <SelectItem value="true">Payé</SelectItem>
                    <SelectItem value="false">Non payé</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Produits</Label>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setProductIds([])}>
                    Tous
                  </Button>
                </div>
                <Input
                  value={productSearch}
                  placeholder="Chercher un produit"
                  onChange={(event) => setProductSearch(event.target.value)}
                />
                <div className="max-h-52 space-y-2 overflow-y-auto rounded-md border p-3">
                  {productList.map((product: { id: number; name: string; archived?: boolean }) => (
                    <label key={product.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={productIds.includes(product.id)}
                        onCheckedChange={(checked) => toggleProduct(product.id, checked === true)}
                      />
                      <span>
                        {product.name}
                        {product.archived ? " (archivé)" : ""}
                      </span>
                    </label>
                  ))}
                  {!productList.length && (
                    <p className="text-sm text-muted-foreground">Aucun produit</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Colonnes et format</CardTitle>
              <CardDescription>Le fichier ne contient que les colonnes cochées, sans ligne de titre.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setColumns(RETARGETING_COLUMNS)}>
                  Retargeting
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setColumns(CONTACT_COLUMNS)}>
                  Contact
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setColumns(EXPORT_COLUMNS.map((column) => column.id))}
                >
                  Tout
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {EXPORT_COLUMNS.map((column) => (
                  <label key={column.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={columns.includes(column.id)}
                      onCheckedChange={(checked) => toggleColumn(column.id, checked === true)}
                    />
                    {column.label}
                  </label>
                ))}
              </div>

              <div className="space-y-2">
                <Label>Lignes</Label>
                <Select value={mode} onValueChange={(value) => setMode(value as ExportMode)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="order">Une ligne par commande</SelectItem>
                    <SelectItem value="line">Une ligne par produit</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  className="mt-0.5"
                  checked={uniquePhone}
                  onCheckedChange={(checked) => setUniquePhone(checked === true)}
                />
                <span>
                  Un numéro = une ligne, la commande la plus récente.
                  <span className="mt-1 block text-muted-foreground">
                    06 et +212 du même numéro sont fusionnés. Les commandes sans téléphone restent.
                  </span>
                </span>
              </label>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Aperçu
            </CardTitle>
            <CardDescription>
              {loading
                ? progress || "Chargement…"
                : preview
                  ? `${preview.orderCount} commandes · ${preview.rows.length} lignes`
                  : "Lance un aperçu pour vérifier le fichier avant de l’exporter."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {preview && preview.rows.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {preview.headers.map((header) => (
                        <TableHead key={header}>{header}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((row, index) => (
                      <TableRow key={index}>
                        {row.map((cell, cellIndex) => (
                          <TableCell key={cellIndex} className="whitespace-nowrap">
                            {String(cell)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {preview.rows.length > previewRows.length && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    {previewRows.length} premières lignes affichées. Le fichier Excel contient les {preview.rows.length} lignes.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Pas encore de données chargées.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
