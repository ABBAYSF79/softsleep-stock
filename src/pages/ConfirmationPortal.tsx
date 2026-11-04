import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { Check, ChevronLeft, ChevronRight, Copy, KeyRound, LogOut, Package } from "lucide-react";
import publicApi from "@/lib/publicApi";
import { copyText } from "@/utils/clipboard";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ORDER_STATUSES, formatPrice, formatReportDate } from "@/utils/order-utils";

const STORAGE_KEY = "confirmationPortalCode";

type OrderStatusKey = keyof typeof ORDER_STATUSES;

interface PortalOrder {
  id: number;
  createdAt: string;
  status: OrderStatusKey;
  customerName: string;
  phone: string | null;
  city: string | null;
  totalAmount: string;
  reportedUntil: string | null;
  deliveredAt: string | null;
  items: { name: string; quantity: number }[];
}

interface PortalResponse {
  confirmationUser: { name: string };
  stats: { countByStatus: Record<OrderStatusKey, number> };
  page: number;
  pageSize: number;
  total: number;
  orders: PortalOrder[];
}

class InvalidCodeError extends Error {}

type Period = "this_month" | "last_month" | "last_3_months" | "custom";

const PERIOD_LABELS: Record<Period, string> = {
  this_month: "Ce mois",
  last_month: "Mois dernier",
  last_3_months: "3 derniers mois",
  custom: "Personnalisé",
};

const monthStart = (offset: number) => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + offset, 1);
};

const monthEnd = (offset: number) => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + offset + 1, 0, 23, 59, 59, 999);
};

/** Calendar-month ranges; "last 3 months" = current month + the 2 before. */
const getPeriodRange = (
  period: Period,
  customFrom: string,
  customTo: string
): { from?: string; to?: string } => {
  switch (period) {
    case "this_month":
      return { from: monthStart(0).toISOString(), to: monthEnd(0).toISOString() };
    case "last_month":
      return { from: monthStart(-1).toISOString(), to: monthEnd(-1).toISOString() };
    case "last_3_months":
      return { from: monthStart(-2).toISOString(), to: monthEnd(0).toISOString() };
    case "custom":
      return {
        from: customFrom ? new Date(`${customFrom}T00:00:00`).toISOString() : undefined,
        to: customTo ? new Date(`${customTo}T23:59:59.999`).toISOString() : undefined,
      };
  }
};

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString("fr-FR") : "—";

const StatusBadge = ({ status }: { status: OrderStatusKey }) => {
  const meta = ORDER_STATUSES[status];
  return <Badge className={meta?.color ?? ""}>{meta?.label ?? status}</Badge>;
};

const itemsLabel = (order: PortalOrder) =>
  order.items.length
    ? order.items.map((it) => (it.quantity > 1 ? `${it.quantity}x ${it.name}` : it.name)).join(" · ")
    : "—";

const buildOrderText = (order: PortalOrder) => {
  const lines = [
    `Commande #${order.id} (${formatDate(order.createdAt)})`,
    `Client: ${order.customerName}`,
    `Tél: ${order.phone || "—"}`,
    `Ville: ${order.city || "—"}`,
    `Produits: ${itemsLabel(order)}`,
    `Montant: ${formatPrice(order.totalAmount)} MAD`,
    `Statut: ${ORDER_STATUSES[order.status]?.label ?? order.status}`,
  ];
  if (order.status === "REPORTED") {
    lines.push(`Reporté au: ${formatReportDate(order.reportedUntil)}`);
  }
  return lines.join("\n");
};

