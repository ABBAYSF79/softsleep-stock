import type { AmanaParcelAlert, AmanaParcelAlertSeverity } from "@/hooks/useApi";

export const AMANA_ALERT_SEVERITIES: readonly AmanaParcelAlertSeverity[] = [
  "CRITICAL",
  "WARNING",
  "INFO",
];

export const AMANA_ALERT_SEVERITY_META: Record<
  AmanaParcelAlertSeverity,
  {
    label: string;
    pluralLabel: string;
    threshold: string;
    accent: string;
    dot: string;
    text: string;
    badge: string;
  }
> = {
  CRITICAL: {
    label: "Critique",
    pluralLabel: "Critiques",
    threshold: "72h+",
    accent: "border-l-red-500",
    dot: "bg-red-500",
    text: "text-red-700",
    badge: "border-red-200 bg-red-50 text-red-700 hover:bg-red-50",
  },
  WARNING: {
    label: "Attention",
    pluralLabel: "Attention",
    threshold: "48h+",
    accent: "border-l-amber-500",
    dot: "bg-amber-500",
    text: "text-amber-700",
    badge: "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50",
  },
  INFO: {
    label: "Info",
    pluralLabel: "Info",
    threshold: "24h+",
    accent: "border-l-sky-500",
    dot: "bg-sky-500",
    text: "text-sky-700",
    badge: "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-50",
  },
};

const HOUR_MS = 60 * 60 * 1000;

/** "3 j 8 h" — whole hours, floored. */
export function formatAlertElapsed(elapsedMs: number): string {
  const totalHours = Math.max(0, Math.floor(elapsedMs / HOUR_MS));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days === 0) return `${hours} h`;
  return hours ? `${days} j ${hours} h` : `${days} j`;
}

export function filterAlertsBySeverity(
  alerts: AmanaParcelAlert[],
  severity: AmanaParcelAlertSeverity | null
): AmanaParcelAlert[] {
  return severity ? alerts.filter((a) => a.severity === severity) : alerts;
}
