# TASK 4 — IMPLEMENTATION REPORT

## StockMovement Ledger + InventoryService Foundation

**Date:** 2026-09-05  
**Status:** COMPLETE  

```
TASK 4 COMPLETE — STOCKMOVEMENT + INVENTORYSERVICE FOUNDATION ONLY
NO STOCK MIGRATION / NO LEGACY CUTOVER
```

---

## 1. Executive Summary

Implemented an immutable **`StockMovement`** ledger and a transactional **`InventoryService`** that mutates **`InventoryBalance`** safely under MySQL row locks.

The new engine runs **alongside** the legacy system. Existing routes (`/api/pillow-stock`, `/api/pillow-orders`, `/api/orders`) were **not** changed and still use `Pillow.stock`.

`SUM(Pillow.stock)` remained **62**. No INITIAL movements for legacy stock. Test artifacts cleaned up — production balances/movements counts stay **0**.

---

## 2. Files Changed

| File | Change |
|------|--------|
| `backend/prisma/schema.prisma` | `StockMovementType` enum + `StockMovement` model; relations on Pillow/Location/User |
| `backend/prisma/migrations/20260905124135_add_stock_movement/` | Additive migration |
| `backend/src/services/InventoryService.ts` | **New** — mutation engine |
| `backend/src/routes/inventory.ts` | Added read-only `GET /movements` |
| `backend/scripts/test-inventory-service.ts` | **New** — Tests 1–9 + concurrency |
| `backend/scripts/pillow-stock-snapshot.ts` | Includes `stock_movement_count` |
| `backend/package.json` | `test:inventory-service` script |
| `src/hooks/useApi.ts` | `useStockMovements` hook (unused by pages) |

**Not modified:** pillow-stock, pillow-orders, orders mutation logic; PillowStock / PillowOrders / analytics UI.

---

## 3. Prisma Schema

### Enum `StockMovementType`

```
INITIAL | SUPPLY | SALE | RESERVATION | RELEASE | RETURN | ADJUSTMENT | TRANSFER_OUT | TRANSFER_IN
```

### Model `StockMovement`

- `pillowId`, `locationId`, `type`, `quantity`
- Before/after: `previousPhysical` / `newPhysical`, presentation, reserved
- Audit: `reason`, `referenceType`, `referenceId`, `referenceNumber`, `userId?`
- `createdAt` only (no `updatedAt`)
- FKs: Pillow/Location `Restrict`; User `SetNull`
- Indexes: pillow, location, type, createdAt, (referenceType, referenceId), (pillowId, locationId, createdAt), userId

**No `available` column** anywhere — still computed.

---

## 4. Migration

**Name:** `20260905124135_add_stock_movement`

**DB changes:** CREATE `StockMovement` + enum + indexes + FKs only.

**Confirmed not touched:** `Pillow.stock`, `PillowStockHistory`, orders, pillow orders, InventoryBalance data.

---

## 5. Ledger Semantics

| Convention | Meaning |
|------------|---------|
| `quantity > 0` | Physical increase **or** positive delta for reserved/presentation-only ops |
| `quantity < 0` | Physical decrease **or** negative reserved/presentation delta |
| Physical ops | `SUPPLY` / `SALE` / `RETURN` / `TRANSFER_*` / `INITIAL` — physical changes |
| `RESERVATION` / `RELEASE` | Reserved changes; physical unchanged |
| `ADJUSTMENT` | Presentation changes (and future corrections) |

**Immutability:** No PATCH/PUT/DELETE routes for movements. Corrections = compensating movements only.

**References:** `referenceType` / `referenceId` / `referenceNumber` ready for ORDER, PILLOW_ORDER, TRANSFER, STOCK_DOCUMENT later.

---

## 6. InventoryService

**Path:** `backend/src/services/InventoryService.ts`

### Public methods

| Method | Behavior |
|--------|----------|
| `getBalance(pillowId, locationId)` | Read snapshot + computed `available` |
| `computeAvailable(...)` | `physical - presentation - reserved` |
| `increasePhysical(...)` | `quantity > 0`; physical += qty |
| `decreasePhysical(...)` | Rejects if qty > available |
| `setPresentation(...)` | Absolute; `0 <= p <= physical - reserved`; type default `ADJUSTMENT` |
| `setReserved(...)` | Absolute; `0 <= r <= physical - presentation`; type `RESERVATION` or `RELEASE` by delta |

### Domain errors (`InventoryError.code`)

- `INVALID_QUANTITY`
- `INSUFFICIENT_AVAILABLE_STOCK`
- `PRESENTATION_EXCEEDS_AVAILABLE_PHYSICAL` / `PRESENTATION_EXCEEDS_PHYSICAL`
- `RESERVED_EXCEEDS_AVAILABLE`
- `NEGATIVE_STOCK_NOT_ALLOWED`
- `INVENTORY_BALANCE_NOT_FOUND`

Helper: `inventoryErrorToHttp` for future route wiring.

**Not wired** to production stock/order routes.

---

## 7. Transaction Strategy (MySQL + Prisma 5)

Atomic unit per mutation:

```
$transaction
  → SELECT … FROM InventoryBalance WHERE pillowId=? AND locationId=? FOR UPDATE
  → if missing: CREATE 0/0/0 (catch P2002 on race) → FOR UPDATE again
  → validate + compute new state
  → UPDATE InventoryBalance
  → INSERT StockMovement
  → COMMIT (or ROLLBACK on any error)
```

