# TASK 11 — Inventory Frontend Rebuild Report

**Date:** 2026-09-05  
**Status:** COMPLETE  
**Stop condition:** No cutover, no production stock changes, no TASK 12.

---

## Pages created

| Route | Page |
|-------|------|
| `/inventory` | Overview — KPIs, stock by location, pending actions, recent transfers/movements |
| `/inventory/stock` | Stock table + mobile cards + detail drawer |
| `/inventory/locations` | Warehouse / Showroom cards (read-only) |
| `/inventory/transfers` | Transfer list + create dialog |
| `/inventory/transfers/:id` | Transfer detail — timeline, lines, BS/BE, dispatch/receive/cancel |
| `/inventory/documents` | BS / BE list with tabs + filters |
| `/inventory/documents/:id` | Printable document view |
| `/inventory/history` | StockMovement ledger + detail sheet |

Existing routes kept: `/stock` (mattress), `/pillow-stock`, `/pillow-orders`, analytics, finance, etc.

---

## Components (reusable)

```text
src/features/inventory/
  components/
    InventoryLayout.tsx          — shared chrome + section tabs
    InventoryModeBanner.tsx      — LEGACY / uninitialized banners
    InventoryKpiCard.tsx
    InventoryEmptyState.tsx
    TransferStatusBadge.tsx
    TransferTimeline.tsx
    TransferFormDialog.tsx       — create transfer UX
    DispatchDialog.tsx           — confirm BS validation
    ReceiveDialog.tsx            — partial / full BE
    StockDetailDrawer.tsx
  api/inventoryApi.ts
  hooks/useInventoryQueries.ts
  types.ts
  utils/labels.ts
  utils/stockRows.ts
```

---

## API integration

| Client method | Backend |
|---------------|---------|
| `getMode` | `GET /api/inventory/mode` (**new read-only**) |
| `getLocations` | `GET /api/inventory/locations` |
| `getBalances` | `GET /api/inventory/balances` |
| `getMovements` | `GET /api/inventory/movements` |
| `getTransfers` / `getTransfer` | `GET /api/inventory/transfers` |
| `createTransfer` | `POST /api/inventory/transfers` |
| `dispatchTransfer` | `POST /api/inventory/transfers/:id/dispatch` |
| `receiveTransfer` | `POST /api/inventory/transfers/:id/receive` |
| `cancelTransfer` | `POST /api/inventory/transfers/:id/cancel` |
| `getDocuments` / `getDocument` | `GET /api/inventory/documents` |
| `getAccessories` | `GET /api/pillow-stock` (catalogue only) |

Mutations invalidate inventory + pillow-stock React Query keys. No optimistic stock mutation — server truth.

---

## UX flows

### Transfer creation
From / To / Reason → add accessoires with **Available at source** → block submit if qty &gt; available → create DRAFT → navigate to detail.

### Dispatch
DRAFT → **Validate Bon de Sortie** → confirmation lists lines and explains stock leaves source → becomes In Transit.

### Partial / final receipt
DISPATCHED / PARTIALLY_RECEIVED → **Receive Stock** → per-line remaining + receive-now → multiple BE documents listed on detail.

### Documents
Tabs All / BS / BE; detail is print-friendly with signature lines.

### Stock filtering
URL query `q` + `status` (available / low / out / reserved / in_transit); search debounced 300ms.

---

## Responsive

- Desktop: tables
- Mobile: stacked cards for stock, transfers, documents, history
- Inventory section tabs scroll horizontally on small screens
- Detail drawers/sheets for accessory and movement audit

---

## Permissions

- All `/inventory/*` routes: `ProtectedRoute adminOnly`
- Create / dispatch / receive / cancel: UI gated with `user.role === 'ADMIN'`
- Backend remains authoritative (admin middleware on mutations)

---

## Inventory mode / empty state

- `inventoryMode = LEGACY` → amber banner: system not active; legacy still in use
- Mode INVENTORY but `balanceCount = 0` → info banner: not initialized (0 ≠ company empty)
- Overview / Stock empty states avoid implying real zero stock pre-cutover

---

## Testing

### Frontend
```text
npm run build                          PASS
vitest inventory + existing unit tests PASS (11 tests)
```

### Backend regression
```text
test:inventory-service     PASS
test:writer-cutover        PASS
test:order-location        PASS
test:opening-inventory     PASS
test:legacy-migration      PASS
test:transfer-documents    PASS
test:inventory-transfers   PASS (39)
```

Production snapshot after regressions:

```text
inventoryMode = LEGACY
InventoryBalance = 0
StockMovement = 0
Pillow.stock SUM = 62
```

---

## Production confirmation

```text
NO PRODUCTION STOCK WAS MODIFIED
NO PRODUCTION CUTOVER WAS EXECUTED
inventoryMode remains LEGACY
```

Only backend addition: read-only `GET /api/inventory/mode` for the UI banner.

---

## Navigation

Sidebar group **Accessoires** → **Inventory** (`/inventory`).  
In-page tabs: Overview · Stock · Locations · Transfers · Documents · History.

Legacy `/pillow-stock` remains available for transitional supply/outgoing until cutover.

---

## Stop

TASK 11 complete. Do not execute opening inventory, switch mode, or start TASK 12 from this work.
