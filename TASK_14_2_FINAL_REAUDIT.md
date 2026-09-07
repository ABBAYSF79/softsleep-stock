# TASK 14.2 — Final Inventory Re-Audit

**Date:** 2026-09-06  
**Scope:** Read-only audit + isolated tests after TASK 14.1  
**Cutover / opening inventory / mode switch:** NOT performed  

---

## 1. Executive Summary

TASK 14.1 code fixes were verified against current source and the full inventory test suite.

All former P0/P1 **code** blockers remain fixed. Production inventory tables stay empty and `inventoryMode = LEGACY`. Open pre-cutover accessory orders are enumerated and gated by `LEGACY_ORDER_INVENTORY_MIGRATION_REQUIRED` (no silent skip).

```text
READY_FOR_CUTOVER_PREPARATION
```

P0: **0** · P1: **0** · P2: **4** (operational / UX debt for TASK 15+)

---

## 2. Production Snapshot

### BEFORE tests

| Metric | Value |
|--------|-------|
| inventoryMode | LEGACY |
| Pillow | 2 |
| Pillow.stock SUM | 0 |
| PillowStockHistory | 14 |
| Location | 2 |
| InventoryBalance | 0 |
| StockMovement | 0 |
| Transfer / TransferLine | 0 / 0 |
| StockDocument / Line | 0 / 0 |
| Reservation / Line | 0 / 0 |
| Order | 1376 |
| PillowOrder | 4 |
| OrderPillowItem | 4 |
| PillowOrderItem | 5 |

### AFTER tests

Identical inventory baseline (mode LEGACY; balances/movements/transfers/docs/reservations = 0; Pillow=2; stock SUM=0; history=14).

`InventoryCutoverSettings.updatedAt` may change when isolated tests toggle mode temporarily; **mode remains LEGACY**. No production inventory rows created. Stock SUM was **not** restored to 62.

---

## 3. P0 Re-Audit

| Former P0 | Status | Evidence |
|-----------|--------|----------|
| Full update ungated Pillow.stock in INVENTORY | **FIXED** | `orders.ts` `skipLegacyAccessoryStock` + `reconcileOrderAccessoriesInTx` |
| Status then reservation (partial commit) | **FIXED** | `onStatusChangeInTx` inside same `$transaction` as status/mattress |
| DELIVERED→PENDING→DELIVERED under-deduct | **FIXED** | `reverseDeliveryInTx` → ACTIVE → re-fulfill; tests C0–C3 |
| Duplicate status double-apply | **FIXED** | same-status no-op + fulfill idempotency; tests I1–I3 |

No new P0 found.

---

## 4. P1 Re-Audit

| Former P1 | Status | Evidence |
|-----------|--------|----------|
| Legacy order silent inventory skip | **FIXED** | `LEGACY_ORDER_INVENTORY_MIGRATION_REQUIRED`; test D1 |
| Delete orphans reservation | **FIXED** | `prepareOrderDeleteInTx`; tests E1–E4 |
| Create then reserve race | **FIXED** | create+reserve one txn (orders + pillow-orders); test G1 |
| Mirror concurrency | **FIXED** | Pillow lock before balance + locking SUM; test F1 |
| LEGACY writer lost updates | **FIXED** | `FOR UPDATE` in AccessoryStockWriter / routes; tests L1–L2 |

No new P1 code defects found. Open legacy orders are **identified** (see §29) for explicit TASK 15 handling — not silent code bugs.

---

## 5. Full Update

`PUT /api/orders/:id/full`:

- **LEGACY:** accessory restore/apply still uses locked `Pillow` + `PillowStockHistory` when status implies deduction.
- **INVENTORY:** those branches skipped; `reconcileOrderAccessoriesInTx` syncs reservation (add/remove/increase/decrease/replace) and re-fulfills if status is DELIVERED.

