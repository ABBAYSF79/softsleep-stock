import https from 'https';
import http from 'http';
import tls from 'tls';
import { URL } from 'url';
import type { Duplex } from 'stream';
import { PrismaClient, User } from '@prisma/client';
import {
  assertCanAccessOrder,
  getUserDeliveryServiceIds,
  OrderAccessError,
} from '../utils/order-access';
import {
  isAmanaNoInfoPage,
  isEmptyAmanaTracking,
  parseAmanaTrackingHtml,
  type AmanaTrackingPayload,
} from '../utils/amanaTrackingParse';

const DEFAULT_AMANA_URL = 'https://bam-tracking.barid.ma/Tracking/Search';
const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 12_000;

/**
 * Turnoxy Morocco HTTP proxy for AMANA egress from the VPS.
 * Prefer resetting credentials in Turnoxy if this repo is shared / public.
 * Optional override: process.env.AMANA_PROXY_URL
 */
const HARDCODED_AMANA_PROXY_URL =
  'http://sub_5DdPsle9-country-ma:CjHFfnPfV2Olnvhv@gate.turnoxy.com:1318';

function getAmanaProxyUrl(): string | undefined {
  const fromEnv = process.env.AMANA_PROXY_URL?.trim();
  return fromEnv || HARDCODED_AMANA_PROXY_URL;
}

function proxyAuthHeader(proxy: URL): Record<string, string> {
  if (!proxy.username && !proxy.password) return {};
  const user = decodeURIComponent(proxy.username);
  const pass = decodeURIComponent(proxy.password);
  return {
    'Proxy-Authorization': `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`,
  };
}

function redactProxyForLog(proxyUrl: string): string {
  try {
    const u = new URL(proxyUrl);
    const auth = u.username ? `${u.username}:***@` : '';
    return `${u.protocol}//${auth}${u.host}`;
  } catch {
    return '[invalid AMANA_PROXY_URL]';
  }
}

/**
 * Open an HTTP CONNECT tunnel through an HTTP proxy to the target host:port.
 */
function openHttpProxyTunnel(
  target: URL,
  proxy: URL,
  timeoutMs: number
): Promise<Duplex> {
  return new Promise((resolve, reject) => {
    if (proxy.protocol !== 'http:' && proxy.protocol !== 'https:') {
      reject(
        new Error(
          `Unsupported AMANA_PROXY_URL protocol "${proxy.protocol}" (use http://…)`
        )
      );
      return;
    }

    const targetPort =
      Number(target.port) || (target.protocol === 'https:' ? 443 : 80);
    const connectPath = `${target.hostname}:${targetPort}`;
    const proxyPort =
      Number(proxy.port) || (proxy.protocol === 'https:' ? 443 : 80);
    const lib = proxy.protocol === 'https:' ? https : http;

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimer);
      fn();
    };

    const req = lib.request({
      protocol: proxy.protocol,
      hostname: proxy.hostname,
      port: proxyPort,
      method: 'CONNECT',
      path: connectPath,
      headers: {
        Host: connectPath,
        ...proxyAuthHeader(proxy),
        Connection: 'close',
      },
      timeout: timeoutMs,
      family: 4,
      agent: false as any,
    });

    const hardTimer = setTimeout(() => {
      req.destroy();
      finish(() =>
        reject(Object.assign(new Error('timeout'), { name: 'AbortError' }))
      );
    }, timeoutMs);

    req.on('connect', (res, socket) => {
      if ((res.statusCode || 0) !== 200) {
        socket.destroy();
        finish(() =>
          reject(
            new Error(`Proxy CONNECT failed with status ${res.statusCode || 0}`)
          )
        );
        return;
      }
      finish(() => resolve(socket));
    });

    req.on('timeout', () => {
      req.destroy();
      finish(() =>
        reject(Object.assign(new Error('timeout'), { name: 'AbortError' }))
      );
    });

    req.on('error', (err) => {
      finish(() => reject(err));
    });

    req.end();
  });
}

