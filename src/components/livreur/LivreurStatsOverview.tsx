import { ChevronLeft, ChevronRight, CheckCircle2, Clock, Package, RotateCcw, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LivreurStats } from "@/hooks/useApi";

const MONTH_LABELS = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month) return monthKey;
  return `${MONTH_LABELS[month - 1] ?? month} ${year}`;
}

function shiftMonth(monthKey: string, delta: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

interface LivreurStatsOverviewProps {
  month: string;
  onMonthChange: (month: string) => void;
  stats?: LivreurStats;
  isLoading?: boolean;
  onFilterStatus?: (status: string) => void;
}

export const LivreurStatsOverview = ({
  month,
  onMonthChange,
  stats,
  isLoading,
  onFilterStatus,
}: LivreurStatsOverviewProps) => {
  const cards = [
    {
      key: "allPending",
      label: "À livrer",
      sub: "toutes périodes",
      value: stats?.allPending ?? 0,
      icon: Clock,
      color: "text-amber-700 bg-amber-50 border-amber-200",
      filter: "PENDING",
    },
    {
      key: "pendingMonth",
      label: "En attente",
      sub: "ce mois",
      value: stats?.pendingMonth ?? 0,
      icon: Package,
      color: "text-yellow-700 bg-yellow-50 border-yellow-200",
      filter: "PENDING",
    },
    {
      key: "deliveredMonth",
      label: "Livrées",
      sub: "ce mois",
      value: stats?.deliveredMonth ?? 0,
      icon: CheckCircle2,
      color: "text-green-700 bg-green-50 border-green-200",
      filter: "DELIVERED",
    },
    {
      key: "returnedMonth",
      label: "Retournées",
      sub: "ce mois",
      value: stats?.returnedMonth ?? 0,
      icon: RotateCcw,
      color: "text-red-700 bg-red-50 border-red-200",
      filter: "RETURNED",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-2 py-1.5 shadow-sm">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => onMonthChange(shiftMonth(month, -1))}
          aria-label="Mois précédent"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 text-center">
          <p className="text-sm font-semibold text-slate-900">{formatMonthLabel(month)}</p>
          {isLoading ? (
            <p className="text-xs text-muted-foreground">Chargement...</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {stats?.totalMonth ?? 0} commande{(stats?.totalMonth ?? 0) !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => onMonthChange(shiftMonth(month, 1))}
          aria-label="Mois suivant"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => onFilterStatus?.(card.filter)}
              className={`rounded-xl border p-3 text-left transition-transform active:scale-[0.98] ${card.color}`}
            >
              <div className="flex items-start justify-between gap-1">
                <Icon className="h-4 w-4 shrink-0 opacity-80" />
                <span className="text-2xl font-bold tabular-nums leading-none">
                  {isLoading ? "—" : card.value}
                </span>
              </div>
              <p className="mt-2 text-xs font-semibold">{card.label}</p>
              <p className="text-[10px] opacity-70">{card.sub}</p>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" />
            Taux livraison
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums text-matles-700">
            {isLoading ? "—" : `${stats?.deliveryRate ?? 0}%`}
          </p>
          <p className="text-[10px] text-muted-foreground">ce mois</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="text-xs text-muted-foreground">Aujourd&apos;hui</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
            {isLoading ? "—" : stats?.todayDelivered ?? 0}
            <span className="text-base font-medium text-muted-foreground">
              /{stats?.todayTotal ?? 0}
            </span>
          </p>
          <p className="text-[10px] text-muted-foreground">livrées / total</p>
        </div>
      </div>
    </div>
  );
};
