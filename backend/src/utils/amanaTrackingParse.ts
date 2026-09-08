import {
  normalizeAmanaStatus,
  type AmanaStatusCode,
  type NormalizedAmanaStatus,
} from "./amanaTracking";

export type AmanaTrackingHistoryItem = {
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  statusCode: AmanaStatusCode;
  statusLabel: string;
  rawStatus: string;
  location: string | null;
};

export type AmanaTrackingPayload = {
  trackingCode: string;
  carrier: "AMANA";
  product: string | null;
  amount: number | null;
  amountRaw: string | null;
  weight: number | null;
  weightRaw: string | null;
  destination: string | null;
  currentPosition: string | null;
  depositDate: string | null;
  deliveryDate: string | null;
  status: NormalizedAmanaStatus;
  lastUpdate: { date: string; time: string } | null;
  history: AmanaTrackingHistoryItem[];
  fetchedAt: string;
  cached: boolean;
};

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&apos;/gi, "'");
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function pickClassText(html: string, className: string): string | null {
  const re = new RegExp(
    `class="[^"]*\\b${className}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/`,
    "i"
  );
  const m = html.match(re);
  if (!m) return null;
  const text = stripTags(m[1]);
  if (!text || text === "..." || text === ".." || /^\.+$/.test(text) || text === "../../....") {
    return null;
  }
  return text;
}

function pickLabeledSubtitle(html: string, labelPattern: RegExp): string | null {
  const re = new RegExp(
    `${labelPattern.source}[\\s\\S]*?class="[^"]*b-subtitle[^"]*"[^>]*>([\\s\\S]*?)<\\/`,
    "i"
  );
  const m = html.match(re);
  if (!m) return null;
  const text = stripTags(m[1]);
  if (!text || text === "..." || /^\.+$/.test(text) || text === "../../....") return null;
  return text;
}

/** dd/mm/yyyy → yyyy-mm-dd */
export function parseAmanaFrDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function parseAmanaAmount(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.replace(/\s/g, "").match(/([\d]+(?:[.,]\d+)?)/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function parseAmanaWeight(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.replace(/\s/g, "").match(/([\d]+(?:[.,]\d+)?)/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function splitEventBody(rawHtml: string): { rawStatus: string; location: string | null } {
  const locationMatch = rawHtml.match(/<b>([\s\S]*?)<\/b>/i);
  const location = locationMatch ? stripTags(locationMatch[1]) || null : null;
  const withoutBold = rawHtml.replace(/<b>[\s\S]*?<\/b>/gi, " ");
  let rawStatus = stripTags(withoutBold);
  // AMANA sometimes uses hyphen instead of apostrophe: "l-agence"
  rawStatus = rawStatus.replace(/\bl-agence\b/gi, "l'agence").replace(/\bl- /gi, "l'");
  return { rawStatus, location };
}

export function parseAmanaTrackingHtml(
  html: string,
  trackingCode: string
): Omit<AmanaTrackingPayload, "fetchedAt" | "cached"> {
  const product =
    pickClassText(html, "lblProductName") ||
    pickLabeledSubtitle(html, /Produit\s*:/);
  const amountRaw =
    pickClassText(html, "lblMttCrbt") ||
    pickLabeledSubtitle(html, /MONTANT\s+CRBT\s*:/);
  const currentPosition =
    pickLabeledSubtitle(html, /Position\s+actuelle\s*:/) ||
    pickClassText(html, "lblCurrentPosition");
  const weightRaw =
    pickLabeledSubtitle(html, /Poids\s+du\s+colis\s*:/) ||
    pickClassText(html, "lblWeight");
  const depositRaw =
    pickClassText(html, "lblDepositDate") ||
    pickLabeledSubtitle(html, /Date\s+d/);
  const deliveryRaw =
    pickClassText(html, "lblDeliveryDate") ||
    pickLabeledSubtitle(html, /Date\s+Livraison/);
  const destination = pickClassText(html, "lblRecipient");

  const history: AmanaTrackingHistoryItem[] = [];
  const timelineMatch = html.match(/<ul[^>]*class="[^"]*\btimeline\b[^"]*"[^>]*>([\s\S]*?)<\/ul>/i);
  const timelineHtml = timelineMatch?.[1] ?? "";
  const liRe = /<li>([\s\S]*?)<\/li>/gi;
  let li: RegExpExecArray | null;
  while ((li = liRe.exec(timelineHtml)) !== null) {
    const block = li[1];
    const dateFr = stripTags((block.match(/class="[^"]*container_date[^"]*"[^>]*>([\s\S]*?)<\//i) || [])[1] || "");
    const time = stripTags((block.match(/class="[^"]*container_time[^"]*"[^>]*>([\s\S]*?)<\//i) || [])[1] || "");
    const bodyHtml =
      (block.match(/class="[^"]*mt-3\s+mb-5[^"]*"[^>]*>([\s\S]*?)<\/div>/i) || [])[1] || "";
    const { rawStatus, location } = splitEventBody(bodyHtml);
    if (!dateFr && !rawStatus) continue;
    const isoDate = parseAmanaFrDate(dateFr) || dateFr;
    const normalized = normalizeAmanaStatus(rawStatus);
    history.push({
      date: isoDate,
      time: time || "—",
      statusCode: normalized.code,
      statusLabel: normalized.label,
      rawStatus: normalized.raw,
      location,
    });
  }

  const latest = history[0];
  const status: NormalizedAmanaStatus = latest
    ? { code: latest.statusCode, label: latest.statusLabel, raw: latest.rawStatus }
    : normalizeAmanaStatus("");

  return {
    trackingCode: trackingCode.trim().toUpperCase(),
    carrier: "AMANA",
    product,
    amount: parseAmanaAmount(amountRaw),
    amountRaw,
    weight: parseAmanaWeight(weightRaw),
    weightRaw,
    destination,
    currentPosition,
    depositDate: parseAmanaFrDate(depositRaw),
    deliveryDate: parseAmanaFrDate(deliveryRaw),
    status,
    lastUpdate: latest ? { date: latest.date, time: latest.time } : null,
    history,
  };
}

export function isEmptyAmanaTracking(
  data: Omit<AmanaTrackingPayload, "fetchedAt" | "cached">
): boolean {
  return (
    !data.product &&
    !data.currentPosition &&
    !data.destination &&
    data.history.length === 0
  );
}
