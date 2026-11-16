/** Manual Amana Management statuses — labels prefer API `/amana-management/statuses`. */

export type AmanaParcelStatusCode =
  | "SORTI_A_DESTINATION"
  | "ENVOI_ARRIVE"
  | "SORTI_PAR_FACTEUR"
  | "PRIS_EN_CHARGE"
  | "A_RECUPERER"
  | "ENVOI_EN_RETARD"
  | "REFUSE_PAR_CLIENT"
  | "RETARD_RESOLU"
  | "RETARD_ARRIVE_DESTINATION"
  | "LIVREE";

export type AmanaParcelStatusMeta = {
  code: string;
  label: string;
  color?: string;
};

/** Tailwind badge classes keyed by approved technical codes. */
export const AMANA_PARCEL_BADGE_CLASS: Record<AmanaParcelStatusCode, string> = {
  SORTI_A_DESTINATION: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  ENVOI_ARRIVE: "bg-purple-100 text-purple-800 hover:bg-purple-100",
  SORTI_PAR_FACTEUR: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  PRIS_EN_CHARGE: "bg-slate-100 text-slate-700 hover:bg-slate-100",
  A_RECUPERER: "bg-orange-100 text-orange-800 hover:bg-orange-100",
  ENVOI_EN_RETARD: "bg-red-100 text-red-800 hover:bg-red-100",
  REFUSE_PAR_CLIENT: "bg-red-100 text-red-800 hover:bg-red-100",
  RETARD_RESOLU: "bg-green-100 text-green-800 hover:bg-green-100",
  RETARD_ARRIVE_DESTINATION: "bg-purple-100 text-purple-800 hover:bg-purple-100",
  LIVREE: "bg-green-100 text-green-800 hover:bg-green-100",
};

/** Solid indicator dot color matching the badge palette. */
export const AMANA_PARCEL_DOT_CLASS: Record<AmanaParcelStatusCode, string> = {
  SORTI_A_DESTINATION: "bg-blue-500",
  ENVOI_ARRIVE: "bg-purple-500",
  SORTI_PAR_FACTEUR: "bg-blue-500",
  PRIS_EN_CHARGE: "bg-slate-400",
  A_RECUPERER: "bg-orange-500",
  ENVOI_EN_RETARD: "bg-red-500",
  REFUSE_PAR_CLIENT: "bg-red-500",
  RETARD_RESOLU: "bg-green-500",
  RETARD_ARRIVE_DESTINATION: "bg-purple-500",
  LIVREE: "bg-green-500",
};

export function amanaParcelDotClass(code?: string | null): string {
  if (code && isAmanaParcelStatusCode(code)) {
    return AMANA_PARCEL_DOT_CLASS[code];
  }
  return "bg-gray-400";
}

/** Fallback French labels if statuses endpoint is unavailable. */
export const AMANA_PARCEL_FALLBACK_LABELS: Record<AmanaParcelStatusCode, string> = {
  SORTI_A_DESTINATION: "Envoi sorti à destination",
  ENVOI_ARRIVE: "Envoi arrivé",
  SORTI_PAR_FACTEUR: "Envoi sorti par le facteur",
  PRIS_EN_CHARGE: "Envoi pris en charge",
  A_RECUPERER: "Envoi à récupérer",
  ENVOI_EN_RETARD: "Envoi en retard",
  REFUSE_PAR_CLIENT: "Refusé par le client",
  RETARD_RESOLU: "Envoi en retard – Résolu",
  RETARD_ARRIVE_DESTINATION: "Envoi en retard – Arrivé à destination",
  LIVREE: "Livrée",
};

export function isAmanaParcelStatusCode(value: unknown): value is AmanaParcelStatusCode {
  return typeof value === "string" && value in AMANA_PARCEL_BADGE_CLASS;
}

export function amanaParcelBadgeClass(code?: string | null): string {
  if (code && isAmanaParcelStatusCode(code)) {
    return AMANA_PARCEL_BADGE_CLASS[code];
  }
  return "bg-gray-100 text-gray-700 hover:bg-gray-100";
}

export function amanaParcelStatusLabel(
  codeOrMeta?: string | AmanaParcelStatusMeta | null,
  catalog?: AmanaParcelStatusMeta[]
): string {
  if (!codeOrMeta) return "—";
  if (typeof codeOrMeta === "object") {
    return codeOrMeta.label || codeOrMeta.code || "—";
  }
  const fromCatalog = catalog?.find((s) => s.code === codeOrMeta);
  if (fromCatalog?.label) return fromCatalog.label;
  if (isAmanaParcelStatusCode(codeOrMeta)) {
    return AMANA_PARCEL_FALLBACK_LABELS[codeOrMeta];
  }
  return codeOrMeta;
}
