/**
 * AMANA (Barid Al Maghrib) tracking status normalization.
 * Shared semantic codes for API responses — keep labels English for the admin UI.
 */

export type AmanaStatusCode =
  | "DELIVERED"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "ARRIVED_AT_AGENCY"
  | "DELIVERY_ATTEMPT"
  | "RETURN_TO_SENDER"
  | "RETURNED_TO_SENDER"
  | "UNKNOWN";

export type NormalizedAmanaStatus = {
  code: AmanaStatusCode;
  label: string;
  raw: string;
};

const STATUS_LABELS: Record<AmanaStatusCode, string> = {
  DELIVERED: "Delivered",
  IN_TRANSIT: "In transit",
  OUT_FOR_DELIVERY: "Out for delivery",
  ARRIVED_AT_AGENCY: "Arrived at agency",
  DELIVERY_ATTEMPT: "Delivery attempt",
  RETURN_TO_SENDER: "Returning to sender",
  RETURNED_TO_SENDER: "Returned to sender",
  UNKNOWN: "Unknown",
};

/** Collapse accents / apostrophe variants for robust French matching. */
export function normalizeAmanaMessageKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&#x?[0-9a-f]+;/gi, " ")
    .replace(/['’`´\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Map raw AMANA French status text → normalized code + English label.
 */
export function normalizeAmanaStatus(rawStatus: string): NormalizedAmanaStatus {
  const raw = (rawStatus || "").trim();
  const key = normalizeAmanaMessageKey(raw);

  let code: AmanaStatusCode = "UNKNOWN";

  if (!key) {
    code = "UNKNOWN";
  } else if (
    /livraison effectuee|envoi livre|colis livre|\blivre\b|\blivree\b/.test(key)
  ) {
    code = "DELIVERED";
  } else if (/retourne a l.?expediteur|retourne a l expediteur/.test(key)) {
    code = "RETURNED_TO_SENDER";
  } else if (/a retourner a l.?expediteur|a retourner/.test(key)) {
    code = "RETURN_TO_SENDER";
  } else if (/tentative de livraison/.test(key)) {
    code = "DELIVERY_ATTEMPT";
  } else if (/sorti par le facteur|en cours de livraison|mise en distribution/.test(key)) {
    code = "OUT_FOR_DELIVERY";
  } else if (/arrive a l.?agence|arrive a l agence|arrive au centre|en instance/.test(key)) {
    code = "ARRIVED_AT_AGENCY";
  } else if (/sorti de l.?agence|sorti de l agence|sorti du centre|en transit/.test(key)) {
    code = "IN_TRANSIT";
  }

  return {
    code,
    label: STATUS_LABELS[code],
    raw: raw || "—",
  };
}

export function amanaStatusBadgeClass(code: AmanaStatusCode): string {
  switch (code) {
    case "DELIVERED":
      return "bg-green-100 text-green-800 hover:bg-green-100";
    case "IN_TRANSIT":
    case "OUT_FOR_DELIVERY":
      return "bg-blue-100 text-blue-800 hover:bg-blue-100";
    case "ARRIVED_AT_AGENCY":
      return "bg-slate-100 text-slate-800 hover:bg-slate-100";
    case "DELIVERY_ATTEMPT":
    case "RETURN_TO_SENDER":
      return "bg-amber-100 text-amber-800 hover:bg-amber-100";
    case "RETURNED_TO_SENDER":
      return "bg-red-100 text-red-800 hover:bg-red-100";
    default:
      return "bg-gray-100 text-gray-700 hover:bg-gray-100";
  }
}

export function isAmanaDeliveryServiceName(name?: string | null): boolean {
  return Boolean(name && /amana/i.test(name.trim()));
}

/** Track when trackingCode is present — delivery service name is not required. */
export function canTrackAmanaOrder(order: {
  trackingCode?: string | null;
}): boolean {
  return Boolean(order.trackingCode && String(order.trackingCode).trim());
}