type CacheEntry = {
  expiresAt: number;
  data: AmanaTrackingPayload;
};

const trackingCache = new Map<string, CacheEntry>();

export class AmanaTrackingError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'TRACKING_ERROR',
    public readonly detail?: string
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
      body: {
        error: error.message,
        code: error.code,
        ...(error.detail ? { detail: error.detail } : {}),
      },
    };
  }
  return null;
}

function cacheKey(trackingCode: string): string {
  return trackingCode.trim().toUpperCase();
}

type HttpGetResult = {
  statusCode: number;
  contentType: string;
  body: string;
};

const DEFAULT_REQUEST_HEADERS = {
  Accept: 'application/json, text/html, */*',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Connection: 'close',
};

/**
 * Production-safe HTTP GET (no dependency on global fetch / Node 18+).
 * Follows a few redirects and always hard-timeouts.
 * When `AMANA_PROXY_URL` is set, HTTPS targets go through an HTTP CONNECT tunnel
 * (e.g. Turnoxy Morocco residential proxy on a foreign VPS).
 */
export function httpGetText(urlString: string, timeoutMs: number): Promise<HttpGetResult> {
  const maxRedirects = 5;
  const proxyUrl = getAmanaProxyUrl();

  const once = (currentUrl: string, redirectsLeft: number): Promise<HttpGetResult> =>
    new Promise((resolve, reject) => {
      let settled = false;
      let activeReq: http.ClientRequest | null = null;
      let tunnelSocket: Duplex | null = null;

      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(hardTimer);
        fn();
      };

      const url = new URL(currentUrl);
      const handleResponse = (res: http.IncomingMessage) => {
        const status = res.statusCode || 0;
        const location = res.headers.location;
        if (status >= 300 && status < 400 && location && redirectsLeft > 0) {
          res.resume();
          const next = new URL(location, currentUrl).toString();
          finish(() => {
            once(next, redirectsLeft - 1).then(resolve, reject);
          });
          return;
        }

        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          finish(() =>
            resolve({
              statusCode: status,
              contentType: String(res.headers['content-type'] || ''),
              body: Buffer.concat(chunks).toString('utf8'),
            })
          );
        });
        res.on('error', (err) => {
          finish(() => reject(err));
        });
      };

      const hardTimer = setTimeout(() => {
        activeReq?.destroy();
        tunnelSocket?.destroy();
        finish(() =>
          reject(Object.assign(new Error('timeout'), { name: 'AbortError' }))
        );
      }, timeoutMs);

      const attachReqHandlers = (req: http.ClientRequest) => {
        activeReq = req;
        req.on('timeout', () => {
          req.destroy();
          finish(() =>
            reject(Object.assign(new Error('timeout'), { name: 'AbortError' }))
          );
        });
        req.on('error', (err) => {
          finish(() => reject(err));
        });
        req.end();
      };

      // Proxied HTTPS: CONNECT tunnel then TLS to target
      if (proxyUrl && url.protocol === 'https:') {
        openHttpProxyTunnel(url, new URL(proxyUrl), timeoutMs)
          .then((socket) => {
            if (settled) {
              socket.destroy();
              return;
            }
            tunnelSocket = socket;
            const req = https.request(
              {
                protocol: 'https:',
                hostname: url.hostname,
                port: url.port || 443,
                path: `${url.pathname}${url.search}`,
                method: 'GET',
                headers: DEFAULT_REQUEST_HEADERS,
                timeout: timeoutMs,
                servername: url.hostname,
                createConnection: () =>
                  tls.connect({
                    socket: socket as any,
                    servername: url.hostname,
                    rejectUnauthorized: true,
                  }),
              },
              handleResponse
            );
            attachReqHandlers(req);
          })
          .catch((err) => {
            finish(() => reject(err));
          });
        return;
      }

      // Proxied plain HTTP: absolute-form request to the proxy
      if (proxyUrl && url.protocol === 'http:') {
        const proxy = new URL(proxyUrl);
        const proxyPort =
          Number(proxy.port) || (proxy.protocol === 'https:' ? 443 : 80);
        const lib = proxy.protocol === 'https:' ? https : http;
        const req = lib.request(
          {
            protocol: proxy.protocol,
            hostname: proxy.hostname,
            port: proxyPort,
            path: currentUrl,
            method: 'GET',
            family: 4,
            headers: {
              ...DEFAULT_REQUEST_HEADERS,
              Host: url.host,
              ...proxyAuthHeader(proxy),
            },
            timeout: timeoutMs,
            agent: false as any,
          },
          handleResponse
        );
        attachReqHandlers(req);
        return;
      }

      // Direct (no proxy)
      const lib = url.protocol === 'http:' ? http : https;
      const req = lib.request(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || (url.protocol === 'http:' ? 80 : 443),
          path: `${url.pathname}${url.search}`,
          method: 'GET',
          // Many VPS have broken/unrouted IPv6 — prefer IPv4 to avoid long hangs.
          family: 4,
          headers: DEFAULT_REQUEST_HEADERS,
          timeout: timeoutMs,
          agent: false as any,
        },
        handleResponse
      );
      attachReqHandlers(req);
    });

  return once(urlString, maxRedirects);
}

