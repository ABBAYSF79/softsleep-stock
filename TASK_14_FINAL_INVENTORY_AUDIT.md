# TASK 14 — Final Inventory Audit & Production Readiness

**Date:** 2026-09-06  
**Scope:** Read-only comprehensive audit of accessory inventory architecture before cutover preparation  
**Auditor method:** Repository code inspection, Prisma schema review, production DB read-only snapshot, full inventory test suite execution  
**Production mutations:** **NONE** (no mode switch, no opening inventory, no balance/movement/reservation/transfer/document writes outside isolated test cleanup)

---

## 1. Executive Summary

The **core inventory engine** (`InventoryService`, transfers/BS–BE validation, reservation ledger, reconciliation, dual-path `AccessoryStockWriter`) is largely sound: row locks (`SELECT … FOR UPDATE`), invariants, mode gates on inventory APIs, and an extensive isolated test suite all pass.

However, the system is **not ready for cutover preparation** because:

1. **Production accessory stock baseline no longer matches the expected TASK 13 snapshot** (`Pillow.stock SUM = 0` vs expected `62`), caused by recent LEGACY `OUTGOING` operations — not by this audit.
2. **Several order-path cutover blockers remain in code**, especially `PUT /api/orders/:id/full` writing `Pillow.stock` with **no inventory-mode gate**, non-atomic mattress order status ↔ reservation coordination, and **DELIVERED → PENDING → DELIVERED** under-fulfillment.
3. **Active open accessory orders / pillow orders** exist without fulfillment `locationId`, which will break or silently skip inventory effects after cutover unless a transition policy is defined and implemented.

### Final decision

```text
NOT READY
```

Do **not** start TASK 15 until P0/P1 blockers below are resolved and the production stock baseline is intentionally re-established (physical recount / opening plan).

---

## 2. Current Production Snapshot

Captured **before and after** the test suite via `backend/scripts/task14-readonly-snapshot.ts` (read-only).

### Observed (2026-09-06)

| Metric | Expected (TASK brief) | Observed | Match? |
|---|---|---|---|
| `inventoryMode` | `LEGACY` | `LEGACY` | YES |
| Pillow count | 2 | 2 | YES |
| `Pillow.stock SUM` | **62** | **0** | **NO** |
| PillowStockHistory | **11** | **14** | **NO** |
| Location | 2 | 2 | YES |
| InventoryBalance | 0 | 0 | YES |
| StockMovement | 0 | 0 | YES |
| Transfer | 0 | 0 | YES |
| TransferLine | 0 | 0 | YES |
| StockDocument | 0 | 0 | YES |
| StockDocumentLine | 0 | 0 | YES |
| Reservation | 0 | 0 | YES |
| ReservationLine | 0 | 0 | YES |
| Order | (not specified) | 1376 | — |
| PillowOrder | (not specified) | 4 | — |
| OrderPillowItem | (not specified) | 4 | — |
| PillowOrderItem | (not specified) | 5 | — |

### Per-pillow stock

| Pillow ID | Name | Stock |
|---|---|---|
| 1 | ice sleep | 0 |
| 2 | memoire de forme | 0 |

### Locations

| ID | Code | Type | Active | Sellable | Allows presentation |
|---|---|---|---|---|---|
| 1 | WH-MAIN | WAREHOUSE | true | true | false |
| 2 | SR-MAIN | SHOWROOM | true | true | true |

### Why `Pillow.stock SUM` differs from 62

Recent `PillowStockHistory` (read-only):

| ID | When | Pillow | Qty | Type | Reason | Prev → New |
|---|---|---|---|---|---|---|
| 53 | 2026-09-06 14:27:37Z | 1 | -16 | OUTGOING | `kj` | 16 → 0 |
| 52 | 2026-09-06 14:27:29Z | 2 | -45 | OUTGOING | `klnkj` | 45 → 0 |
| 51 | 2026-09-06 14:24:39Z | 2 | -1 | OUTGOING | Pillow order #55 | 46 → 45 |

**Interpretation:** Operators used **LEGACY** pillow-stock outgoing (and one pillow-order create) on 2026-09-06, zeroing company stock. This audit did **not** modify stock. InventoryBalance/StockMovement remain empty → system is still in pre-cutover LEGACY state.

### Production safety after tests

All inventory test scripts restored:

```text
inventoryMode = LEGACY
InventoryBalance = 0
StockMovement = 0
Transfer = 0
Reservation = 0
Pillow.stock SUM = 0   (unchanged from pre-test production value)
PillowStockHistory = 14
```

`InventoryCutoverSettings.updatedAt` advanced during tests (mode flip/restore) but `mode` remained `LEGACY` and `cutoverAt` is still `null`.

---

## 3. Architecture Audit

### Intended dependency direction (verified)

```text
Routes (/api/inventory, pillow-stock, orders, pillow-orders)
   ↓
Domain coordinators (OrderAccessoryInventory, AccessoryStockWriter, StockDocumentService)
   ↓
ReservationService / TransferService / InventoryService
   ↓
InventoryBalance  (+ FOR UPDATE)
   ↓
StockMovement
   ↓
Pillow.stock mirror (PillowStockMirror — when migrated)
```

### Route business logic classification

| Area | Verdict | Notes |
|---|---|---|
| `/api/inventory/*` | **SAFE** | Thin adapters; mutations admin-only; mode-gated supply/adjust/presentation |
| `/api/pillow-stock` writes | **SAFE** | Delegates to `AccessoryStockWriter` |
| `/api/pillow-orders` create/status | **SAFE / MINOR TECH DEBT** | Mode-aware; status rollback on inventory failure |
| `/api/orders` status | **CUTOVER BLOCKER** | Inventory after txn; no status revert on reservation failure |
| `/api/orders/:id/full` | **CUTOVER BLOCKER** | Direct `Pillow.stock` writes, **no mode gate** |
| `/api/orders` DELETE | **CUTOVER BLOCKER** | No reservation release; FK Restrict on Reservation.orderId |
| Mattress `/api/stock`, products | **SAFE** | Isolated `ProductVariant.stock` |

---

## 4. Source of Truth

### INVENTORY mode (intended)

| Layer | Role |
|---|---|
| `InventoryBalance` | Source of truth (physical / presentation / reserved) |
| `StockMovement` | Immutable audit ledger |
| `Pillow.stock` | Compatibility mirror = `Σ physical + open in-transit` |

### Direct `Pillow.stock` writers found

| Path | Classification |
|---|---|
| `PillowStockMirror.syncPillowStockMirror` | **SAFE / MIRROR** |
| `InventoryService` → mirror | **SAFE / MIRROR** |
| `AccessoryStockWriter` LEGACY branch | **LEGACY only** |
| `pillow-orders` create/return LEGACY | **MODE-GATED** |
| `orders` status `applyPillowStockChange` | **MODE-GATED** (skipped when INVENTORY) |
| `orders` `PUT /:id/full` accessory restore/reapply | **MUST FIX — ungated** |
| `OpeningInventoryService` | **TOOLING** (one-shot) |

In INVENTORY mode, `Pillow.stock` must not become an independent writer except via mirror. **`PUT /orders/:id/full` violates this.**

---

## 5. Inventory Invariants

Enforced in `InventoryService.assertValidState`:

```text
physical >= 0
presentation >= 0
reserved >= 0
presentation <= physical
reserved <= physical - presentation
available = physical - presentation - reserved >= 0
```

| Mutation | Locked? | Invariants enforced? | Notes |
|---|---|---|---|
| SUPPLY | FOR UPDATE | Yes | Increases physical only |
| ADJUSTMENT | FOR UPDATE | Yes | Rejects if presentation/reserved would break |
| PRESENTATION | FOR UPDATE | Yes | Showroom-only at writer/service layer |
| RESERVE / RELEASE / FULFILL | Reservation + balance FOR UPDATE | Yes | |
| RETURN | FOR UPDATE | Yes | Caps at fulfilled − returned |
| TRANSFER_OUT / IN | Document + transfer + balance locks | Yes | Via validateDocument |

No Serializable isolation found — protection is explicit `FOR UPDATE` under default Read Committed (acceptable if all writers lock).

---

## 6. Supply

Verified in code + `test:inventory-operations` / `test:writer-cutover`:

- Location required in INVENTORY (`INVENTORY_LOCATION_REQUIRED`)
- Location must be active + sellable (service validation)
- `quantity > 0`
- `physical` ↑, `StockMovement` SUPPLY, mirror sync, presentation/reserved unchanged
- Transaction rollback tested
- Concurrent supply covered