const CopyOrderButton = ({ order }: { order: PortalOrder }) => {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (await copyText(buildOrderText(order))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
      toast({ title: "Copie impossible", variant: "destructive" });
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      onClick={handleCopy}
      aria-label={`Copier la commande #${order.id}`}
      title="Copier les infos de la commande"
    >
      {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
};

const CodeForm = ({
  onSubmit,
  error,
  loading,
}: {
  onSubmit: (code: string) => void;
  error: string | null;
  loading: boolean;
}) => {
  const [value, setValue] = useState("");

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <KeyRound className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Mes commandes</CardTitle>
          <p className="text-sm text-muted-foreground">
            Entrez votre code d'accès pour voir vos commandes.
          </p>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (value.trim()) onSubmit(value.trim().toUpperCase());
            }}
          >
            <Input
              autoFocus
              autoComplete="off"
              placeholder="XXXXXXXX"
              value={value}
              onChange={(e) => setValue(e.target.value.toUpperCase())}
              className="text-center font-mono text-lg tracking-[0.3em]"
              maxLength={12}
            />
            {error && <p className="text-sm text-destructive text-center">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading || !value.trim()}>
              {loading ? "Vérification..." : "Accéder"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

const ConfirmationPortal = () => {
  const [code, setCode] = useState<string | null>(() => sessionStorage.getItem(STORAGE_KEY));
  const [loginError, setLoginError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("ALL");
  const [period, setPeriod] = useState<Period>("this_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [page, setPage] = useState(1);

  const { from, to } = getPeriodRange(period, customFrom, customTo);

  const { data, isFetching, error } = useQuery<PortalResponse>({
    queryKey: ["confirmationPortal", code, status, from, to, page],
    enabled: Boolean(code),
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === code ? keepPreviousData(previous) : undefined,
    retry: false,
    queryFn: async () => {
      try {
        const response = await publicApi.post<PortalResponse>("/public/confirmation/orders", {
          code,
          status: status === "ALL" ? undefined : status,
          from,
          to,
          page,
        });
        return response.data;
      } catch (err) {
        if (isAxiosError(err) && err.response?.status === 403) {
          throw new InvalidCodeError(err.response.data?.error || "Code invalide");
        }
        if (isAxiosError(err) && err.response?.status === 429) {
          throw new Error(err.response.data?.error || "Trop de tentatives");
        }
        throw err;
      }
    },
  });

  useEffect(() => {
    if (error instanceof InvalidCodeError) {
      sessionStorage.removeItem(STORAGE_KEY);
      setCode(null);
      setLoginError(error.message);
    } else if (error && !data) {
      setLoginError(error.message || "Erreur de connexion");
      sessionStorage.removeItem(STORAGE_KEY);
      setCode(null);
    }
  }, [error, data]);

  useEffect(() => {
    if (data && code) sessionStorage.setItem(STORAGE_KEY, code);
  }, [data, code]);

  const handleLogin = (value: string) => {
    setLoginError(null);
    setPage(1);
    setCode(value);
  };

  const handleLogout = () => {
    sessionStorage.removeItem(STORAGE_KEY);
    setCode(null);
    setStatus("ALL");
    setPeriod("this_month");
    setCustomFrom("");
    setCustomTo("");
    setPage(1);
  };

  if (!code || !data) {
    return <CodeForm onSubmit={handleLogin} error={loginError} loading={Boolean(code) && isFetching} />;
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const totalAll = Object.values(data.stats.countByStatus).reduce((a, b) => a + b, 0);

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div>
            <p className="text-xs text-muted-foreground">Mes commandes</p>
            <h1 className="text-lg font-semibold">{data.confirmationUser.name}</h1>
          </div>
          <Button variant="outline" size="sm" className="gap-2" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            Déconnexion
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <button
            type="button"
            onClick={() => {
              setStatus("ALL");
              setPage(1);
            }}
            className={`rounded-lg border bg-background p-3 text-left transition-colors ${
              status === "ALL" ? "border-primary" : ""
            }`}
          >
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-2xl font-semibold">{totalAll}</p>
          </button>
          {(Object.keys(ORDER_STATUSES) as OrderStatusKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setStatus(key);
                setPage(1);
              }}
              className={`rounded-lg border bg-background p-3 text-left transition-colors ${
                status === key ? "border-primary" : ""
              }`}
            >
              <p className="text-xs text-muted-foreground">{ORDER_STATUSES[key].label}</p>
              <p className="text-2xl font-semibold">{data.stats.countByStatus[key] ?? 0}</p>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 rounded-lg border bg-background p-3 sm:flex-row sm:items-end">
          <div className="space-y-1 sm:w-48">
            <label className="text-xs text-muted-foreground">Statut</label>
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous</SelectItem>
                {(Object.keys(ORDER_STATUSES) as OrderStatusKey[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {ORDER_STATUSES[key].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 sm:w-48">
            <label className="text-xs text-muted-foreground">Période</label>
            <Select
              value={period}
              onValueChange={(value) => {
                setPeriod(value as Period);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PERIOD_LABELS) as Period[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {PERIOD_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {period === "custom" && (
            <>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Du</label>
                <Input
                  type="date"
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={(e) => {
                    setCustomFrom(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Au</label>
                <Input
                  type="date"
                  value={customTo}
                  min={customFrom || undefined}
                  onChange={(e) => {
                    setCustomTo(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
            </>
          )}
          {(period !== "this_month" || status !== "ALL") && (
            <Button
              variant="ghost"
              onClick={() => {
                setPeriod("this_month");
                setCustomFrom("");
                setCustomTo("");
                setStatus("ALL");
                setPage(1);
              }}
            >
              Réinitialiser
            </Button>
          )}
        </div>

        {data.orders.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border bg-background py-12 text-muted-foreground">
            <Package className="h-8 w-8" />
            <p>Aucune commande trouvée.</p>
          </div>
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {data.orders.map((order) => (
                <div key={order.id} className="rounded-lg border bg-background p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm text-muted-foreground">#{order.id}</span>
                    <div className="flex items-center gap-1">
                      <StatusBadge status={order.status} />
                      <CopyOrderButton order={order} />
                    </div>
                  </div>
                  <div>
                    <p className="font-medium">{order.customerName}</p>
                    <p className="text-sm text-muted-foreground">
                      {[order.phone, order.city].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  <p className="text-sm">{itemsLabel(order)}</p>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{formatDate(order.createdAt)}</span>
                    <span className="font-semibold">{formatPrice(order.totalAmount)} MAD</span>
                  </div>
                  {order.status === "REPORTED" && (
                    <p className="text-xs text-orange-700">
                      Reporté au {formatReportDate(order.reportedUntil)}
                    </p>
                  )}
                </div>
              ))}
            </div>

            <div className="hidden rounded-lg border bg-background md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Ville</TableHead>
                    <TableHead>Produits</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-mono text-muted-foreground">{order.id}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(order.createdAt)}</TableCell>
                      <TableCell>
                        <p className="font-medium">{order.customerName}</p>
                        <p className="text-xs text-muted-foreground">{order.phone || "—"}</p>
                      </TableCell>
                      <TableCell>{order.city || "—"}</TableCell>
                      <TableCell className="max-w-xs text-sm">{itemsLabel(order)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {formatPrice(order.totalAmount)} MAD
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={order.status} />
                        {order.status === "REPORTED" && (
                          <p className="mt-1 text-xs text-orange-700">
                            {formatReportDate(order.reportedUntil)}
                          </p>
                        )}
                        {order.status === "DELIVERED" && order.deliveredAt && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatDate(order.deliveredAt)}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <CopyOrderButton order={order} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {data.total} commande{data.total > 1 ? "s" : ""}
            {isFetching ? " · chargement..." : ""}
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                disabled={page <= 1 || isFetching}
                onClick={() => setPage((p) => p - 1)}
                aria-label="Page précédente"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span>
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                disabled={page >= totalPages || isFetching}
                onClick={() => setPage((p) => p + 1)}
                aria-label="Page suivante"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default ConfirmationPortal;