**Concurrency:**

- Row lock via `$queryRaw` `FOR UPDATE` inside interactive transaction
- Unique `(pillowId, locationId)` prevents duplicate balances
- Concurrent creates: P2002 → re-lock winner row
- Concurrent increases (+5 and +7 from 10) verified → **22** with 2 movements

Does **not** dual-write `Pillow.stock` (by design for TASK 4).

---

## 8. Validation Rules

After every successful mutation:

```
physical >= 0
presentation >= 0
reserved >= 0
presentation <= physical
reserved <= physical - presentation
available = physical - presentation - reserved >= 0
```

Failures throw — **no silent clamping**.

---

## 9. APIs

| Endpoint | Notes |
|----------|-------|
| `GET /api/inventory/balances` | Unchanged contract (TASK 3) |
| `GET /api/inventory/locations` | Unchanged |
| `GET /api/inventory/movements` | **New** read-only; filters: pillowId, locationId, type, referenceType, referenceId, limit≤200 |

**No** POST/PATCH/PUT/DELETE on inventory router (verified by Test 7).

---

## 10. Tests

Command: `npm run test:inventory-service`

| Test | Result |
|------|--------|
| 1 Increase 0→10 + 1 movement | PASS |
| 2 Decrease 10→6 + movement | PASS |
| 3 Decrease beyond available fails; no movement | PASS |
| 4 Presentation 8 with max 7 fails | PASS |
| 5 Reserve 8 OK; reserve 9 fails | PASS |
| 6 Forced throw after balance → full rollback | PASS |
| 7 No mutating inventory routes | PASS |
| 8 Concurrent create → one balance row | PASS |
| Concurrency 10+5+7→22, 3 movements | PASS |
| 9 Legacy SUM(stock)/history unchanged; cleanup | PASS |

Frontend Vitest (available formula + row selection): PASS.

---

## 11. Before / After Database Validation

| Metric | Before | After (post-tests) |
|--------|--------|---------------------|
| COUNT(Pillow) | 2 | 2 |
| SUM(Pillow.stock) | **62** | **62** |
| COUNT(PillowStockHistory) | 11 | 11 |
| COUNT(Location) | 2 | 2 |
| COUNT(InventoryBalance) | 0 | **0** |
| COUNT(StockMovement) | 0 (n/a→0) | **0** |

---

## 12. Regression Check

| Area | Status |
|------|--------|
| PillowStock / pillow-stock routes | Unchanged |
| PillowOrders | Unchanged |
| Mattress orders | Unchanged |
| Analytics | Unchanged |
| Locations WH-MAIN / SR-MAIN | Intact |
| InventoryBalance operational stock | Still empty (no migration) |
| Frontend build | SUCCESS |
| Backend tsc new errors | **None** |

---

## 13. Pre-existing Issues

**PRE-EXISTING** (not fixed):

```
orders.ts — limitNum possibly undefined
users.ts — null vs number
```

**INTRODUCED BY TASK 4:** none.

---

## 14. Risks

1. **Dual state:** legacy `Pillow.stock` vs empty `InventoryBalance` — totals will diverge until a controlled migration.  
2. **Not production-wired:** accidental direct use of InventoryService without cutover plan could confuse operators.  
3. **Test hook** `__testThrowAfterBalanceUpdate` must never be used in production callers.  
4. Future cutover must dual-write or migrate carefully with reconciliation.  
5. Transfer types exist in enum only — no transfer engine yet.

---

## 15. Explicit Non-Goals (confirmed NOT done)

- [x] Stock migration / redistribution of 62 units  
- [x] INITIAL movements for legacy stock  
- [x] Changing Pillow.stock writers  
- [x] Cutover pillow-stock / pillow-orders / orders  
- [x] Transfer / BS / BE  
- [x] Reservation workflow (only primitive `setReserved`)  
- [x] Fulfillment / returns flows  
- [x] Analytics migration  
- [x] Inventory UI  

---

## 16. Recommendation for TASK 5

**Safest next step (pick one after business decision):**

**Option A (recommended if counts unknown):** Continue foundation — DocumentSequence + Transfer draft models **without** stock effects, still no migration.

**Option B (if business confirms 100% → Warehouse):** Idempotent, dry-run-first script:

1. Backup + snapshot  
2. For each Pillow: `InventoryBalance(WH-MAIN).physical = Pillow.stock` + `INITIAL` movement  
3. Reconcile `SUM(physical) == SUM(Pillow.stock)`  
4. Still **do not** cut over order writers yet  

Do **not** invent Showroom splits without a physical count.

---

## Final Safety Checklist

- [x] StockMovement + enum  
- [x] Immutable ledger (no mutation API)  
- [x] InventoryService transactional  
- [x] Concurrent balance create safe  
- [x] Negative available / presentation / reserved blocked  
- [x] Available not stored  
- [x] Balances API intact  
- [x] No legacy route cutover  
- [x] No Pillow.stock / history change  
- [x] No stock migration  
- [x] Tests pass + cleanup  
- [x] Frontend build OK  
- [x] Report created  

**STOP — awaiting approval before TASK 5.**
