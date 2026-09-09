# AMANA Shipment Tracking — Implementation Summary

## Files created

| File | Role |
|------|------|
| `backend/src/utils/amanaTracking.ts` | Status normalization + AMANA name detection |
| `backend/src/utils/amanaTrackingParse.ts` | HTML → clean JSON parser |
| `backend/src/services/AmanaTrackingService.ts` | Access checks, fetch, 5‑min cache |
| `backend/src/routes/amana-tracking.ts` | Authenticated API route |
| `backend/scripts/test-amana-tracking.ts` | Offline unit checks |
| `src/utils/amanaTracking.ts` | Frontend helpers (gate icon, badge colors) |
| `src/utils/amanaTracking.test.ts` | Frontend unit tests |
| `src/components/orders/AmanaTrackingSheet.tsx` | Right-side tracking drawer |

## Files modified

| File | Change |
|------|--------|
| `backend/src/app.ts` | Mount `/api/amana-tracking` |
| `backend/package.json` | `test:amana-tracking` script |
| `src/hooks/useApi.ts` | `useAmanaTracking` + types |
| `src/pages/OrderManagement.tsx` | Truck action icon + sheet wiring (additive only) |

## API endpoint

```http
GET /api/amana-tracking/order/:orderId
Authorization: Bearer <jwt>

Query:
  refresh=1   # bypass 5-minute cache
```

Response shape:

```json
{
  "success": true,
  "data": {
    "trackingCode": "QD…MA",
    "carrier": "AMANA",
    "product": "AMANA E-commerce",
    "amount": 1300,
    "weight": 31,
    "destination": "…",
    "currentPosition": "…",
    "status": { "code": "IN_TRANSIT", "label": "In transit", "raw": "Envoi sorti…" },
    "lastUpdate": { "date": "2026-09-08", "time": "18:34" },
    "history": [ /* newest first */ ],
    "fetchedAt": "…",
    "cached": false
  }
}
```

## Data flow

```text
OM row Truck icon (AMANA + trackingCode only)
  → AmanaTrackingSheet opens
  → GET /api/amana-tracking/order/:id
  → verify order access + deliveryService name ~ /amana/i
  → GET https://bam-tracking.barid.ma/Tracking/Search?trackingCode=…
  → parse Html JSON field
  → normalize French statuses
  → cache 5 minutes by tracking code
  → drawer summary + timeline
```

## Status mapping

| Raw (FR) | Code | Label |
|----------|------|-------|
| Envoi arrivé à l'agence/centre | ARRIVED_AT_AGENCY | Arrived at agency |
| Envoi sorti de l'agence/centre | IN_TRANSIT | In transit |
| Envoi sorti par le facteur | OUT_FOR_DELIVERY | Out for delivery |
| *ème tentative de livraison | DELIVERY_ATTEMPT | Delivery attempt |
| Envoi à retourner… | RETURN_TO_SENDER | Returning to sender |
| Envoi retourné… | RETURNED_TO_SENDER | Returned to sender |
| Livraison effectuée | DELIVERED | Delivered |
| other | UNKNOWN | Unknown |

## Caching

- Backend in-memory Map, TTL **5 minutes**, key = uppercase tracking code
- Frontend React Query `staleTime` 5 minutes while drawer session is open
- Manual **Refresh** calls `?refresh=1` and replaces cache entry
- No preload on Order Management table load
- No continuous polling

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `AMANA_TRACKING_URL` | `https://bam-tracking.barid.ma/Tracking/Search` | Override upstream search URL |
| `AMANA_PROXY_URL` | _(optional)_ | Override the hardcoded Turnoxy proxy URL in `AmanaTrackingService` |

AMANA upstream HTTPS uses an HTTP `CONNECT` tunnel through the proxy (hardcoded Turnoxy Morocco credentials in `AmanaTrackingService`, overridable via `AMANA_PROXY_URL`).

## Limitations

- Upstream is an HTML/JSON scrape of the public BAM portal; layout changes can break parsing
- Identification of AMANA is by **delivery service name** (`/amana/i`), not a fixed id
- Read-only: does **not** change internal order status
- Cache is process-local (not shared across multiple backend instances)
- Network/timeouts/unavailable BAM portal surface as drawer error + Retry

## Verification

- `npm run test:amana-tracking` (backend) — PASS
- `npx vitest run src` — PASS
- `npm run build` — PASS
