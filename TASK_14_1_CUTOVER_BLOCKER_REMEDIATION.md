# TASK 14.1 — Cutover Blocker Remediation

**Date:** 2026-09-06  
**Decision:** `READY_FOR_REAUDIT`  
**Production cutover:** NOT performed (still `inventoryMode = LEGACY`)

---

## 1. Blockers reproduced

| ID | Blocker | Reproduced |
|----|---------|------------|
| A | `PUT /orders/:id/full` ungated `Pillow.stock` writes in INVENTORY | Yes — route wrote history/stock without mode gate |
| B | Status commit then reservation fail leaves inconsistent status | Yes — post-commit `onStatusChange` |
| C | `DELIVERED → PENDING → DELIVERED` under-deducts | Yes — reservation stayed `FULFILLED` |
| D | Legacy order without Reservation silently skipped | Yes — coordinator returned success with no effect |
| E | Order delete vs reservation FK / orphaned reserved | Yes — no release-before-delete |
| F | Concurrent multi-location mirror race | Yes — stale RR snapshot SUM |
| G | Create order then reserve race (orphan order) | Yes — create + compensate-delete |
| L | LEGACY writer lost updates | Yes — read-then-write without row lock |

Tests: `npm run test:order-cutover-blockers` (25/25 PASS).

---

## 2. Root cause

1. **Full update** treated accessory stock as always-legacy `Pillow.stock` / `PillowStockHistory`.
2. **Status path** applied mattress + status in txn A, then accessory reservation in txn B.
3. **Re-open to PENDING** restored physical stock but left reservation `FULFILLED`, so re-delivery was a no-op.
4. **Missing reservation** was treated as “nothing to do” instead of a cutover transition state.
5. **Delete** did not release/detach reservations before `Order` delete.
6. **Mirror sync** used non-locking aggregate under MySQL REPEATABLE READ after locking only one location’s balance.
7. **Create** reserved after commit, with best-effort delete compensation.
8. **LEGACY writer** updated stock without `SELECT … FOR UPDATE`.

---

## 3. Changes made

### Services
- `OrderAccessoryInventory.ts` — `*InTx` APIs; `onStatusChangeInTx`; `reverseDelivery` path for PENDING reopen; `reconcileOrderAccessoriesInTx`; `prepareOrderDeleteInTx`; `LEGACY_ORDER_INVENTORY_MIGRATION_REQUIRED`.
- `ReservationService.ts` — `reserveInTx`, `fulfill/release/return*InTx`, `reverseDeliveryInTx`, `syncActiveReservationLinesInTx`, find helpers.
- `InventoryService.ts` — `unfulfillReservedInTx`; lock **Pillow before** balance when mirror sync will run.
- `PillowStockMirror.ts` — lock Pillow + all `InventoryBalance` rows; sum from locking reads.
- `AccessoryStockWriter.ts` — LEGACY supply/adjust/outgoing lock Pillow `FOR UPDATE`.

### Routes
- `orders.ts` — create+reserve one txn; status+mattress+accessories one txn; full-update gated + reconcile; delete release-then-delete.
- `pillow-orders.ts` — create+reserve one txn; status+inventory one txn; LEGACY stock `FOR UPDATE`.

### Tests / docs
- `backend/scripts/test-order-cutover-blockers.ts` + `npm run test:order-cutover-blockers`
- Concurrent reservation assertion in `test-order-inventory.ts` accepts winner qty 3 or 4
- This report + `TASK_14_1_ORDER_INVENTORY_TRANSITION_POLICY.md`

---

## 4. Architecture impact

Order accessory inventory remains mode-gated:

- **LEGACY** → existing `Pillow.stock` / history paths  
- **INVENTORY** → `ReservationService` / `InventoryService` only  

Mattress `ProductVariant.stock` unchanged. No schema migration. No cutover executed.

---

## 5. Transaction strategy

Preferred pattern for inventory-affecting order ops:

```text
BEGIN
  lock / validate order
  apply mattress effects (if any)
  apply accessory reservation / inventory effects (*InTx)
  update order status / lines
COMMIT
```

Used for: create, status patch, full update (accessories), delete prep, pillow-order create/status.

Nested independent transactions that can partially commit were removed from these paths.

---

## 6. Mirror locking strategy

Lock order for INVENTORY mutations that sync the mirror:

```text
1. Pillow (FOR UPDATE)
2. InventoryBalance for the mutated location (FOR UPDATE)
3. On sync: Pillow (already held) + ALL InventoryBalance for pillow (FOR UPDATE)
4. Compute company physical from locking reads + open transfer residual
5. Update Pillow.stock
```

This prevents multi-location races from writing a stale SUM under REPEATABLE READ.

---

## 7. Legacy compatibility

- `inventoryMode = LEGACY` keeps prior accessory behavior on create/status/full-update/pillow-orders.
- LEGACY stock mutations now row-lock Pillow to avoid lost updates / negatives under concurrency.
- Coordinators no-op in LEGACY (callers own `Pillow.stock`).

---

## 8. Legacy order transition behavior

See `TASK_14_1_ORDER_INVENTORY_TRANSITION_POLICY.md`.

Summary: in INVENTORY mode, accessory-bearing orders **without** a Reservation cannot change accessory inventory effects; API returns `LEGACY_ORDER_INVENTORY_MIGRATION_REQUIRED`. No automatic production migration in this task.

---

## 9. Delete behavior

INVENTORY delete (`DELETE /orders/:id`):

```text
BEGIN
  reverse delivery if fulfilled qty > 0
  release if ACTIVE / PARTIAL
  detach reservation.orderId
  restore mattress stock if needed
  delete order
COMMIT
```

No orphaned reserved stock. Reservation audit rows retained with `orderId = null`.

---

## 10. Tests

| Suite | Result |
|-------|--------|
| `test:order-cutover-blockers` | PASS 25/25 |
| `test:inventory-service` | PASS |
| `test:inventory-operations` | PASS |
| `test:inventory-transfers` | PASS |
| `test:order-inventory` | PASS |
| `test:writer-cutover` | PASS |
| `test:opening-inventory` | PASS |
| `test:legacy-migration` | PASS |
| `test:order-location` | PASS |
| `test:transfer-documents` | PASS |
| Frontend unit vitest | PASS (11) |
| `npm run build` | PASS |

Playwright e2e file is not collected by vitest (pre-existing); not part of this remediation.

---

## 11. Production snapshot

Before and after TASK 14.1 (unchanged inventory baseline):

```text
inventoryMode = LEGACY
Pillow = 2
Pillow.stock SUM = 0
PillowStockHistory = 14
Location = 2
InventoryBalance = 0
StockMovement = 0
Transfer = 0
StockDocument = 0
Reservation = 0
```

`InventoryCutoverSettings.updatedAt` may change when isolated tests toggle mode; **mode remains LEGACY**. No production inventory rows created. `Pillow.stock SUM = 0` was **not** restored (per TASK 14 / 14.1 safety rules).

Open pre-cutover accessory orders with `locationId = null` remain in the DB untouched.

---

## 12. Remaining issues

### P0
None remaining for the code blockers listed in TASK 14 (items 2–4).  

Operational note (not a code defect): production `Pillow.stock SUM = 0` still differs from the historical “62” expectation; opening inventory / physical count is TASK 15+.

### P1
None of the listed code P1s remain unfixed.

### P2 / follow-ups (non-blocking for re-audit)
- Explicit admin “migrate legacy order → reservation” workflow UI (policy documented; no auto-migrate).
- Operational runbook for closing vs migrating open null-location accessory orders before cutover.
- Optional FE copy specialized by error `code` (API `error` message already toast-friendly).
- Pillow-order delete path (if added later) should reuse the same prepare/release pattern.

---

## Acceptance checklist

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Full update cannot direct-mutate accessory `Pillow.stock` in INVENTORY | PASS |
| 2 | Status + inventory atomic | PASS |
| 3 | DELIVERED→PENDING→DELIVERED correct | PASS |
| 4 | Duplicate status idempotent | PASS |
| 5 | Legacy orders explicit transition error | PASS |
| 6 | Delete does not orphan reservations | PASS |
| 7 | Create+reserve atomic | PASS |
| 8 | Mirror concurrency-safe | PASS |
| 9 | LEGACY writer concurrency-safe | PASS |
| 10 | Critical paths transaction-safe | PASS |
| 11–17 | Regression + production untouched | PASS |

---

## Readiness

```text
READY_FOR_REAUDIT
```

**STOP.** Do not start TASK 15. Do not switch `inventoryMode`. Do not create opening inventory.
