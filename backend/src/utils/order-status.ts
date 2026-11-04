import { OrderStatus } from '@prisma/client';

/**
 * "Open" statuses: the order is waiting and its stock has NOT been deducted.
 * REPORTED (postponed by customer) must follow exactly the same stock rules as PENDING.
 */
export const OPEN_ORDER_STATUSES: OrderStatus[] = [OrderStatus.PENDING, OrderStatus.REPORTED];

export function isOpenOrderStatus(status: OrderStatus | string | null | undefined): boolean {
  return status === OrderStatus.PENDING || status === OrderStatus.REPORTED;
}

/** Statuses where product / accessory stock has been deducted for the order. */
export function isStockDeductedStatus(status: OrderStatus | string | null | undefined): boolean {
  return status === OrderStatus.IN_PROCESS || status === OrderStatus.DELIVERED;
}

export class ReportDateError extends Error {}

const BUSINESS_TIME_ZONE = 'Africa/Casablanca';

function todayYmd(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIME_ZONE }).format(new Date());
}

function formatYmdFr(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

/** Accepts "YYYY-MM-DD" (or an ISO string) and returns the calendar day. */
function parseYmd(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const probe = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (probe.getUTCMonth() !== Number(m) - 1 || probe.getUTCDate() !== Number(d)) return null;
  return `${y}-${m}-${d}`;
}

export type ReportPatch = {
  data: { reportedUntil?: Date | null; reportReason?: string | null };
  /** Text to log in the order follow-up timeline, if any. */
  followUp: string | null;
};

/**
 * Report date rules:
 * - entering REPORTED requires a date (today or later);
 * - while REPORTED, a new date reschedules it;
 * - leaving REPORTED clears the date and reason.
 * Throws ReportDateError on invalid input.
 */
export function resolveReportPatch(
  previousStatus: OrderStatus | string,
  nextStatus: OrderStatus | string | null | undefined,
  input: { reportedUntil?: unknown; reportReason?: unknown }
): ReportPatch {
  const target = nextStatus || previousStatus;
  const wasReported = previousStatus === OrderStatus.REPORTED;

  if (target !== OrderStatus.REPORTED) {
    return wasReported
      ? { data: { reportedUntil: null, reportReason: null }, followUp: null }
      : { data: {}, followUp: null };
  }

  const hasDate = input.reportedUntil !== undefined && input.reportedUntil !== null && input.reportedUntil !== '';
  if (!hasDate) {
    if (!wasReported) {
      throw new ReportDateError('Report date is required when setting status to REPORTED');
    }
    return { data: {}, followUp: null };
  }

  const ymd = parseYmd(input.reportedUntil);
  if (!ymd) throw new ReportDateError('Invalid report date');
  if (ymd < todayYmd()) throw new ReportDateError('Report date cannot be in the past');

  const reason =
    typeof input.reportReason === 'string' && input.reportReason.trim()
      ? input.reportReason.trim().slice(0, 1000)
      : null;

  const data: ReportPatch['data'] = {
    // Noon UTC keeps the same calendar day in Morocco whatever the DST offset
    reportedUntil: new Date(`${ymd}T12:00:00.000Z`),
  };
  if (!wasReported || input.reportReason !== undefined) data.reportReason = reason;

  const label = wasReported ? 'Report modifié au' : 'Reporté au';
  return {
    data,
    followUp: `${label} ${formatYmdFr(ymd)}${reason ? ` — ${reason}` : ''}`,
  };
}

/** Today's business-day window boundary: orders reported until <= this are due. */
export function endOfBusinessToday(): Date {
  return new Date(`${todayYmd()}T23:59:59.999Z`);
}
