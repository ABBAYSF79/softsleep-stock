/**
 * Diagnose AMANA reachability from the VPS.
 *
 *   npx ts-node scripts/probe-amana-http.ts QD136777911MA
 */
import dns from 'dns';
import net from 'net';
import { httpGetText } from '../src/services/AmanaTrackingService';

const HOST = 'bam-tracking.barid.ma';

function raceTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

async function resolveDns() {
  const started = Date.now();
  try {
    const v4 = await raceTimeout(
      dns.promises.resolve4(HOST),
      5000,
      'DNS A'
    );
    console.log('DNS A (IPv4)', { ms: Date.now() - started, addresses: v4 });
    return v4[0] as string | undefined;
  } catch (e: any) {
    console.error('DNS A FAIL', e?.message || e);
  }

  try {
    const v6 = await raceTimeout(dns.promises.resolve6(HOST), 5000, 'DNS AAAA');
    console.log('DNS AAAA (IPv6)', { ms: Date.now() - started, addresses: v6 });
  } catch (e: any) {
    console.error('DNS AAAA FAIL', e?.message || e);
  }
  return undefined;
}

function tcpConnect(host: string, port: number, ms: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const socket = net.connect({ host, port, family: 4 });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`TCP ${host}:${port} timeout after ${ms}ms`));
    }, ms);
    socket.on('connect', () => {
      clearTimeout(timer);
      socket.end();
      resolve(Date.now() - started);
    });
    socket.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function main() {
  const code = process.argv[2] || 'QD136777911MA';
  console.log('=== AMANA VPS DIAGNOSTIC ===');
  console.log('host:', HOST);

  const ip = await resolveDns();
  if (ip) {
    try {
      const ms = await tcpConnect(ip, 443, 8000);
      console.log('TCP 443 OK', { ip, ms });
    } catch (e: any) {
      console.error('TCP 443 FAIL', { ip, message: e?.message || e });
      console.error(
        'Firewall may still block this IP, or the provider filters Barid Al Maghrib.'
      );
    }
  }

  const url = `https://${HOST}/Tracking/Search?trackingCode=${encodeURIComponent(code)}`;
  console.log('HTTPS GET', url);
  const started = Date.now();
  try {
    const r = await httpGetText(url, 12000);
    const empty = /aucune information/i.test(r.body);
    console.log('HTTPS OK', {
      ms: Date.now() - started,
      status: r.statusCode,
      bytes: r.body.length,
      emptyNoInfoPage: empty,
    });
  } catch (e: any) {
    console.error('HTTPS FAIL', {
      ms: Date.now() - started,
      message: e?.message || String(e),
      code: e?.code,
    });
    console.error(`
Next checks on VPS:
  dig +short ${HOST} A
  curl -4 -v --max-time 15 "${url}"

If curl also times out, outbound 443 to this host is still blocked or filtered.
Set AMANA_PROXY_URL (HTTP proxy with Morocco egress, e.g. Turnoxy) and re-run:
  AMANA_PROXY_URL='http://USER:PASS@HOST:PORT' npx ts-node scripts/probe-amana-http.ts
`);
    process.exitCode = 1;
  }
}

main();