**Verdict:** SAFE for INVENTORY mode paths.

---

## 7. Adjustment

- Location + reason required on inventory API
- Signed delta; negative physical rejected
- Does not silently rewrite presentation/reserved; rejects invalid resulting state
- Movement + mirror in same transaction

**Verdict:** SAFE.

---

## 8. Presentation

- Showroom only (`allowsPresentation`); warehouse rejected
- Absolute set; respects `presentation ≤ physical` and reserved budget
- Physical/reserved unchanged; available recalculated
- Mirror intentionally unchanged for presentation-only (physical unchanged)

**Verdict:** SAFE.

---

## 9. Reservations

Lifecycle implemented:

```text
CREATE → ACTIVE → PARTIALLY_FULFILLED → FULFILLED
ACTIVE / PARTIAL → RELEASED
FULFILLED → returnFulfilled (physical ++)
```

| Operation | Physical | Reserved | Movement |
|---|---|---|---|
| Reserve | unchanged | ↑ | RESERVATION |
| Release | unchanged | ↓ | RELEASE |
| Fulfill | ↓ | ↓ | SALE |
| Return | ↑ | unchanged | RETURN |

Idempotency: unique `idempotencyKey`; fulfill/release short-circuit on terminal status; return capped.

**Risks:** concurrent same-key reserve may surface `P2002` instead of returning existing (**P2/P1**); release of partially fulfilled sets status `RELEASED` (counters OK, status nuance lost — **P2**).

---

## 10. Orders

### Create (INVENTORY)

- Mattress order with accessories requires sellable `locationId`
- After create: `OrderAccessoryInventory` reserves (`ORDER:{id}:RESERVE`)
- On reserve failure: order deleted (compensating) — race window remains (**P1**)

### Status (INVENTORY)

| Transition | Expected effect |
|---|---|
| → IN_PROCESS | Stay reserved (no-op) |
| → DELIVERED | Fulfill remaining |
| → PENDING from IN_PROCESS/DELIVERED | Return fulfilled + release remaining |
| → RETURNED | Return + release (or return if fulfilled) |

### Critical defects

1. **`PATCH /orders/:id/status`:** status + mattress stock commit in txn; reservation runs **after**. On reservation failure, HTTP error is returned but **order status is not reverted** (pillow-orders *does* revert). **P0**
2. **`DELIVERED → PENDING`:** returns physical but leaves reservation `FULFILLED`; next `→ DELIVERED` does **not** re-fulfill (`OrderAccessoryInventory` only fulfills ACTIVE/PARTIAL). **P0 under-deduction**
3. **Pre-cutover orders without reservation:** coordinator returns `true` and skips legacy accessory writes in INVENTORY → silent no stock effect. **P1**

---

## 11. Legacy Order Risk

### Open mattress orders with accessories (PENDING / IN_PROCESS)

| Order ID | Status | locationId | Accessory lines | Qty | Cutover risk |
|---|---|---|---|---|---|
| 1210 | PENDING | **null** | pillow 2 | 1 | Cannot reserve without location; INVENTORY may skip stock |
| 1212 | IN_PROCESS | **null** | pillow 1 | 1 | Already deducted in LEGACY history; status transitions dangerous post-cutover |
| 1213 | PENDING | **null** | pillow 2 | 1 | Same as 1210 |

### Open pillow orders (PENDING / IN_PROCESS)

| PillowOrder ID | Status | locationId | Lines | Cutover risk |
|---|---|---|---|---|
| 1 | PENDING | **null** | pillow2×2, pillow1×1 | LEGACY already deducted on create; INVENTORY expects reservation+location |
| 2 | PENDING | **null** | pillow1×1 | Same |
| 3 | PENDING | **null** | pillow1×1 | Same |
| 55 | PENDING | **2 (SR-MAIN)** | pillow2×1 | Has location; still LEGACY-deducted at create; no Reservation row yet |

### Classification

```text
CUTOVER BLOCKER
```

Active open accessory orders **cannot safely remain** under a silent cutover without an explicit transition rule (close them, assign location + create reservations, or freeze status changes until migrated). No safe automatic policy was invented here — evidence shows null locations + LEGACY deductions already applied.

Delivered accessory orders: 1 (closed path lower risk if no status re-open).  
Returned accessory orders: 0.