export class AmanaTrackingService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly httpGet: typeof httpGetText = httpGetText
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
    const proxyUrl = getAmanaProxyUrl();

    let response: HttpGetResult;
    try {
      if (proxyUrl) {
        console.info('[amana-tracking] fetching via proxy', redactProxyForLog(proxyUrl));
      }
      response = await this.httpGet(url, FETCH_TIMEOUT_MS);
    } catch (err: any) {
      const detail = err?.message || String(err);
      console.error('[amana-tracking] upstream request failed', {
        url,
        proxy: proxyUrl ? redactProxyForLog(proxyUrl) : null,
        detail,
      });
      if (err?.name === 'AbortError' || /timeout/i.test(detail)) {
        throw new AmanaTrackingError(
          'AMANA tracking request timed out',
          'UPSTREAM_TIMEOUT',
          detail
        );
      }
      throw new AmanaTrackingError(
        'Unable to reach AMANA tracking service from the server',
        'UPSTREAM_ERROR',
        detail
      );
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      console.error('[amana-tracking] upstream bad status', {
        statusCode: response.statusCode,
        preview: response.body.slice(0, 200),
      });
      throw new AmanaTrackingError(
        `AMANA tracking returned HTTP ${response.statusCode}`,
        'UPSTREAM_ERROR',
        response.body.slice(0, 200)
      );
    }

    let html = '';
    try {
      if (response.contentType.includes('application/json') || response.body.trim().startsWith('{')) {
        const json = JSON.parse(response.body) as { Html?: string; html?: string };
        html = json.Html || json.html || '';
      } else {
        html = response.body;
      }
    } catch (err: any) {
      console.error('[amana-tracking] invalid JSON/HTML body', err?.message);
      throw new AmanaTrackingError(
        'Invalid response from AMANA tracking',
        'PARSE_ERROR',
        err?.message
      );
    }

    if (!html || typeof html !== 'string') {
      throw new AmanaTrackingError('Empty response from AMANA tracking', 'PARSE_ERROR');
    }

    let parsed: ReturnType<typeof parseAmanaTrackingHtml>;
    try {
      parsed = parseAmanaTrackingHtml(html, trackingCode);
    } catch (err: any) {
      console.error('[amana-tracking] HTML parse failed', err?.message);
      throw new AmanaTrackingError(
        'Failed to parse AMANA tracking HTML',
        'PARSE_ERROR',
        err?.message
      );
    }

    if (isAmanaNoInfoPage(html) || isEmptyAmanaTracking(parsed)) {
      throw new AmanaTrackingError(
        `AMANA has no tracking events for ${trackingCode} right now. Try again later or verify the code on bam-tracking.barid.ma`,
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
