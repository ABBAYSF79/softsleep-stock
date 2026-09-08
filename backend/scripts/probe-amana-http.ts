import { httpGetText } from '../src/services/AmanaTrackingService';

async function main() {
  const url =
    'https://bam-tracking.barid.ma/Tracking/Search?trackingCode=QD136779943MA';
  console.log('GET', url);
  const started = Date.now();
  try {
    const r = await httpGetText(url, 15000);
    console.log('OK', {
      ms: Date.now() - started,
      status: r.statusCode,
      len: r.body.length,
      type: r.contentType,
      preview: r.body.slice(0, 120),
    });
  } catch (e: any) {
    console.error('FAIL', { ms: Date.now() - started, err: e?.message || e });
    process.exitCode = 1;
  }
}

main();
