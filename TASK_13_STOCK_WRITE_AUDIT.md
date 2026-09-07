# TASK 13 — Stock Write Audit

**Date:** 2026-09-05  
**Scope:** Backend accessory (`Pillow`) stock mutation paths  
**Production at audit time:** `inventoryMode = LEGACY`, `InventoryBalance = 0`, `StockMovement = 0`, `Pillow.stock SUM = 62`

---

## Summary classification

| Classification | Meaning |
|---|---|
| **SAFE / MIRROR** | Allowed `Pillow.stock` write via `PillowStockMirror` only |
| **INVENTORY** | Mutates `InventoryBalance` + `StockMovement` (then mirror) |
| **LEGACY** | Direct `Pillow.stock` + `PillowStockHistory` when `inventoryMode = LEGACY` |
| **MODE-GATED** | Contains legacy writes, skipped when `inventoryMode = INVENTORY` |
| **TOOLING** | Cutover/migration scripts — not day-to-day business ops |
| **MUST REFACTOR** | Would be unsafe in INVENTORY if ungated — now gated or redirected |
| **OUT OF SCOPE** | Mattress `ProductVariant.stock` (not accessory inventory) |

**Desired INVENTORY-mode result:** no business direct `Pillow.stock` writes except compatibility mirror.

---

## DIRECT WRITES FOUND

### 1. PillowStockMirror — SAFE / MIRROR

| Field | Value |
|---|---|
| **File** | `backend/src/services/PillowStockMirror.ts` |
| **Function** | `syncPillowStockMirror` |
| **Route** | (called from InventoryService / cutover tooling) |
| **Domain** | Compatibility mirror |
| **Legacy or Inventory** | Inventory (mirror only) |
| **Current behavior** | Sets `Pillow.stock = Σ physical + open transfer in-transit` when balances exist |
| **Risk** | Low — single allowed writer for company stock mirror |
| **Required action** | Keep as sole business path to `Pillow.stock` in INVENTORY mode |

---

### 2. InventoryService — INVENTORY

| Field | Value |
|---|---|
| **File** | `backend/src/services/InventoryService.ts` |
| **Function** | `mutateBalance` / `increasePhysical` / `decreasePhysical` / `supply` / `adjustPhysical` / `setPresentation` / `setReserved` (+ InTx variants) |
| **Route** | Via `/api/inventory/*`, writers, transfers, reservations |
| **Domain** | Core inventory engine |
| **Legacy or Inventory** | Inventory |
| **Current behavior** | Locks balance (`SELECT … FOR UPDATE`), validates invariants, updates `InventoryBalance`, creates immutable `StockMovement`, optionally syncs mirror |
| **Risk** | Low — source of truth for INVENTORY mode |
| **Required action** | None — extended in TASK 13 with `supply`, `adjustPhysical`, presentation location rules |

---

### 3. AccessoryStockWriter — LEGACY / INVENTORY (mode-gated)

| Field | Value |
|---|---|
| **File** | `backend/src/services/AccessoryStockWriter.ts` |
| **Function** | `supply`, `outgoing`, `adjust`, `setPresentation` + `legacy*` |
| **Route** | `/api/pillow-stock/:id/supply\|outgoing\|adjust`; also usable by services |
| **Domain** | Dual-path accessory stock writer |
| **Legacy or Inventory** | Both |
| **Current behavior** | `LEGACY` → `Pillow.stock` + `PillowStockHistory`. `INVENTORY` → `InventoryService` only; **requires `locationId`** (`INVENTORY_LOCATION_REQUIRED`). No parallel legacy mutation in INVENTORY. |
| **Risk** | Was medium (unmigrated fallback to legacy in INVENTORY) — **fixed in TASK 13** |
| **Required action** | Done — strict mode gate |

---

### 4. pillow-stock routes — LEGACY / INVENTORY

| Field | Value |
|---|---|
| **File** | `backend/src/routes/pillow-stock.ts` |
| **Function** | `POST /`, `POST /:id/supply`, `POST /:id/outgoing`, `POST /:id/adjust` |
| **Route** | `/api/pillow-stock` |
| **Domain** | Accessory catalogue + stock ops (compat) |
| **Legacy or Inventory** | Both |
| **Current behavior** | Mutations via `AccessoryStockWriter`. Create pillow: LEGACY writes INITIAL history; INVENTORY creates stock 0 then optional `supply` with location. GET remains list/history compatible. |
| **Risk** | Low after writer hardening |
| **Required action** | Keep as compatibility endpoint (do not delete) |

---

### 5. pillow-orders routes — MODE-GATED (LEGACY)

| Field | Value |
|---|---|
| **File** | `backend/src/routes/pillow-orders.ts` |
| **Function** | Create / status transitions that deduct or restore |
| **Route** | `/api/pillow-orders` |
| **Domain** | Accessory orders |
| **Legacy or Inventory** | Legacy writes only when `inventoryMode === 'LEGACY'`; INVENTORY uses `ReservationService` |
| **Current behavior** | Direct `pillow.update({ stock })` + `PillowStockHistory` gated by mode |
| **Risk** | Low — explicit mode gate |
| **Required action** | None for TASK 13 |

---

### 6. orders routes (accessory deltas) — MODE-GATED (LEGACY)

| Field | Value |
|---|---|
| **File** | `backend/src/routes/orders.ts` |
| **Function** | `applyPillowStockChange` and related status/return paths |
| **Route** | `/api/orders` |
| **Domain** | Mattress orders with accessory lines |
| **Legacy or Inventory** | Legacy accessory writes skipped when `inventoryMode === 'INVENTORY'` (`OrderAccessoryInventory` / reservations) |
| **Current behavior** | Direct pillow stock deltas + history when LEGACY |
| **Risk** | Low — mode-gated |
| **Required action** | None for TASK 13 |