---

## 12. Transfers

Documented lifecycle enforced:

```text
DRAFT → DISPATCHED → PARTIALLY_RECEIVED → RECEIVED
DRAFT → CANCELLED
```

- Dispatch stock via validated BS (`TRANSFER_OUT`) in INVENTORY
- Receive via BE (`TRANSFER_IN`); `received ≤ sent`; concurrent receive protected
- Post-dispatch cancel refused
- LEGACY: transfer/document state only (no balance mutation)

**Verdict:** Core transfer engine SAFE. Convenience `dispatchTransfer`/`receiveTransfer` use split transactions (draft then validate) — **P2**.

---

## 13. In-Transit

```text
inTransit = sentQuantity - receivedQuantity
  for status IN (DISPATCHED, PARTIALLY_RECEIVED)

companyPhysical = Σ location.physical + Σ open in-transit
Pillow.stock mirror = companyPhysical (when migrated)
```

In-transit is **not** part of location.available and cannot be sold until received (dispatch decreases source physical/available). Covered by transfer tests.

**Verdict:** SAFE.

---

## 14. BS / BE Document Audit

- Unique `documentNumber`
- DRAFT editable; VALIDATED immutable (no edit/cancel)
- One non-cancelled BS per transfer; BE lines ≤ remaining
- Audit fields: location, transfer, user, timestamps, reason
- Corrections = compensating movements / new documents (no silent rewrite)

**Verdict:** SAFE.

---

## 15. Document Sequences

`DocumentSequence` unique `(type, year)` with `SELECT … FOR UPDATE` increment.

- Concurrency test: no duplicate numbers
- Year embedded in formatted number

**Verdict:** SAFE.

---

## 16. Reconciliation

`ReconciliationService` is **READ ONLY** (detect only; no create/update/delete).

Checks include:

- Balance invariants
- Presentation on non-showroom
- Mirror vs company physical
- Transfer integrity
- Recent movement consistency

Does **not** auto-repair.

**Verdict:** SAFE.

---

## 17. StockMovement Ledger

- Created in same transaction as balance mutation
- Stores previous/new physical, presentation, reserved
- Type, quantity, location, user, reason, reference fields, createdAt
- No update API for movements (immutable by convention)

**Verdict:** SAFE for service paths. Missing movements would occur only if ungated legacy writers bypass InventoryService (see §4 / §10).

---

## 18. Concurrency

Covered by tests for supply, adjustment, reserve, fulfill, return, dispatch, receive, document numbering.

Strategy: transaction + `FOR UPDATE` on balance / reservation / transfer / document / sequence.

**Known gap:** multi-location concurrent mutations on same pillow can race on `Pillow.stock` mirror aggregate (no pillow-row lock) → transient mirror drift (**P1**).

LEGACY `AccessoryStockWriter` still uses read-then-write without row lock (**P1** while mode=LEGACY; irrelevant after cutover if LEGACY path unused).

---

## 19. Idempotency

| Operation | Protection |
|---|---|
| Reservation create | Unique `idempotencyKey` (race → possible P2002) |
| Fulfill / release | Terminal status short-circuit |
| Return | Remaining returnable qty cap |
| Document validate | DRAFT-only + document lock |
| Supply / adjust | **No** request idempotency key — double-click can double-apply |

**Verdict:** Good for reservation/fulfill/receive; supply/adjust need UI discipline or future idempotency keys (**P2**).

---

## 20. Permissions

| Surface | Auth |
|---|---|
| `/api/inventory` mutations | `authMiddleware` + `adminOnly` |
| `/api/inventory` reads | Any authenticated |
| `/api/pillow-stock` writes | adminOnly + static password code |
| Order / pillow-order stock effects | Authenticated users (by design) |

UI inventory routes are `adminOnly`. Non-admins **cannot** call inventory mutation APIs; they **can** change balances indirectly via order flows after cutover.

Hardcoded `admin123456` on pillow-stock / advanced edit / delete: **P3** security debt (pre-existing).

---

## 21. Legacy Routes

