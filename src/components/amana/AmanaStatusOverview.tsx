import type { AmanaManagementSummary } from "@/hooks/useApi";
import { cn } from "@/lib/utils";

export const AMANA_STATUS_FILTER_UNINITIALIZED = "UNINITIALIZED";

type Props = {
  summary?: AmanaManagementSummary | null;
  selectedStatus: string;
  onSelectStatus: (status: string) => void;
};

function accentClass(color: string): string {
  switch (color) {
    case "blue":
      return "border-l-blue-500";
    case "purple":
      return "border-l-purple-500";
    case "gray":
      return "border-l-slate-400";
    case "orange":
      return "border-l-orange-500";
    case "red":
      return "border-l-red-500";
    case "green":
      return "border-l-green-500";
    default:
      return "border-l-slate-800";
  }
}

type StatCardProps = {
  label: string;
  count: number;
  selected: boolean;
  accent: string;
  onClick: () => void;
  dashed?: boolean;
};

function StatCard({ label, count, selected, accent, onClick, dashed }: StatCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex h-[58px] items-center justify-between gap-2 rounded-md border border-l-[3px] bg-white px-2.5 py-1.5 text-left shadow-sm transition-all",
        accent,
        dashed && "border-dashed",
        "hover:border-slate-300 hover:shadow",
        selected && "border-slate-400 bg-slate-50 ring-2 ring-slate-900/10"
      )}
    >
      <span className="min-w-0 flex-1 text-[11px] font-medium leading-snug text-slate-600 line-clamp-2">
        {label}
      </span>
      <span
        className={cn(
          "shrink-0 text-base font-semibold tabular-nums leading-none",
          count === 0 ? "text-slate-400" : "text-slate-900"
        )}
      >
        {count}
      </span>
    </button>
  );
}

export function AmanaStatusOverview({
  summary,
  selectedStatus,
  onSelectStatus,
}: Props) {
  const byStatus = summary?.byStatus ?? [];
  const totalActive = summary?.totalActive ?? 0;
  const uninitialized = summary?.uninitialized ?? 0;
  const totalSelected = selectedStatus === "all";
  const uninitSelected = selectedStatus === AMANA_STATUS_FILTER_UNINITIALIZED;

  const toggle = (code: string) => {
    if (code === "all") {
      onSelectStatus("all");
      return;
    }
    onSelectStatus(selectedStatus === code ? "all" : code);
  };

  return (
    <section
      className="grid grid-cols-2 gap-1.5 md:grid-cols-4 xl:grid-cols-6"
      aria-label="Filtres et statistiques Amana"
    >
      <StatCard
        label="Tous les colis"
        count={totalActive}
        selected={totalSelected}
        accent="border-l-slate-800"
        onClick={() => toggle("all")}
      />

      {byStatus.map((s) => (
        <StatCard
          key={s.code}
          label={s.label}
          count={s.count}
          selected={selectedStatus === s.code}
          accent={accentClass(s.color)}
          onClick={() => toggle(s.code)}
        />
      ))}

      <StatCard
        label="Non initialisé"
        count={uninitialized}
        selected={uninitSelected}
        accent="border-l-amber-500"
        dashed
        onClick={() => toggle(AMANA_STATUS_FILTER_UNINITIALIZED)}
      />
    </section>
  );
}