---

### 7. orders / stock routes — OUT OF SCOPE (mattress)

| Field | Value |
|---|---|
| **File** | `backend/src/routes/orders.ts`, `backend/src/routes/stock.ts`, `backend/src/routes/products.ts` |
| **Function** | `ProductVariant.stock` increment/decrement/update |
| **Route** | `/api/orders`, `/api/stock`, `/api/products` |
| **Domain** | Mattress variants |
| **Legacy or Inventory** | Separate stock domain |
| **Current behavior** | Mutates mattress variant stock |
| **Risk** | N/A for accessory cutover |
| **Required action** | Leave alone |

---

### 8. StockDocumentService — INVENTORY

| Field | Value |
|---|---|
| **File** | `backend/src/services/StockDocumentService.ts` |
| **Function** | BS/BE validation |
| **Route** | `/api/inventory/transfers/:id/dispatch\|receive` |
| **Domain** | Transfer documents |
| **Legacy or Inventory** | Inventory (mode-gated: LEGACY = documents only) |
| **Current behavior** | INVENTORY: `decreasePhysicalInTx` / `increasePhysicalInTx` + mirror |
| **Risk** | Low |
| **Required action** | None |

---

### 9. ReservationService / OrderAccessoryInventory — INVENTORY

| Field | Value |
|---|---|
| **File** | `backend/src/services/ReservationService.ts`, `OrderAccessoryInventory.ts` |
| **Function** | reserve / release / fulfill / return |
| **Route** | Order flows + `/api/inventory/reservations` |
| **Domain** | Order reservations |
| **Legacy or Inventory** | Inventory |
| **Current behavior** | Uses InventoryService; does not write `Pillow.stock` on reserve (fulfill/return update via mirror) |
| **Risk** | Low |
| **Required action** | None |

---

### 10. OpeningInventoryService — TOOLING

| Field | Value |
|---|---|
| **File** | `backend/src/services/OpeningInventoryService.ts` |
| **Function** | Opening cutover execute |
| **Route** | CLI scripts only |
| **Domain** | Clean cutover |
| **Legacy or Inventory** | Tooling |
| **Current behavior** | Creates balances/movements; may sync `Pillow.stock` |
| **Risk** | High if run on production prematurely |
| **Required action** | Do **not** execute on production in TASK 13 |

---

### 11. LegacyInventoryMigration — TOOLING

| Field | Value |
|---|---|
| **File** | `backend/src/services/LegacyInventoryMigration.ts` |
| **Function** | Legacy history → movements migration |
| **Route** | CLI scripts only |
| **Domain** | Historical migration |
| **Legacy or Inventory** | Tooling |
| **Current behavior** | Creates balances/movements from allocation plans |
| **Risk** | High if executed on production without plan |
| **Required action** | Do **not** execute on production in TASK 13 |

---

### 12. ReconciliationService — READ-ONLY

| Field | Value |
|---|---|
| **File** | `backend/src/services/ReconciliationService.ts` |
| **Function** | `reconcileInventory` |
| **Route** | `GET /api/inventory/reconciliation` |
| **Domain** | Audit / health |
| **Legacy or Inventory** | N/A (no writes) |
| **Current behavior** | Detects mirror mismatches, invalid balances, transfer/movement anomalies |
| **Risk** | None |
| **Required action** | None |

---

## StockMovement / InventoryBalance writers

Only these mutate balances/movements in application code:

1. `InventoryService` (runtime)
2. `OpeningInventoryService` (tooling)
3. `LegacyInventoryMigration` (tooling)

No route exposes edit/delete of `StockMovement`.

---

## `/api/pillow-stock` operation map

| Operation | Path | INVENTORY behavior |
|---|---|---|
| GET list | `GET /` | Compat list (`Pillow.stock` field retained as mirror/legacy) |
| GET history | history routes | Legacy `PillowStockHistory` (historical era) |
| SUPPLY | `POST /:id/supply` | → InventoryService via writer; location required |
| OUTGOING | `POST /:id/outgoing` | → InventoryService SALE; location required |
| ADJUSTMENT | `POST /:id/adjust` | → InventoryService adjust; location required |
| CREATE | `POST /` | stock 0 + optional location-aware supply |

Analytics: do **not** silently mix `PillowStockHistory` with `StockMovement`.

---

## INVENTORY MODE protection

```text
Business operation
  → InventoryService
  → InventoryBalance + StockMovement
  → PillowStockMirror
  → Pillow.stock
```

When `inventoryMode = INVENTORY`:

- `AccessoryStockWriter` never calls `legacySupply` / `legacyOutgoing` / `legacyAdjust`
- Order routes skip `applyPillowStockChange` / pillow-order deduct blocks
- Missing location → `INVENTORY_LOCATION_REQUIRED`

When `inventoryMode = LEGACY`:

- Existing Pillow.stock + PillowStockHistory behavior preserved

---

## Final classification tally

```text
DIRECT WRITES FOUND: yes (listed above)
SAFE / MIRROR: PillowStockMirror
LEGACY: AccessoryStockWriter.legacy*, pillow-orders (gated), orders accessories (gated), pillow-stock create (LEGACY)
INVENTORY: InventoryService, StockDocumentService, ReservationService, AccessoryStockWriter inventory path
MUST REFACTOR: none remaining for INVENTORY business paths (TASK 13 closed the unmigrated fallback)
TOOLING: OpeningInventoryService, LegacyInventoryMigration (not executed)
```