| Route | Method | Writes stock? | LEGACY | INVENTORY | Safe after cutover? |
|---|---|---|---|---|---|
| `/api/pillow-stock` supply/outgoing/adjust | POST | Yes | Pillow.stock | InventoryService | Yes (if location provided) |
| `/api/pillow-orders` | POST | Yes | Deduct Pillow.stock | Reserve | Yes |
| `/api/pillow-orders/:id/status` | PATCH | Yes | Restore on RETURNED | Reservation lifecycle + revert | Yes |
| `/api/orders` | POST | Reserve in INV | No accessory deduct at create | Reserve | Mostly |
| `/api/orders/:id/status` | PATCH | Yes | Pillow deltas | Reservation after commit | **No** |
| `/api/orders/:id/full` | PUT | Yes | Pillow.stock | **Still Pillow.stock** | **No** |
| `/api/orders/:id` DELETE | DELETE | Mattress only | Incomplete accessories | Reservation Restrict | **No** |
| `/api/inventory/*` | * | Mode-gated | N/A | Yes | Yes |

---

## 22. Mattress Isolation

- `ProductVariant.stock` / `StockHistory` remain separate
- Inventory models keyed by `pillowId` only
- Mattress commission paths unchanged
- Order inventory tests assert mattress stock untouched

**Verdict:** SAFE.

---

## 23. Frontend

Active admin routes verified in `App.tsx` / `nav-config.ts`:

```text
/inventory
/inventory/stock
/inventory/locations
/inventory/transfers
/inventory/transfers/:id
/inventory/documents
/inventory/documents/:id
/inventory/history
/inventory/reservations
/inventory/reconciliation
```

Nav group **Accessoires**: Inventory + Legacy Accessoires Stock + Accessoires Orders.

- Mode banner present (`InventoryModeBanner`)
- Inventory mutations: no optimistic stock writes; invalidate `['inventory']` on success
- Order status optimistic updates do **not** invalidate inventory keys (**P2**)

Frontend vitest: inventory util tests pass; production build succeeds.

---

## 24. Database Constraints

Verified in `schema.prisma`:

| Constraint | Present |
|---|---|
| `InventoryBalance @@unique([pillowId, locationId])` | Yes |
| `TransferLine @@unique([transferId, pillowId])` | Yes |
| `StockDocumentLine @@unique([stockDocumentId, pillowId])` | Yes |
| `DocumentSequence @@unique([type, year])` | Yes |
| `Reservation.idempotencyKey` unique | Yes |
| `ReservationLine @@unique([reservationId, pillowId])` | Yes |
| FKs Restrict on balances/movements/reservations | Yes |
| `available` not stored | Yes (computed) |

---

## 25. Error Handling

Inventory/Reservation domain errors map to HTTP via `inventoryErrorToHttp` / `reservationErrorToHttp` with codes such as:

- insufficient available
- invalid/inactive location
- warehouse presentation
- invalid quantity
- mode mismatch (`inventoryMode=INVENTORY` required)

Frontend dialogs surface API error messages. Raw Prisma leaks still possible on some order advanced-edit paths (**P2**).

---

## 26. Test Results

### Backend (with `ALLOW_ISOLATED_INVENTORY_TESTS=1`)

| Script | Result |
|---|---|
| `test:inventory-service` | **PASS** |
| `test:inventory-operations` | **PASS** |
| `test:order-inventory` | **PASS** (42 checks) |
| `test:inventory-transfers` | **PASS** (39 checks) |
| `test:writer-cutover` | **PASS** |
| `test:opening-inventory` | **PASS** |
| `test:legacy-migration` | **PASS** (no production execute) |
| `test:order-location` | **PASS** |
| `test:transfer-documents` | **PASS** |

All scripts reported production inventory tables untouched and `inventoryMode=LEGACY` restored.

### Frontend

| Check | Result |
|---|---|
| `vitest` inventory utils | **8/8 PASS** |
| `npm run build` | **PASS** |

### Gaps relative to brief

No dedicated automated test currently asserts:

- `PUT /orders/:id/full` mode gate
- mattress order status rollback on reservation failure
- `DELIVERED → PENDING → DELIVERED` re-fulfill behavior

These are code-verified defects, not failing tests.

---

## 27. Findings by Severity

### P0 — Critical blocker

