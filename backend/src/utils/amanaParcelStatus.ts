import { AmanaParcelStatus } from '@prisma/client';

/** Approved manual Amana Management statuses — exact product catalog. */
export const AMANA_PARCEL_STATUSES: readonly AmanaParcelStatus[] = [
  AmanaParcelStatus.SORTI_A_DESTINATION,
  AmanaParcelStatus.ENVOI_ARRIVE,
  AmanaParcelStatus.SORTI_PAR_FACTEUR,
  AmanaParcelStatus.PRIS_EN_CHARGE,
  AmanaParcelStatus.A_RECUPERER,
  AmanaParcelStatus.ENVOI_EN_RETARD,
  AmanaParcelStatus.REFUSE_PAR_CLIENT,
  AmanaParcelStatus.RETARD_RESOLU,
  AmanaParcelStatus.RETARD_ARRIVE_DESTINATION,
  AmanaParcelStatus.LIVREE,
] as const;

export const AMANA_PARCEL_STATUS_SET = new Set<string>(AMANA_PARCEL_STATUSES);

export const AMANA_PARCEL_INITIAL_STATUS = AmanaParcelStatus.SORTI_A_DESTINATION;

export const AMANA_PARCEL_STATUS_LABELS: Record<AmanaParcelStatus, string> = {
  SORTI_A_DESTINATION: 'Envoi sorti à destination',
  ENVOI_ARRIVE: 'Envoi arrivé',
  SORTI_PAR_FACTEUR: 'Envoi sorti par le facteur',
  PRIS_EN_CHARGE: 'Envoi pris en charge',
  A_RECUPERER: 'Envoi à récupérer',
  ENVOI_EN_RETARD: 'Envoi en retard',
  REFUSE_PAR_CLIENT: 'Refusé par le client',
  RETARD_RESOLU: 'Envoi en retard – Résolu',
  RETARD_ARRIVE_DESTINATION: 'Envoi en retard – Arrivé à destination',
  LIVREE: 'Livrée',
};

/** Badge color hints for future UI (not used by backend logic). */
export const AMANA_PARCEL_STATUS_COLORS: Record<AmanaParcelStatus, string> = {
  SORTI_A_DESTINATION: 'blue',
  ENVOI_ARRIVE: 'purple',
  SORTI_PAR_FACTEUR: 'blue',
  PRIS_EN_CHARGE: 'gray',
  A_RECUPERER: 'orange',
  ENVOI_EN_RETARD: 'red',
  REFUSE_PAR_CLIENT: 'red',
  RETARD_RESOLU: 'green',
  RETARD_ARRIVE_DESTINATION: 'purple',
  LIVREE: 'green',
};

export const AMANA_PARCEL_NOTE_MAX = 2000;

export function isAmanaParcelStatus(value: unknown): value is AmanaParcelStatus {
  return typeof value === 'string' && AMANA_PARCEL_STATUS_SET.has(value);
}

export function parseAmanaParcelStatus(value: unknown): AmanaParcelStatus {
  if (!isAmanaParcelStatus(value)) {
    throw new Error('INVALID_AMANA_PARCEL_STATUS');
  }
  return value;
}

export function amanaParcelStatusMeta(status: AmanaParcelStatus) {
  return {
    code: status,
    label: AMANA_PARCEL_STATUS_LABELS[status],
    color: AMANA_PARCEL_STATUS_COLORS[status],
  };
}
