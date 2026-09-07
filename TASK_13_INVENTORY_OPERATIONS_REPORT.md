# TASK 13 — Inventory Operations Report

**Date:** 2026-09-05  
**Status:** COMPLETE  
**Stop condition:** No opening inventory, no mode switch, no TASK 14

---

## Production safety (verified)

```text
NO PRODUCTION STOCK MODIFIED
NO PRODUCTION CUTOVER
inventoryMode = LEGACY
InventoryBalance = 0
StockMovement = 0
Pillow.stock SUM = 62
Reservation = 0
Transfer = 0
```

All mutation tests used isolated temporary pillows and cleaned up.

---

## New / hardened operations

### Supply — `InventoryService.supply()`

- Inputs: `pillowId`, `locationId`, `quantity`, `reason`, `userId`, optional reference
- Rules: `quantity > 0`, active location, reason required
- Effect: `physical += quantity`, movement `type = SUPPLY`, mirror sync (`forceSyncMirror`)
- Missing location (writer/API): `INVENTORY_LOCATION_REQUIRED`
- No automatic location default

### Adjustment — `InventoryService.adjustPhysical()`

- Signed `delta` (project convention)
- Reason required (`REASON_REQUIRED`)
- Movement `type = ADJUSTMENT` with before/after physical
- Rejects: negative physical, presentation > physical, reserved overflow
- Does **not** auto-fix presentation/reserved

### Presentation — `InventoryService.setPresentation()` (hardened)

- Only locations with `allowsPresentation = true` (Showroom)
- Warehouse with `presentation > 0` → `PRESENTATION_NOT_ALLOWED`
- Physical unchanged; `Pillow.stock` mirror skipped (`skipMirrorSync`)
- Movement `type = ADJUSTMENT` with reason `PRESENTATION_ALLOCATION` / `PRESENTATION_RELEASE`
- Before/after presentation stored on movement

### Mode gate — `AccessoryStockWriter`

- `INVENTORY` → always InventoryService (no legacy fallback for unmigrated pillows)
- `LEGACY` → unchanged Pillow.stock + PillowStockHistory paths
- Added `adjust` + `setPresentation` on writer

---

## Reconciliation

**Service:** `ReconciliationService.reconcileInventory()` (read-only)

**API:** `GET /api/inventory/reconciliation` (ADMIN)

Detects:

- `PHYSICAL_MIRROR_MISMATCH` — `Pillow.stock` ≠ company physical (+ in-transit)
- Invalid balances (negative, presentation/reserved invariants, presentation on non-showroom)
- Transfer `received > sent`
- Obvious movement quantity inconsistencies

Never mutates or auto-repairs.

**UI:** Inventory → Reconciliation — “System Healthy” or inconsistency list. No “Fix Everything”.

---

## Permissions

Existing roles only (`ADMIN` via `adminOnly` + inventory `ProtectedRoute adminOnly`).

| Operation | Backend | Frontend |
|---|---|---|
| Supply | ADMIN | Admin actions when `mode=INVENTORY` && initialized |
| Adjustment | ADMIN | Same |
| Presentation | ADMIN | Showroom detail only |
| Reconciliation | ADMIN | Reconciliation tab |

Backend enforces; UI only reflects.

---

## Concurrency & atomicity

All InventoryService mutations:

```text
Prisma transaction + SELECT … FOR UPDATE on InventoryBalance
→ validate → update balance → create StockMovement → mirror → commit
```

Failure → full rollback (`__testThrowAfterBalanceUpdate` covered in tests).

---

## API layer

```text
POST /api/inventory/supply
POST /api/inventory/adjust
POST /api/inventory/presentation
GET  /api/inventory/reconciliation
```

Frontend centralized:

```text
inventoryApi.supply()
inventoryApi.adjust()
inventoryApi.setPresentation()
inventoryApi.reconcile()
```

Compat retained:

```text
POST /api/pillow-stock/:id/supply|outgoing|adjust
```

---

## Inventory UI

- Stock page: Add Stock / Adjustment (admin, INVENTORY mode)
- Stock detail drawer:
  - Warehouse: Add, Adjust, Transfer
  - Showroom: Add, Adjust, Presentation, Transfer
- Confirmation copy for supply (“N units will be added to … physical stock”)
- Adjustment shows before/after physical
- Presentation validates `0 ≤ presentation ≤ physical` client-side; server authoritative
- Mutations invalidate inventory queries (no optimistic stock edits)
- Reconciliation page added

---

## Mirror consistency

In INVENTORY mode after supply/adjust:

```text
Pillow.stock = SUM(InventoryBalance.physical) + open transfer residual
```

Presentation does not change the mirror.

---

## Tests

Script: `backend/scripts/test-inventory-operations.ts`  
Command: `npm run test:inventory-operations`

| Area | Result |
|---|---|
| Supply 1–8 | PASS |
| Adjustment 9–15 | PASS |
| Presentation 16–22 | PASS |
| Concurrency 23–25 | PASS |
| Mirror 26–28 | PASS |
| Legacy 29–30 | PASS |
| Reconciliation 31–33 | PASS |

### Full regression

| Command | Result |
|---|---|
| `test:inventory-service` | PASS |
| `test:writer-cutover` | PASS |
| `test:order-location` | PASS |
| `test:opening-inventory` | PASS |
| `test:legacy-migration` | PASS |
| `test:transfer-documents` | PASS |
| `test:inventory-transfers` | PASS |
| `test:order-inventory` | PASS |
| `test:inventory-operations` | PASS |
| Frontend `npm run build` | PASS |

---

## Acceptance checklist

```text
✓ All stock write paths audited
✓ Direct Pillow.stock writes classified
✓ Inventory mode protected from legacy mutations
✓ Supply is location-aware
✓ Adjustment is location-aware
✓ Presentation is location-aware
✓ All operations transactional
✓ All operations concurrency-safe
✓ StockMovement audit exists
✓ Pillow.stock is mirror only (INVENTORY)
✓ Reconciliation is read-only
✓ Inventory UI supports operations
✓ Legacy mode remains functional
✓ All tests PASS
✓ Production untouched
```

---

## STOP

TASK 13 complete. Do **not**:

- execute opening inventory
- switch `inventoryMode`
- modify production stock/orders
- execute production transfers
- start TASK 14
