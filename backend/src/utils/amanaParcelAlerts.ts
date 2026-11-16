import { AmanaParcelStatus } from '@prisma/client';

export type AmanaParcelAlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

const HOUR_MS = 60 * 60 * 1000;

/** Highest first — the first matching threshold wins, so each parcel gets one severity. */
export const AMANA_PARCEL_ALERT_THRESHOLDS: ReadonlyArray<{
  severity: AmanaParcelAlertSeverity;
  hours: number;
}> = [
  { severity: 'CRITICAL', hours: 72 },
  { severity: 'WARNING', hours: 48 },
  { severity: 'INFO', hours: 24 },
];

export const AMANA_PARCEL_ALERT_SEVERITIES: readonly AmanaParcelAlertSeverity[] =
  AMANA_PARCEL_ALERT_THRESHOLDS.map((t) => t.severity);

export function amanaParcelAlertSeverity(
  lastUpdateAt: Date,
  referenceAt: Date
): AmanaParcelAlertSeverity | null {
  const elapsedMs = referenceAt.getTime() - lastUpdateAt.getTime();
  for (const t of AMANA_PARCEL_ALERT_THRESHOLDS) {
    if (elapsedMs >= t.hours * HOUR_MS) return t.severity;
  }
  return null;
}

const STATUS_ACTIONS: Partial<Record<AmanaParcelStatus, string>> = {
  LIVREE: 'Colis livré côté Amana — clôturer la commande',
  REFUSE_PAR_CLIENT: 'Colis refusé — organiser le retour',
  A_RECUPERER: 'Relancer le client pour retirer le colis en agence',
  ENVOI_EN_RETARD: 'Contacter Amana au sujet du retard',
  RETARD_ARRIVE_DESTINATION: 'Confirmer la livraison avec le client',
};

const SEVERITY_ACTIONS: Record<AmanaParcelAlertSeverity, string> = {
  INFO: 'Vérifier le suivi Amana',
  WARNING: 'Vérifier le suivi et contacter le client',
  CRITICAL: 'Escalader : contacter Amana et le client',
};

export function amanaParcelAlertSuggestedAction(
  severity: AmanaParcelAlertSeverity,
  status: AmanaParcelStatus
): string {
  return STATUS_ACTIONS[status] ?? SEVERITY_ACTIONS[severity];
}
