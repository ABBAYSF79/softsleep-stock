import { PrismaClient, User } from '@prisma/client';
import {
  assertCanAccessOrder,
  getUserDeliveryServiceIds,
  OrderAccessError,
} from '../utils/order-access';
import {
  isEmptyAmanaTracking,
  parseAmanaTrackingHtml,
  type AmanaTrackingPayload,
} from '../utils/amanaTrackingParse';

const DEFAULT_AMANA_URL = 'https://bam-tracking.barid.ma/Tracking/Search';
const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 20_000;

type CacheEntry = {
  expiresAt: number;
  data: AmanaTrackingPayload;
};

const trackingCache = new Map<string, CacheEntry>();

export class AmanaTrackingError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'TRACKING_ERROR'
  ) {
    super(message);
    this.name = 'AmanaTrackingError';
  }
}

export function amanaTrackingErrorToHttp(error: unknown): { status: number; body: object } | null {
  if (error instanceof OrderAccessError) {
    return { status: 403, body: { error: error.message, code: 'FORBIDDEN' } };
  }
  if (error instanceof AmanaTrackingError) {
    const statusByCode: Record<string, number> = {
      NOT_FOUND: 404,
      NOT_AMANA: 400,
      NO_TRACKING_CODE: 400,
      EMPTY_RESULT: 404,
      UPSTREAM_TIMEOUT: 504,
      UPSTREAM_ERROR: 502,
      PARSE_ERROR: 502,
    };
    return {
      status: statusByCode[error.code] ?? 400,
      body: { error: error.message, code: error.code },
    };
  }
  return null;
}

function cacheKey(trackingCode: string): string {
  return trackingCode.trim().toUpperCase();
}

export class AmanaTrackingService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly fetchImpl: typeof fetch = fetch.bind(globalThis)
  ) {}

  clearCache(trackingCode?: string) {
    if (trackingCode) {
      trackingCache.delete(cacheKey(trackingCode));
      return;
    }
    trackingCache.clear();
  }

  async getForOrder(
    orderId: number,
    user: User,
    options: { refresh?: boolean } = {}
  ): Promise<AmanaTrackingPayload> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        deliveryServiceId: true,
        trackingCode: true,
        deliveryService: { select: { id: true, name: true } },
      },
    });

    if (!order) {
      throw new AmanaTrackingError('Order not found', 'NOT_FOUND');
    }

    const deliveryServiceIds = await getUserDeliveryServiceIds(user.id);
    assertCanAccessOrder(user, order, deliveryServiceIds);

    const trackingCode = order.trackingCode?.trim();
    if (!trackingCode) {
      throw new AmanaTrackingError('Order has no tracking code', 'NO_TRACKING_CODE');
    }

    const key = cacheKey(trackingCode);
    if (!options.refresh) {
      const hit = trackingCache.get(key);
      if (hit && hit.expiresAt > Date.now()) {
        return { ...hit.data, cached: true };
      }
    } else {
      trackingCache.delete(key);
    }

    const data = await this.fetchAndParse(trackingCode);
    trackingCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, data });
    return data;
  }

  private async fetchAndParse(trackingCode: string): Promise<AmanaTrackingPayload> {
    const baseUrl = (process.env.AMANA_TRACKING_URL || DEFAULT_AMANA_URL).replace(/\/$/, '');
    const url = `${baseUrl}?trackingCode=${encodeURIComponent(trackingCode)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json, text/html, */*',
          'User-Agent':
            'Mozilla/5.0 (compatible; SoftsleepStock/1.0; +https://mangesoftsleep.store)',
        },
        signal: controller.signal,
      });
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new AmanaTrackingError(
          'AMANA tracking request timed out',
          'UPSTREAM_TIMEOUT'
        );
      }
      throw new AmanaTrackingError(
        'Unable to reach AMANA tracking service',
        'UPSTREAM_ERROR'
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new AmanaTrackingError(
        `AMANA tracking returned HTTP ${response.status}`,
        'UPSTREAM_ERROR'
      );
    }

    let html: string;
    const contentType = response.headers.get('content-type') || '';
    try {
      if (contentType.includes('application/json')) {
        const json = (await response.json()) as { Html?: string; html?: string };
        html = json.Html || json.html || '';
      } else {
        html = await response.text();
      }
    } catch {
      throw new AmanaTrackingError('Invalid response from AMANA tracking', 'PARSE_ERROR');
    }

    if (!html || typeof html !== 'string') {
      throw new AmanaTrackingError('Empty response from AMANA tracking', 'PARSE_ERROR');
    }

    let parsed: ReturnType<typeof parseAmanaTrackingHtml>;
    try {
      parsed = parseAmanaTrackingHtml(html, trackingCode);
    } catch {
      throw new AmanaTrackingError('Failed to parse AMANA tracking HTML', 'PARSE_ERROR');
    }

    if (isEmptyAmanaTracking(parsed)) {
      throw new AmanaTrackingError(
        'No tracking information found for this code',
        'EMPTY_RESULT'
      );
    }

    return {
      ...parsed,
      fetchedAt: new Date().toISOString(),
      cached: false,
    };
  }
}
