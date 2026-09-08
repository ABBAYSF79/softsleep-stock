export type AmanaStatusCode =
  | "DELIVERED"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "ARRIVED_AT_AGENCY"
  | "DELIVERY_ATTEMPT"
  | "RETURN_TO_SENDER"
  | "RETURNED_TO_SENDER"
  | "UNKNOWN";

export function isAmanaDeliveryServiceName(name?: string | null): boolean {
  return Boolean(name && /amana/i.test(name.trim()));
}

/** Show track action when a tracking code exists (no delivery-service name gate). */
export function canTrackAmanaOrder(order: {
  trackingCode?: string | null;
}): boolean {
  return Boolean(order.trackingCode && String(order.trackingCode).trim());
}

export function amanaStatusBadgeClass(code: AmanaStatusCode | string): string {
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

/** Map AMANA tracking code → internal Order.status when applying a patch. */
export function suggestedOrderStatusFromAmana(
  amanaCode: AmanaStatusCode | string
): "DELIVERED" | "RETURNED" | null {
  if (amanaCode === "DELIVERED") return "DELIVERED";
  if (amanaCode === "RETURNED_TO_SENDER") return "RETURNED";
  return null;
}

/** Timeline dot colors matching status badges. */
export function amanaStatusDotClass(code: AmanaStatusCode | string): string {
  switch (code) {
    case "DELIVERED":
      return "bg-green-600";
    case "IN_TRANSIT":
    case "OUT_FOR_DELIVERY":
      return "bg-blue-600";
    case "ARRIVED_AT_AGENCY":
      return "bg-slate-500";
    case "DELIVERY_ATTEMPT":
    case "RETURN_TO_SENDER":
      return "bg-amber-500";
    case "RETURNED_TO_SENDER":
      return "bg-red-600";
    default:
      return "bg-gray-400";
  }
}

export function formatAmanaDisplayDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatAmanaDateTime(
  date: string | null | undefined,
  time: string | null | undefined
): string {
  const d = formatAmanaDisplayDate(date);
  if (!time || time === "—") return d;
  return `${d} · ${time}`;
}
