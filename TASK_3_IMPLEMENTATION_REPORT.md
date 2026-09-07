# TASK 3 — IMPLEMENTATION REPORT

## Inventory Balance Foundation + Migration Preview

**Date:** 2026-09-05  
**Status:** COMPLETE  

```
TASK 3 COMPLETE — INVENTORY BALANCE FOUNDATION ONLY
NO STOCK MIGRATION / REDISTRIBUTION PERFORMED
```

---

## 1. Executive Summary

Implemented the **InventoryBalance** foundation: one row per `(Pillow, Location)` with `physical`, `presentation`, and `reserved`.  

`available` is **computed only** (`physical - presentation - reserved`) — not stored.

**Pillow.stock remains the operational source of truth.** No stock was assigned to Warehouse/Showroom. The `InventoryBalance` table is empty (`0` rows). A read-only preview script documents what a future migration would look like without writing data.

---

## 2. Files Changed

| File | Change |
|------|--------|
| `backend/prisma/schema.prisma` | Added `InventoryBalance`; relations on `Pillow` + `Location` |
| `backend/prisma/migrations/20260905123449_add_inventory_balance/migration.sql` | Additive CREATE TABLE + FKs |
| `backend/src/utils/inventory-balance.ts` | **New** — `computeAvailable()` |
| `backend/src/routes/inventory.ts` | Added `GET /balances` |
| `backend/scripts/inventory-balance-preview.ts` | **New** — read-only migration preview |
| `backend/scripts/test-inventory-balance.ts` | **New** — TASK 3 script checks |
| `backend/scripts/pillow-stock-snapshot.ts` | Extended with location + balance counts |
| `backend/package.json` | Scripts `inventory:preview`, `test:inventory-balance` |
| `src/hooks/useApi.ts` | Added `useInventoryBalances()` |
| `src/utils/inventory-available.test.ts` | **New** — Vitest for available formula |

**Not modified:** pillow-stock / pillow-orders / orders mutation routes, analytics, PillowStock UI pages.

---

## 3. Prisma Changes

### Model `InventoryBalance`

```prisma
model InventoryBalance {
  id           Int      @id @default(autoincrement())
  pillowId     Int
  locationId   Int
  physical     Int      @default(0)
  presentation Int      @default(0)
  reserved     Int      @default(0)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  pillow   Pillow   @relation(..., onDelete: Restrict)
  location Location @relation(..., onDelete: Restrict)

  @@unique([pillowId, locationId])
  @@index([pillowId])
  @@index([locationId])
  @@index([locationId, pillowId])
}
```

### Relations added

- `Pillow.inventoryBalances InventoryBalance[]`
- `Location.inventoryBalances InventoryBalance[]`

### Explicitly NOT added

- `available` column  
- StockMovement / Transfer / Reservation models  
- Any seed that copies `Pillow.stock` into balances  

### Invariants (documented; enforced by future InventoryService)

```
presentation <= physical
reserved <= physical - presentation
available = physical - presentation - reserved >= 0
```

MySQL CHECK not added (Prisma/MySQL version caution from TASK 1/3 spec).

---

## 4. Migration

**Name:** `20260905123449_add_inventory_balance`

**Changes:**

- `CREATE TABLE InventoryBalance`
- Unique `(pillowId, locationId)`
- Indexes as designed
- FKs to `Pillow` and `Location` with `ON DELETE RESTRICT`

**Confirmation:** Migration SQL does **not** ALTER/UPDATE `Pillow`, `Pillow.stock`, or `PillowStockHistory`. No data inserts.

---

## 5. API

```
GET /api/inventory/balances
```

- Auth: `authMiddleware`
- Optional filters: `?pillowId=` and/or `?locationId=`
- Read-only — no POST/PATCH/DELETE

**Response item shape:**

```json
{
  "id": 1,
  "pillow": { "id": 1, "name": "..." },
  "location": { "id": 1, "code": "WH-MAIN", "name": "...", "type": "WAREHOUSE" },
  "physical": 0,
  "presentation": 0,
  "reserved": 0,
  "available": 0,
  "createdAt": "...",
  "updatedAt": "..."
}
```

`available` is computed in the route via `computeAvailable()`.

Current DB returns `[]` (no balance rows yet) — expected.

Existing: `GET /api/inventory/locations` unchanged.

---

## 6. Preview Script

```
npm run inventory:preview
→ ts-node scripts/inventory-balance-preview.ts
```