Verified by cutover-blocker tests A0–A5 + LEG1. No duplicate deduction path in INVENTORY.

---

## 6. Status Atomicity

`PATCH /api/orders/:id/status` (and pillow-order status) run accessory effects **inside** the same transaction as order/mattress updates.

Forced failure (legacy accessory order, no reservation) → full rollback: status stays PENDING, balances unchanged (test B1).

Pillow-order status: inventory / LEGACY return both inside one txn (no post-commit compensate).

---

## 7. Status Lifecycle

Verified (isolated):

```text
PENDING → IN_PROCESS → DELIVERED → PENDING → DELIVERED
```

Exact balance pattern for qty=2 from physical=20:

| Step | physical | reserved |
|------|----------|----------|
| after reserve / IN_PROCESS | 20 | 2 |
| after DELIVERED | 18 | 0 |
| after → PENDING | 20 | 2 |
| after re-DELIVERED | 18 | 0 |

RETURNED paths covered by order-inventory + idempotent RETURNED test. Duplicate transitions do not double-apply.

---

## 8. Legacy Orders

Policy document: `TASK_14_1_ORDER_INVENTORY_TRANSITION_POLICY.md`.

In INVENTORY mode, accessory lines + no Reservation → HTTP 400 `LEGACY_ORDER_INVENTORY_MIGRATION_REQUIRED` on inventory-affecting status/full-update. No auto location, no auto reservation, no silent success (test D1).

---

## 9. Order Create

INVENTORY mattress create: order + pillow items + `reserveMattressOrderInTx` in one transaction. Pillow-order create: same with `reservePillowOrderInTx`.

Insufficient available → ROLLBACK, no orphan order (test G1).

---

## 10. Order Delete

`prepareOrderDeleteInTx`: reverse if fulfilled → release active/partial → detach `orderId` → delete, same txn. Legacy / no reservation unchanged. Tests E1–E4 PASS.

---

## 11. Mirror Concurrency

`InventoryService.mutateBalanceInTx` locks Pillow before balance when mirror sync will run. `syncPillowStockMirror` locks Pillow + all balances and sums from locking reads (avoids stale REPEATABLE READ).

Concurrent multi-location mutations → final `Pillow.stock == SUM(physical) + in-transit` (test F1; inventory-operations / transfers mirror tests PASS).

Lock order: **Pillow → InventoryBalance** (then reservation/transfer rows as held by those flows). No circular order identified for the critical paths.

---

## 12. Legacy Writer

`AccessoryStockWriter` LEGACY supply/adjust/outgoing: `SELECT … FOR UPDATE` then update. Concurrent outgoing preserves exact stock and rejects negatives (L1–L2). Pillow-order LEGACY create/return also locks Pillow.

---

## 13. Supply

`POST /api/inventory/supply` — adminOnly; location required/active/sellable; physical↑; movement; mirror. Covered by `test:inventory-operations` + `test:writer-cutover`.

---

## 14. Adjustment

`POST /api/inventory/adjust` — reason required; no negative physical; movement; mirror. Tests PASS.

---

## 15. Presentation

Showroom-only constraints; presentation ≤ physical − reserved rules; physical/reserved/mirror unchanged on presentation-only. Tests PASS.

---

## 16. Reservations

Full reserve / fulfill / release / return / reverseDelivery / concurrency / idempotency covered by `test:order-inventory` + cutover-blocker suite. Counters remain mathematically coherent (`fulfilled+released ≤ quantity`, `returned ≤ fulfilled` per implemented semantics). Unique `idempotencyKey` prevents duplicate reserve stock.

---

## 17. Transfers

DRAFT → DISPATCHED → PARTIALLY_RECEIVED → RECEIVED; over-receive; concurrent receive/dispatch; available/presentation/reserved constraints; mirror. `test:inventory-transfers` 39/39 PASS.

---

## 18. BS / BE

