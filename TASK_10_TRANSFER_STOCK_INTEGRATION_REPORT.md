# TASK 10 — Transfer Stock Integration Report

**Date:** 2026-09-05  
**Status:** COMPLETE (backend + tests)  
**Stop condition:** No production cutover, no opening inventory, no TASK 11.

---

## Before (production / local DB snapshot)

Verified at start and end of TASK 10 tests:

| Metric | Value |
|--------|-------|
| InventoryBalance | **0** |
| StockMovement | **0** |
| Transfer | **0** (after test cleanup) |
| StockDocument | **0** (after test cleanup) |
| Pillow.stock SUM | **62** (unchanged) |
| inventoryMode | **LEGACY** |

Production pillows (ids 1–2) were never used for balance/movement seeding.

---

## Architecture

### Mode gate

`StockDocumentService.validateDocument` reads `inventoryMode`:

- **LEGACY** — document + transfer state machine only (TASK 5 behavior preserved). No `InventoryBalance` / `StockMovement` / `Pillow.stock` mutation from BS/BE.
- **INVENTORY** — real stock effects via `InventoryService` inside the same Prisma transaction.

### Bon de Sortie (BS) → dispatch

```text
BS VALIDATED (INVENTORY)
  → lock Transfer + TransferLine + source InventoryBalance (FOR UPDATE)
  → require sentQuantity <= available (physical − presentation − reserved)
  → source physical -= sentQuantity
  → StockMovement type = TRANSFER_OUT
       previousPhysical / newPhysical
       referenceType = TRANSFER
       referenceId = transfer.id
       referenceNumber = transfer.referenceNumber
  → transfer status = DISPATCHED
  → sync Pillow.stock mirror (Σ physical + open in-transit)
```

Quantity is now **in transit** (not at destination, not sellable).

### Bon d’Entrée (BE) → receive (multiple BEs allowed)

```text
BE VALIDATED (INVENTORY)
  → lock Transfer + TransferLine + destination InventoryBalance
  → require receivedQuantity <= (sentQuantity − receivedQuantity)
  → destination physical += qty
  → StockMovement type = TRANSFER_IN
  → update TransferLine.receivedQuantity
  → status = PARTIALLY_RECEIVED | RECEIVED
  → sync Pillow.stock mirror
```

Presentation and reserved are **not** changed on normal transfer receive.

### In-transit (derived, not stored)

```text
inTransit = sentQuantity − receivedQuantity
```

Counted in `PillowStockMirror` only while transfer status is `DISPATCHED` or `PARTIALLY_RECEIVED`, so company `Pillow.stock` stays conserved across BS/BE.

### Transfer status machine (unchanged)

```text
DRAFT → DISPATCHED → PARTIALLY_RECEIVED → RECEIVED
DRAFT → CANCELLED
```

Invalid transitions rejected. Post-dispatch cancel returns `CANCELLATION_NOT_ALLOWED` (400).

---

## Implementation summary

| Area | Change |
|------|--------|
| `InventoryService` | `decreasePhysicalInTx` / `increasePhysicalInTx`, `skipMirrorSync` |
| `StockDocumentService` | Mode-gated stock effects; `dispatchTransfer` / `receiveTransfer` helpers; Activity audit on validate |
| `TransferService` | Serialize `reference`, `requestedQuantity`, `inTransitQuantity`, `availableRemainingToReceive`; clearer cancel errors |
| Routes | `POST /api/inventory/transfers/:id/dispatch`, `.../receive` (existing document routes preserved) |
| Tests | `backend/scripts/test-inventory-transfers.ts` + `npm run test:inventory-transfers` |

Validated documents remain immutable (no edit/cancel). No delete API for stock documents.

---

## Concurrency

Protection uses **Prisma `$transaction` + `SELECT … FOR UPDATE`** on:

- `Transfer`
- `TransferLine`
- source/destination `InventoryBalance` (via InventoryService)
- `StockDocument` being validated

This prevents:

| Risk | Protection |
|------|------------|
| Double dispatch | Transfer lock + status must be DRAFT; second validate fails |
| Double / over-receive | Line lock + remaining check before increment |
| Negative stock / over-available | Available check under source balance lock |
| Duplicate document numbers | Existing `DocumentSequence` atomic year-aware allocator |

---

## Immutability

- Validated BS/BE: `updateDraftDocument` / `cancelDraftDocument` → `FORBIDDEN_STATUS`
- DRAFT documents/transfers remain editable
- Corrections after validation require a future compensating/reversal workflow (not implemented in TASK 10)

---

## Tests

### TASK 10 — `npm run test:inventory-transfers` (39/39 PASS)

| # | Test | Result |
|---|------|--------|
| 1 | Create valid DRAFT | PASS |
| 2 | Invalid source/destination | PASS |
| 3 | Source = destination rejected | PASS |
| 4 | Negative quantity rejected | PASS |
| 5 | Zero quantity rejected | PASS |
| 6 | Unknown Pillow rejected | PASS |
| 7 | Dispatch with enough available | PASS |
| 8 | Physical decreases | PASS |
| 9 | TRANSFER_OUT created | PASS |
| 10 | Presentation unchanged | PASS |
| 11 | Reserved unchanged | PASS |
| 12 | In-transit correct | PASS |
| 13 | Insufficient available rejected | PASS |
| 14 | Rollback on failure | PASS |
| 15 | Partial receive | PASS |
| 16 | Destination physical increases | PASS |
| 17 | TRANSFER_IN created | PASS |
| 18 | Remaining in-transit | PASS |
| 19 | PARTIALLY_RECEIVED | PASS |
| 20 | Final receive | PASS |
| 21 | RECEIVED | PASS |
| 22 | In-transit = 0 | PASS |
| 23 | Destination physical correct | PASS |
| 24 | Over-receive rejected | PASS |
| 25 | Concurrent receive safe | PASS |
| 26 | Concurrent dispatch safe | PASS |
| 27 | Sequence uniqueness | PASS |
| 28 | Validated BS immutable | PASS |
| 29 | Validated BE immutable | PASS |
| 30 | Validated cannot cancel/delete | PASS |
| 31 | DRAFT editable | PASS |
| 32 | Cannot consume presentation | PASS |
| 33 | Cannot consume reserved | PASS |
| 34 | Available calculation | PASS |
| 35 | DRAFT cancel | PASS |
| 36 | DISPATCHED no silent cancel | PASS |
| 37 | RECEIVED no cancel | PASS |
| 38 | Pillow.stock mirror INVENTORY | PASS |
| 39 | LEGACY path intact | PASS |

Safety guard: refuses `SOFTSLEEP_ENV=production` (or non-LEGACY start) unless `ALLOW_ISOLATED_INVENTORY_TESTS=1`. Temp pillows only; mode restored to LEGACY.

### Regression (all PASS)

| Script | Result |
|--------|--------|
| `test:inventory-service` | PASS |
| `test:writer-cutover` | PASS |
| `test:order-location` | PASS |
| `test:opening-inventory` | PASS |
| `test:legacy-migration` | PASS |
| `test:transfer-documents` | PASS (LEGACY: still no stock mutation) |
| `test:inventory-transfers` | PASS |

---

## Frontend gaps (intentionally deferred)

Backend APIs for create / list / get transfer, dispatch, receive, and BS/BE documents are ready.

Minimum UI not built in TASK 10:

- Dedicated create-transfer form wired to new stock-aware flow
- Dispatch / receive action buttons using `/dispatch` and `/receive`
- In-transit / partial-receipt display using serialized `inTransitQuantity` / `availableRemainingToReceive`

Existing pages were not redesigned and must not break (API fields additive).

---

## Production confirmation

```text
NO PRODUCTION STOCK WAS MODIFIED
NO PRODUCTION CUTOVER WAS EXECUTED
NO OPENING INVENTORY WAS RUN
inventoryMode remains LEGACY
InventoryBalance = 0
StockMovement = 0
Pillow.stock SUM = 62
```

TASK 10 stops here. Transfer engine is ready for a future clean cutover; do not proceed to TASK 11 from this report.
