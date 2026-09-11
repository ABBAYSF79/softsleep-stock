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
const FETCH_TIMEOUT_PROXY_MS = 28_000;

/** Production VPS: true. Local Morocco: set AMANA_PROXY_ENABLED=false */
const AMANA_PROXY_ENABLED = true;

const HARDCODED_AMANA_PROXY_URL =
  'http://sub_5DdPsle9-country-MA:CjHFFnPfV2Olnvhv@gate.turnoxy.com:1318';

function isAmanaProxyEnabled(): boolean {
  const env = process.env.AMANA_PROXY_ENABLED?.trim().toLowerCase();
  if (env === '0' || env === 'false' || env === 'off') return false;
  if (env === '1' || env === 'true' || env === 'on') return true;
  return AMANA_PROXY_ENABLED;
}

function getAmanaProxyUrl(): string | undefined {
  if (!isAmanaProxyEnabled()) return undefined;
  return process.env.AMANA_PROXY_URL?.trim() || HARDCODED_AMANA_PROXY_URL;
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

function proxyAuthHeader(proxy: URL): Record<string, string> {
  if (!proxy.username && !proxy.password) return {};
  const user = decodeURIComponent(proxy.username);
  const pass = decodeURIComponent(proxy.password);
  return {
    'Proxy-Authorization': `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`,
  };
}

/** Native HTTP CONNECT — avoids ESM-only https-proxy-agent (breaks PM2/CJS). */
function openHttpProxyTunnel(
  target: URL,
  proxyUrl: string,
  timeoutMs: number
): Promise<Duplex> {
  return new Promise((resolve, reject) => {
    const proxy = new URL(proxyUrl);
    if (proxy.protocol !== 'http:' && proxy.protocol !== 'https:') {
      reject(
        new Error(
          `Unsupported AMANA_PROXY_URL protocol "${proxy.protocol}". Use http://USER:PASS@HOST:PORT.`
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
        const code = res.statusCode || 0;
        const hint =
          code === 407 ? ' (bad user/pass — use exact Turnoxy HTTP string)' : '';
        finish(() =>
          reject(new Error(`Proxy CONNECT failed with status ${code}${hint}`))
        );
        return;
      }
      finish(() => resolve(socket));
    });

    req.on('response', (res) => {
      const code = res.statusCode || 0;
      res.resume();
      const hint =
        code === 407 ? ' (bad user/pass — use exact Turnoxy HTTP string)' : '';
      finish(() =>
        reject(new Error(`Proxy CONNECT failed with status ${code}${hint}`))
      );
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

export function amanaTrackingErrorToHttp(
  error: unknown
): { status: number; body: object } | null {
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

export function httpGetText(urlString: string, timeoutMs: number): Promise<HttpGetResult> {
  const maxRedirects = 5;
  const proxyUrl = getAmanaProxyUrl();

  if (proxyUrl) {
    console.info('[amana-tracking] proxy configured', redactProxyForLog(proxyUrl));
  }

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

      let url: URL;
      try {
        url = new URL(currentUrl);
      } catch (err: any) {
        finish(() =>
          reject(new Error(`Invalid AMANA URL: ${err?.message || String(err)}`))
        );
        return;
      }

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
        req.on('error', (err: any) => {
          const message = err?.message || String(err);
          if (/407/.test(message) || /Proxy Authentication Required/i.test(message)) {
            finish(() =>
              reject(
                new Error(
                  'Proxy authentication failed (407). Check Turnoxy credentials.'
                )
              )
            );
            return;
          }
          finish(() => reject(err));
        });
        req.end();
      };

      if (proxyUrl && url.protocol === 'https:') {
        openHttpProxyTunnel(url, proxyUrl, timeoutMs)
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

      const isHttps = url.protocol === 'https:';
      const lib = isHttps ? https : http;
      const req = lib.request(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: `${url.pathname}${url.search}`,
          method: 'GET',
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
      } else {
        console.info('[amana-tracking] fetching direct (proxy disabled)');
      }
      response = await this.httpGet(
        url,
        proxyUrl ? FETCH_TIMEOUT_PROXY_MS : FETCH_TIMEOUT_MS
      );
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
        proxy: proxyUrl ? redactProxyForLog(proxyUrl) : null,
      });
      if (response.statusCode === 407) {
        throw new AmanaTrackingError(
          'Turnoxy proxy rejected username/password (HTTP 407). Check AMANA_PROXY_URL.',
          'UPSTREAM_ERROR',
          response.body.slice(0, 200)
        );
      }
      throw new AmanaTrackingError(
        `AMANA tracking returned HTTP ${response.statusCode}`,
        'UPSTREAM_ERROR',
        response.body.slice(0, 200)
      );
    }

    let html = '';
    try {
      if (
        response.contentType.includes('application/json') ||
        response.body.trim().startsWith('{')
      ) {
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