Unique document numbers; sequence concurrency; validated immutability; cancel rules. `test:transfer-documents` + transfer suite PASS.

---

## 19. Reconciliation

Read-only service; clean isolated env OK; injects detect mirror/balance/presentation issues without auto-fix (`test:inventory-operations` 31–33). Production reconciliation not executed against live balances (none exist).

---

## 20. Direct Stock Writes

Fresh classification of accessory `Pillow.stock` / `PillowStockHistory` writers:

| Location | Classification |
|----------|----------------|
| `PillowStockMirror.syncPillowStockMirror` | APPROVED MIRROR |
| `InventoryService` → mirror sync | APPROVED MIRROR |
| `OpeningInventoryService` mirror after opening | APPROVED MIRROR (cutover tool; not run) |
| `AccessoryStockWriter` LEGACY path | LEGACY-ONLY |
| `orders.ts` status/full LEGACY accessory | LEGACY-ONLY (gated by `skipLegacyAccessoryStock`) |
| `pillow-orders.ts` LEGACY create/return | LEGACY-ONLY |
| `pillow-stock.ts` create LEGACY + writer supply/outgoing/adjust | LEGACY-ONLY / INVENTORY-SAFE via writer |
| Mattress `productVariant` increment/decrement in orders | Mattress-only (not accessory inventory) |

**No CUTOVER BLOCKER** uncontrolled accessory writer in INVENTORY mode.

---

## 21. Legacy Routes

| Route area | Mode-aware |
|------------|------------|
| `/api/pillow-stock` create/supply/outgoing/adjust | Yes (`getInventoryMode` + `AccessoryStockWriter`) |
| `/api/pillow-orders` create/status | Yes (reserveInTx / LEGACY stock) |
| `/api/orders` create/status/full/delete | Yes |

INVENTORY → InventoryService / ReservationService; LEGACY → Pillow.stock paths. No bypass found.

---

## 22. Mattress Isolation

