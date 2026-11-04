import { CalendarClock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { addDaysYmd, formatReportDate, getReportDueState, toYmd } from "@/utils/order-utils";

export type ReportDateValue = { date: string; reason: string };

export const emptyReportDate = (): ReportDateValue => ({ date: "", reason: "" });

const DATE_SHORTCUTS = [
  { label: "Demain", days: 1 },
  { label: "+2 jours", days: 2 },
  { label: "+3 jours", days: 3 },
  { label: "+1 semaine", days: 7 },
];

const REASON_SHORTCUTS = [
  "Client absent",
  "Client a demandé de reporter",
  "Client en voyage",
  "Pas d'argent pour le moment",
];

type ReportDateFieldsProps = {
  value: ReportDateValue;
  onChange: (value: ReportDateValue) => void;
  idPrefix?: string;
  className?: string;
};

/** Date (required) + reason (optional) captured when an order is set to "Reporté". */
export function ReportDateFields({ value, onChange, idPrefix = "report", className }: ReportDateFieldsProps) {
  const today = toYmd(new Date());

  return (
    <div className={cn("space-y-3 rounded-xl border border-orange-200 bg-orange-50/60 p-3", className)}>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-date`} className="flex items-center gap-1.5 text-sm font-semibold text-orange-900">
          <CalendarClock className="h-4 w-4" />
          Date de report <span className="text-red-600">*</span>
        </Label>
        <Input
          id={`${idPrefix}-date`}
          type="date"
          min={today}
          value={value.date}
          onChange={(e) => onChange({ ...value, date: e.target.value })}
          className="h-11 border-orange-200 bg-white text-base"
        />
        <div className="flex flex-wrap gap-1.5">
          {DATE_SHORTCUTS.map((s) => {
            const ymd = addDaysYmd(s.days);
            return (
              <button
                key={s.days}
                type="button"
                onClick={() => onChange({ ...value, date: ymd })}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  value.date === ymd
                    ? "border-orange-500 bg-orange-500 text-white"
                    : "border-orange-200 bg-white text-orange-800 hover:bg-orange-100"
                )}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-reason`} className="text-sm font-semibold text-orange-900">
          Raison / note
        </Label>
        <div className="flex flex-wrap gap-1.5">
          {REASON_SHORTCUTS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onChange({ ...value, reason: r })}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs transition-colors",
                value.reason === r
                  ? "border-orange-500 bg-orange-500 text-white"
                  : "border-orange-200 bg-white text-orange-800 hover:bg-orange-100"
              )}
            >
              {r}
            </button>
          ))}
        </div>
        <Textarea
          id={`${idPrefix}-reason`}
          value={value.reason}
          onChange={(e) => onChange({ ...value, reason: e.target.value })}
          placeholder="Ex: le client rappelle lundi, livrer après 17h..."
          className="min-h-[72px] resize-none border-orange-200 bg-white text-base"
        />
      </div>
    </div>
  );
}

export const isReportDateValid = (value: ReportDateValue): boolean =>
  Boolean(value.date) && value.date >= toYmd(new Date());

const DUE_STYLES = {
  overdue: "border-red-200 bg-red-50 text-red-700",
  today: "border-amber-300 bg-amber-50 text-amber-800",
  upcoming: "border-orange-200 bg-orange-50 text-orange-700",
  missing: "border-slate-200 bg-slate-50 text-slate-500",
} as const;

/** Compact "→ 12/11/2026" chip with due-state colour; renders nothing unless REPORTED. */
export function ReportedUntilChip({
  order,
  showReason = false,
  className,
}: {
  order: { status?: string; reportedUntil?: string | null; reportReason?: string | null };
  showReason?: boolean;
  className?: string;
}) {
  const state = getReportDueState(order);
  if (!state) return null;

  const label =
    state === "missing"
      ? "Sans date"
      : state === "today"
        ? `Aujourd'hui · ${formatReportDate(order.reportedUntil)}`
        : state === "overdue"
          ? `En retard · ${formatReportDate(order.reportedUntil)}`
          : `→ ${formatReportDate(order.reportedUntil)}`;

  return (
    <div className={cn("space-y-0.5", className)}>
      <span
        className={cn(
          "inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
          DUE_STYLES[state]
        )}
        title={order.reportReason || undefined}
      >
        <CalendarClock className="h-3 w-3" />
        {label}
      </span>
      {showReason && order.reportReason && (
        <p className="text-xs leading-snug text-orange-900/80">{order.reportReason}</p>
      )}
    </div>
  );
}