- Reads pillows + locations + existing balances  
- Prints legacy `Pillow.stock` vs WH/SR zeros  
- States `Proposed physical allocation: NOT ASSIGNED`  
- **No create/update/delete** on inventory or Pillow  

Verified output for live data (legacy total **62**, balances empty).

---

## 7. Frontend

- Added `useInventoryBalances({ pillowId?, locationId? })` in `useApi.ts`
- **Unused** by pages — PillowStock / Orders / Analytics UI untouched
- `Pillow.stock` still drives existing screens

---

## 8. Tests

| Test | Result |
|------|--------|
| **A** Unique `(pillowId, locationId)` → P2002 | PASS (`npm run test:inventory-balance`) |
| **B** `computeAvailable(10,2,3) === 5` | PASS (script + Vitest) |
| **C** Read path does not mutate DB | PASS |
| **D** Pillow.stock / history unchanged by migrate | PASS (before/after §9) |
| **E** Locations WH-MAIN / SR-MAIN, count = 2 | PASS |
| Vitest `inventory-available.test.ts` | PASS (2 tests) |
| Vitest `useRowSelection.test.ts` | PASS (3 tests) |

---

## 9. Before / After Database Validation

| Metric | Before | After |
|--------|--------|-------|
| `COUNT(Pillow)` | 2 | 2 |
| `SUM(Pillow.stock)` | **62** | **62** |
| `COUNT(PillowStockHistory)` | 11 | 11 |
| `COUNT(Location)` | 2 | 2 |
| `COUNT(InventoryBalance)` | n/a (table absent) | **0** |

**SUM(Pillow.stock) identical — no redistribution.**

---

## 10. Regression Check

| Area | Status |
|------|--------|
| PillowStock routes/UI | Unchanged |
| PillowOrders | Unchanged |
| Mattress orders | Unchanged |
| Analytics | Unchanged |
| Location system | Intact (2 locations, no dupes) |
| Frontend build | SUCCESS |
| Backend `tsc` | Same pre-existing failures only (§11) |
| New TASK 3 TS errors | **None** |

---

## 11. Pre-existing Issues

**PRE-EXISTING** (unchanged from TASK 2; not fixed in TASK 3):

```
src/routes/orders.ts — limitNum possibly undefined (TS18048)
src/routes/users.ts — number | null vs number (TS2345)
```

**INTRODUCED BY TASK 3:** none.

---

## 12. Risks / Decisions

1. **Physical Warehouse/Showroom split is still unknown** — balances intentionally empty; do not guess.  
2. Until a later cutover, `InventoryBalance` totals will **not** match `Pillow.stock` — expected dual-state.  
3. Empty balances mean `GET /balances` returns `[]` until TASK 4+ creates rows intentionally.  
4. Presentation/reserved invariants not DB-enforced yet — deferred to InventoryService.  
5. Unique-constraint test uses transactional rollback / P2002 — no lasting balance rows left.

---

## 13. Explicit Non-Goals (confirmed NOT done)

- [x] Stock migration / redistribution  
- [x] StockMovement  
- [x] Transfer / Bon de Sortie / Bon d’Entrée  
- [x] Reservation / Fulfillment / Returns  
- [x] Order / PillowOrder stock cutover  
- [x] Analytics migration  
- [x] Mutation endpoints for inventory  
- [x] Storing `available`  
- [x] Changing `Pillow.stock` writers  

---

## 14. Recommendation for TASK 4

**Safest next step:** introduce **StockMovement ledger + dual-write helpers** (or InventoryService skeleton) **without** migrating `Pillow.stock` yet — OR a controlled, **idempotent, operator-approved** “assign legacy stock → WH-MAIN” migration script with dry-run + reconciliation (`SUM(physical)+inTransit == SUM(Pillow.stock)`).

Do **not** invent Showroom splits without a physical count. Prefer:

1. Confirm business decision: 100% legacy → `WH-MAIN` physical  
2. Idempotent script with backup + before/after reconciliation  
3. Keep `Pillow.stock` mirror updated only after that decision  

---

## Final Safety Checklist

- [x] No Pillow.stock changed  
- [x] No PillowStockHistory changed  
- [x] No PillowOrder / mattress / analytics behavior changed  
- [x] No location duplicates  
- [x] No stock redistributed  
- [x] No StockMovement / Transfer / BS/BE / Reservation  
- [x] No stock mutation endpoint  
- [x] `available` not stored  
- [x] `(pillowId, locationId)` unique  
- [x] Migration additive  
- [x] Frontend build OK; new errors fixed (none)  
- [x] Report created  

**STOP — awaiting approval before TASK 4.**
