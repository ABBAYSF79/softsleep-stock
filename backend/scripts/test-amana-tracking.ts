/**
 * Offline unit tests for AMANA status normalization + HTML parsing.
 * Does not hit the live AMANA network (fixture-based).
 */
import {
  normalizeAmanaStatus,
  isAmanaDeliveryServiceName,
  canTrackAmanaOrder,
} from '../src/utils/amanaTracking';
import {
  parseAmanaTrackingHtml,
  isEmptyAmanaTracking,
  parseAmanaFrDate,
  parseAmanaAmount,
  parseAmanaWeight,
} from '../src/utils/amanaTrackingParse';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const FIXTURE = `
<ul class="timeline">
  <li>
    <div class="bullet">2</div>
    <div class="container_pills">
      <div class="container_date">08/09/2026</div>
      <div class="container_time">18:34</div>
    </div>
    <div class="mt-3 mb-5">
      Envoi sorti de l-agence/centre <b>CENTRE MESSAGERIE RABAT</b>
    </div>
  </li>
  <li>
    <div class="bullet">1</div>
    <div class="container_pills">
      <div class="container_date">08/09/2026</div>
      <div class="container_time">18:25</div>
    </div>
    <div class="mt-3 mb-5">
      Envoi arriv&#xE9; &#xE0; l-agence/centre <b>CENTRE MESSAGERIE RABAT</b>
    </div>
  </li>
</ul>
<span class="b-title text-uppercase d-block">Produit:</span>
<span class="b-subtitle lblProductName">AMANA E-commerce</span>
<span class="b-title text-uppercase d-block">MONTANT CRBT:</span>
<span class="b-subtitle lblMttCrbt">1300.00 DH</span>
<span class="b-title text-uppercase d-block">Position actuelle:</span>
<span class="b-subtitle">CENTRE MESSAGERIE RABAT</span>
<span class="b-title text-uppercase d-block">Poids du colis:</span>
<span class="b-subtitle">31.000 Kg</span>
<span class="b-subtitle text-uppercase lblDepositDate">08/09/2026</span>
<div class="tooltip_depart margin3 lblRecipient">SEBT GZOULA</div>
`;

console.log('Running AMANA tracking unit checks…');

assert(normalizeAmanaStatus("Envoi sorti de l'agence/centre").code === 'IN_TRANSIT', 'in transit');
assert(normalizeAmanaStatus("Envoi arrivé à l'agence/centre").code === 'ARRIVED_AT_AGENCY', 'arrived');
assert(normalizeAmanaStatus("Envoi sorti par le facteur").code === 'OUT_FOR_DELIVERY', 'out for delivery');
assert(normalizeAmanaStatus("1ère tentative de livraison").code === 'DELIVERY_ATTEMPT', 'attempt 1');
assert(normalizeAmanaStatus("2ème tentative de livraison").code === 'DELIVERY_ATTEMPT', 'attempt 2');
assert(normalizeAmanaStatus("Envoi à retourner à l'expéditeur").code === 'RETURN_TO_SENDER', 'return');
assert(normalizeAmanaStatus("Envoi retourné à l'expéditeur").code === 'RETURNED_TO_SENDER', 'returned');
assert(normalizeAmanaStatus("Livraison effectuée").code === 'DELIVERED', 'delivered');
assert(normalizeAmanaStatus("Envoi livré").code === 'DELIVERED', 'envoi livre');
assert(normalizeAmanaStatus("Something weird").code === 'UNKNOWN', 'unknown');

assert(isAmanaDeliveryServiceName('AMANA') === true, 'amana name');
assert(isAmanaDeliveryServiceName('Amana Express') === true, 'amana express');
assert(isAmanaDeliveryServiceName('Chrono') === false, 'not amana');
assert(
  canTrackAmanaOrder({ trackingCode: 'QD1MA' }) === true,
  'can track'
);
assert(
  canTrackAmanaOrder({ trackingCode: '  ' }) === false,
  'no code'
);

assert(parseAmanaFrDate('08/09/2026') === '2026-09-08', 'fr date');
assert(parseAmanaAmount('1,300.00 DH') === 1300 || parseAmanaAmount('1300.00 DH') === 1300, 'amount');
assert(parseAmanaWeight('31.000 Kg') === 31, 'weight');

const parsed = parseAmanaTrackingHtml(FIXTURE, 'QD136777911MA');
assert(parsed.trackingCode === 'QD136777911MA', 'code');
assert(parsed.product === 'AMANA E-commerce', 'product');
assert(parsed.amount === 1300, `amount got ${parsed.amount}`);
assert(parsed.weight === 31, 'weight parsed');
assert(parsed.destination === 'SEBT GZOULA', 'dest');
assert(parsed.currentPosition === 'CENTRE MESSAGERIE RABAT', 'pos');
assert(parsed.history.length === 2, 'history len');
assert(parsed.history[0].statusCode === 'IN_TRANSIT', 'latest status');
assert(parsed.history[0].location === 'CENTRE MESSAGERIE RABAT', 'latest loc');
assert(parsed.history[1].statusCode === 'ARRIVED_AT_AGENCY', 'older status');
assert(parsed.status.code === 'IN_TRANSIT', 'summary status');
assert(!isEmptyAmanaTracking(parsed), 'not empty');

assert(isEmptyAmanaTracking(parseAmanaTrackingHtml('<div></div>', 'X')), 'empty html');

console.log('AMANA tracking checks OK');