Mattress `ProductVariant.stock` / `StockHistory` remain separate. Accessory tests assert mattress unchanged (`test:order-inventory` #34, writer-cutover #13). Commission remains mattress-only.

---

## 23. Permissions

Inventory mutations (`supply`, `adjust`, `presentation`, transfers, documents validate/cancel, reservation release/fulfill/return) use `authMiddleware` + `adminOnly`. Reads authenticated. Pillow-stock mutations adminOnly. Unauthorized UI bypass rejected at API.

---

## 24. Frontend

Navigation group **Accessoires**: Inventory (`/inventory`), Legacy Accessoires Stock (`/pillow-stock`). Accessoires Orders lives under Orders group (`/pillow-orders`) — minor IA note (P3).

Routes present: `/inventory`, `/stock`, `/locations`, `/transfers`, `/transfers/:id`, `/documents`, `/documents/:id`, `/history`, `/reservations`, `/reconciliation`.

`InventoryModeBanner` shows LEGACY warning. Mutations invalidate inventory query keys (no optimistic stock writes found in inventory hooks).

`npx vitest run src` — 11/11 PASS. `npm run build` — PASS.

---

## 25. Database Integrity

Confirmed in `schema.prisma`:

- `InventoryBalance` @@unique([pillowId, locationId]) — Restrict FKs  
- `TransferLine` @@unique([transferId, pillowId]) — Cascade from Transfer only  
- `StockDocumentLine` @@unique([stockDocumentId, pillowId])  
- `DocumentSequence` @@unique([type, year])  
- `Reservation.idempotencyKey` @unique; Order/PillowOrder `onDelete: Restrict`  
- `ReservationLine` @@unique([reservationId, pillowId]) — Cascade with reservation  

Inventory audit balances/movements use Restrict on Pillow/Location — no silent cascade wipe of balances when deleting pillows.

---

## 26. Error Handling

Domain codes surface via `{ error, code }` including `INVENTORY_LOCATION_REQUIRED`, `LEGACY_ORDER_INVENTORY_MIGRATION_REQUIRED`, insufficient available, forbidden status, invalid location/qty/transfer/receive/reservation. Frontend toasts `response.data.error` on order/full-update paths. Inventory routes map domain errors without exposing Prisma stacks on normal paths.

---

## 27. Tests

| Suite | Result |
|-------|--------|
| test:inventory-service | PASS |
| test:inventory-operations | PASS |
| test:inventory-transfers | PASS (39) |
| test:order-inventory | PASS (42) |
| test:order-cutover-blockers | PASS (25) |
| test:writer-cutover | PASS |
| test:opening-inventory | PASS |
| test:legacy-migration | PASS |
| test:order-location | PASS |
| test:transfer-documents | PASS |
| vitest (src) | PASS (11) |
| npm run build | PASS |

No tests weakened for this audit.

---

## 28. Findings

| Severity | Count | Notes |
|----------|-------|-------|
| P0 | 0 | — |
| P1 | 0 | — |
| P2 | 4 | See §31 |
| P3 | 2 | See §31 |

---

## 29. Open Legacy Orders

**Open mattress orders with accessories (PENDING/IN_PROCESS): 3**  
**Open pillow orders: 4**  
**Delivered mattress with accessories (closed path): 1** (#1209)

| ID | Type | Status | locationId | Reservation | Lines | Classification |
|----|------|--------|------------|-------------|-------|----------------|
| 1210 | Order | PENDING | null | none | pillow 2 ×1 | TRANSITION REQUIRED |
| 1212 | Order | IN_PROCESS | null | none | pillow 1 ×1 | TRANSITION REQUIRED |
| 1213 | Order | PENDING | null | none | pillow 2 ×1 | TRANSITION REQUIRED |
| 1 | PillowOrder | PENDING | null | none | 2×p2 + 1×p1 | TRANSITION REQUIRED |
| 2 | PillowOrder | PENDING | null | none | pillow 1 ×1 | TRANSITION REQUIRED |
| 3 | PillowOrder | PENDING | null | none | pillow 1 ×1 | TRANSITION REQUIRED |
| 55 | PillowOrder | PENDING | 2 | none | pillow 2 ×1 | TRANSITION REQUIRED (has location but no Reservation; LEGACY create already deducted stock) |
| 1209 | Order | DELIVERED | null | none | pillow 2 ×2 | LOW RISK for open-flow (already delivered); still no Reservation if ever reopened in INVENTORY |

Legacy stock effect: created under LEGACY; company `Pillow.stock SUM = 0` today. **Not modified** by this audit.

These are **not** silent-skip bugs (gated in INVENTORY). They are **cutover-prep work items** for TASK 15 (close under LEGACY vs explicit migrate vs freeze until migrated).

---

## 30. Final Readiness Decision

```text
READY_FOR_CUTOVER_PREPARATION
```

Criteria met: all P0/P1 code blockers fixed and re-verified; critical tests pass; no uncontrolled INVENTORY accessory stock writer; production inventory untouched; legacy order risk identified for explicit TASK 15 handling.

---

## 31. Remaining P2/P3 Items

### P2
1. Production `Pillow.stock SUM = 0` — opening physical count required before truthful INVENTORY balances (TASK 15+).  
2. **7** open accessory flows (3 mattress + 4 pillow) need explicit transition decisions before/at cutover.  
3. PillowOrder #55 already has `locationId` but no Reservation — needs explicit migrate-or-close plan.  
4. Admin “migrate legacy order → reservation” tooling still future work (policy exists; no auto-migrate).

### P3
1. Nav: “Accessoires Orders” under Orders group rather than Accessoires group.  
2. Optional FE messages specialized by error `code` (message text already shown).

---

## STOP

Do **not** start TASK 15 in this task.  
Do **not** switch `inventoryMode`, create opening inventory, migrate production stock, or restore stock to 62.
