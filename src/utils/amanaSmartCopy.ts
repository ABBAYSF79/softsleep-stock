import type { AmanaManagementExportRow } from "@/hooks/useApi";
import {
  AMANA_PARCEL_FALLBACK_LABELS,
  amanaParcelStatusLabel,
} from "@/utils/amanaParcelStatus";

export const AMANA_SMART_COPY_UNINITIALIZED_LABEL = "Non initialisé";

const STATUS_ORDER = Object.keys(AMANA_PARCEL_FALLBACK_LABELS);
export const AMANA_SMART_COPY_UNINITIALIZED_KEY = "__UNINITIALIZED__";
const UNINITIALIZED_KEY = AMANA_SMART_COPY_UNINITIALIZED_KEY;

export function amanaSmartCopyGroupKey(row: AmanaManagementExportRow): string {
  return row.amanaStatus?.code ?? UNINITIALIZED_KEY;
}

/** Report-only exclusions (never persisted): whole status groups and individual orders. */
export function filterAmanaSmartCopyRows(
  rows: AmanaManagementExportRow[],
  excluded: { groups: ReadonlySet<string>; orderIds: ReadonlySet<number> }
): AmanaManagementExportRow[] {
  return rows.filter(
    (r) => !excluded.groups.has(amanaSmartCopyGroupKey(r)) && !excluded.orderIds.has(r.id)
  );
}

export type AmanaSmartCopyGroup = {
  key: string;
  label: string;
  rows: AmanaManagementExportRow[];
};

/** Groups by current Amana status (catalog order, uninitialized last); one entry per order id. */
export function groupAmanaSmartCopyRows(rows: AmanaManagementExportRow[]): AmanaSmartCopyGroup[] {
  const seen = new Set<number>();
  const groups = new Map<string, AmanaSmartCopyGroup>();

  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    const key = amanaSmartCopyGroupKey(row);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        label: row.amanaStatus
          ? amanaParcelStatusLabel(row.amanaStatus)
          : AMANA_SMART_COPY_UNINITIALIZED_LABEL,
        rows: [],
      };
      groups.set(key, group);
    }
    group.rows.push(row);
  }

  const rank = (key: string) => {
    if (key === UNINITIALIZED_KEY) return Number.MAX_SAFE_INTEGER;
    const i = STATUS_ORDER.indexOf(key);
    return i === -1 ? STATUS_ORDER.length : i;
  };
  return [...groups.values()].sort((a, b) => rank(a.key) - rank(b.key));
}

function singleLine(value: string): string {
  return value.replace(/\s*[\r\n]+\s*/g, " ").trim();
}

function entryNote(row: AmanaManagementExportRow): string {
  return row.currentStatusNote ? singleLine(row.currentStatusNote) : "";
}

export function formatAmanaSmartCopyCount(count: number): string {
  return `${count} commande${count === 1 ? "" : "s"}`;
}

/** `- TRACKING – CITY : STATUS.` plus an indented `Note :` line when a note exists. */
export function formatAmanaSmartCopyEntry(row: AmanaManagementExportRow, statusLabel: string): string {
  const tracking = row.trackingCode?.trim() || "—";
  const city = row.city?.trim() || "—";
  const line = `- ${tracking} – ${city} : ${statusLabel}.`;
  const note = entryNote(row);
  return note ? `${line}\n  Note : ${note}` : line;
}

/**
 * WhatsApp report: bold status title, order count below it, then one bullet per order.
 * Orders are separated by a blank line only after an entry with a note, so the note
 * never reads as part of the next bullet.
 */
export function buildAmanaSmartCopyText(rows: AmanaManagementExportRow[]): string {
  return groupAmanaSmartCopyRows(rows)
    .map((group) => {
      const entries = group.rows
        .map((row, i) => {
          const entry = formatAmanaSmartCopyEntry(row, group.label);
          const isLast = i === group.rows.length - 1;
          return !isLast && entryNote(row) ? `${entry}\n` : entry;
        })
        .join("\n");
      return `*${group.label}*\n${formatAmanaSmartCopyCount(group.rows.length)}\n\n${entries}`;
    })
    .join("\n\n");
}
