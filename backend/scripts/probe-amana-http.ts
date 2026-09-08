/**
 * Run on the VPS to verify outbound access to AMANA tracking.
 *   npx ts-node scripts/probe-amana-http.ts
 */
import { httpGetText } from '../src/services/AmanaTrackingService';

async function main() {
  const code = process.argv[2] || 'QD136777911MA';
  const url = `https://bam-tracking.barid.ma/Tracking/Search?trackingCode=${encodeURIComponent(code)}`;
  console.log('Probing AMANA from this machine…');
  console.log(url);
  const started = Date.now();
  try {
    const r = await httpGetText(url, 12000);
    const empty = /aucune information/i.test(r.body);
    console.log('RESULT OK', {
      ms: Date.now() - started,
      status: r.statusCode,
      bytes: r.body.length,
      emptyNoInfoPage: empty,
    });
    if (empty) {
      console.log('AMANA returned an empty/no-info page for this code.');
      process.exitCode = 2;
    }
  } catch (e: any) {
    console.error('RESULT FAIL', {
      ms: Date.now() - started,
      message: e?.message || String(e),
      code: e?.code,
    });
    console.error(
      'If this fails on VPS: allow outbound HTTPS to bam-tracking.barid.ma (firewall / security group).'
    );
    process.exitCode = 1;
  }
}

main();