1. **Production stock baseline changed:** `Pillow.stock SUM = 0` (expected 62). Zeroed via LEGACY outgoing on 2026-09-06 (`kj` / `klnkj`) plus pillow order #55. Opening inventory cannot proceed from the TASK 13 assumed counts without a fresh physical recount.
2. **`PUT /api/orders/:id/full`** always mutates `Pillow.stock` (+ history) with **no `getInventoryMode` gate** — will desync balances after cutover.
3. **`PATCH /api/orders/:id/status`** commits status before reservation effects; inventory failure does **not** revert status.
4. **`DELIVERED → PENDING → DELIVERED`** returns stock but leaves reservation `FULFILLED`, so re-delivery does not re-fulfill → **under-deduction**.

### P1 — Cutover blocker

1. Open accessory orders / pillow orders (see §11) mostly **`locationId = null`** and already LEGACY-deducted — unsafe silent cutover.
2. `DELETE /api/orders/:id` lacks reservation/accessory handling (`onDelete: Restrict`).
3. Order create → reserve compensating delete race window.
4. Pre-cutover orders without reservation silently skip accessory stock in INVENTORY mode.
5. Concurrent multi-location mirror race on `Pillow.stock`.
6. LEGACY writer concurrency (while still in LEGACY production).

### P2 — Important non-blocking

1. Split txn for convenience dispatch/receive APIs
2. Reservation idempotency `P2002` on concurrent same key
3. Order/pillow-order FE does not invalidate `['inventory']`
4. Supply/adjust lack request idempotency keys
5. Manual reservation admin endpoints rely on caller mode gate
6. Create-order still validates `Pillow.stock` even in INVENTORY

### P3 — Tech debt

1. Hardcoded `admin123456` passwords
2. Duplicate inventory hooks in `useApi.ts` vs feature hooks
3. Legacy Accessoires Stock UI remains available (labeled)

---

## 28. Cutover Readiness Decision

```text
NOT READY
```

**Meaning:** Do **not** proceed to TASK 15 (operator physical counts / opening inventory / mode flip preparation) until P0/P1 items are addressed and reviewed.

This is **not** a judgment that the inventory engine is unusable — core services and tests are strong — but cutover preparation would be unsafe given production baseline drift and order-path blockers.

---

## 29. Remaining Blockers (must fix before TASK 15)

1. **Reconcile production accessory stock reality** with operators (physical count). Document new opening baseline. Do **not** auto-restore 62.
2. **Gate or rewrite `PUT /orders/:id/full`** accessory stock through `OrderAccessoryInventory` / reservations in INVENTORY mode.
3. **Make mattress order status + reservation atomic** (or revert status on inventory failure, matching pillow-orders).
4. **Fix re-delivery after revert** (re-reserve or reopen reservation after return-to-PENDING).
5. **Define and implement policy for open legacy accessory orders** (close, assign location + seed reservations, or freeze).
6. **Handle order delete** with reservation release / forbid delete when reservation exists with clear API error.

---

## 30. Recommendations

### Before TASK 15

- Fix P0 order-path defects behind tests (especially full-update mode gate + status revert + re-fulfill).
- Inventory of open accessory orders with ops team; decide freeze/close/migrate.
- Confirm physical on-hand counts independently of `Pillow.stock` (currently 0 in DB).

### During TASK 15 (when unblocked)

- Opening inventory only via `OpeningInventoryService` (one-shot, idempotent).
- Keep `inventoryMode=LEGACY` until opening commit flips it.
- Run reconciliation immediately after cutover (read-only).

### Do not

- Auto-repair production stock
- Switch `inventoryMode` now
- Execute opening inventory now
- Rely on Legacy Accessoires Stock UI after cutover for writes

---

## Appendix A — Audit tooling added (read-only)

| File | Purpose |
|---|---|
| `backend/scripts/task14-readonly-snapshot.ts` | Counts + open accessory orders |
| `backend/scripts/task14-pillow-detail.ts` | Per-pillow stock, locations, recent history |

These scripts perform **no writes**.

---

## Appendix B — Code citations (key blockers)

- Ungated full update accessory writes: `backend/src/routes/orders.ts` (~1487–1508, ~1660–1679)
- Status then inventory without revert: `backend/src/routes/orders.ts` (~1167–1182)
- Re-delivery gap: `backend/src/services/OrderAccessoryInventory.ts` (~123–169)
- Mode gate on status legacy pillow deltas: `backend/src/routes/orders.ts` (~993–997)

---

**STOP.** TASK 14 complete. Do not start TASK 15 until this report is reviewed.
