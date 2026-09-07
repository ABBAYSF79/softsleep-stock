# TASK 5 — IMPLEMENTATION REPORT

## Transfer + Bon de Sortie / Bon d’Entrée Foundation

**Date:** 2026-09-05  
**Status:** COMPLETE  

```
TASK 5 COMPLETE — TRANSFER / BS / BE DOCUMENT FOUNDATION ONLY
NO STOCK MUTATION / NO LEGACY CUTOVER
```

---

## 1. Executive Summary

Implemented the **document foundation** for internal location transfers:

- `Transfer` + `TransferLine`
- `StockDocument` (BON_SORTIE / BON_ENTREE) + `StockDocumentLine`
- Concurrency-safe `DocumentSequence` (`TR-` / `BS-` / `BE-`)
- `TransferService` + `StockDocumentService`
- APIs under `/api/inventory/transfers` and `/api/inventory/documents`

**Critical:** Validating BS/BE updates **transfer document state only**.  
It does **not** call `InventoryService`, does **not** create `StockMovement`, and does **not** change `Pillow.stock`.

`SUM(Pillow.stock)` remained **62**. InventoryBalance / StockMovement counts stayed **0**.

---

## 2. Files Changed

| File | Change |
|------|--------|
| `backend/prisma/schema.prisma` | Transfer*, StockDocument*, DocumentSequence, enums, User/Location/Pillow relations |
| `backend/prisma/migrations/20260905125604_add_transfer_stock_documents/` | Additive migration |
| `backend/src/services/DocumentSequenceService.ts` | **New** |
| `backend/src/services/TransferService.ts` | **New** |
| `backend/src/services/StockDocumentService.ts` | **New** |
| `backend/src/services/transfer-errors.ts` | **New** |
| `backend/src/routes/inventory.ts` | Transfer + document routes |
| `backend/scripts/test-transfer-documents.ts` | **New** — Tests 1–15 |
| `backend/package.json` | `test:transfer-documents` |
| `src/hooks/useApi.ts` | `useInventoryTransfers`, `useInventoryTransfer`, `useInventoryDocuments`, `useInventoryDocument` |

**Not modified:** pillow-stock / pillow-orders / orders stock writers; PillowStock UI pages.

---

## 3. Prisma Models

### Enums

- `TransferStatus`: `DRAFT | DISPATCHED | PARTIALLY_RECEIVED | RECEIVED | CANCELLED`
- `StockDocumentType`: `BON_SORTIE | BON_ENTREE`
- `StockDocumentStatus`: `DRAFT | VALIDATED | CANCELLED`

### Transfer

`referenceNumber` unique, source/destination locations, status, reason, created/dispatched/completed by + timestamps, lines, documents.

### TransferLine

`@@unique([transferId, pillowId])`, `sentQuantity`, `receivedQuantity` (defaults 0).

### StockDocument

`documentNumber` unique, type, status, optional `transferId`, **`locationId`** (source for BS, destination for BE), audit fields, lines.

### StockDocumentLine

`@@unique([stockDocumentId, pillowId])`, `quantity > 0` enforced in service.

### DocumentSequence

`@@unique([type, year])`, `lastNumber`.

---

## 4. State Machines

### Transfer

```
DRAFT
  → DISPATCHED            (validate BON_SORTIE)
  → CANCELLED             (draft cancel only)

DISPATCHED
  → PARTIALLY_RECEIVED    (first BE with received < sent)
  → RECEIVED              (BE completes all)

PARTIALLY_RECEIVED
  → PARTIALLY_RECEIVED    (more BE)
  → RECEIVED              (remaining = 0)

RECEIVED / CANCELLED → terminal
```

**Limitation:** No cancel/reversal after DISPATCHED (no stock reversal implemented).

### Document

```
DRAFT → VALIDATED
DRAFT → CANCELLED
VALIDATED → immutable (no edit/delete)
```

---

## 5. Numbering

`DocumentSequenceService.nextNumberInTx`:

1. `SELECT … FOR UPDATE` on `(type, year)`
2. Create row if missing (handle P2002 race)
3. Increment `lastNumber`
4. Format `PREFIX-YYYY-000001`

Prefixes: `TR`, `BS`, `BE`.  
Never trusts client-provided numbers. Concurrent generation tested — no duplicates.

---

## 6. Services

### TransferService

- `createTransfer` / `updateDraftTransfer` / `cancelDraftTransfer`
- `getTransfer` / `listTransfers`
- `markDispatchedInTx` (called by document validate)
- `applyReceiveInTx` (locks lines, updates receivedQuantity, recalculates status)

### StockDocumentService

- `createDraftDocument` / `updateDraftDocument` / `cancelDraftDocument`
- `validateDocument` (BS → dispatch; BE → apply receive)
- Enforces **one non-cancelled BS per transfer**
- Enforces BE `quantity ≤ remaining (sent − received)`

**Neither service** calls InventoryService or writes StockMovement / Pillow.stock.

---

## 7. Transaction Strategy

- Transfer create: generate TR + create header/lines in one tx  
- Document create/validate: lock Transfer (`FOR UPDATE`), lock TransferLines on receive, generate BS/BE number in same tx  
- Concurrent BE validate: line lock → only one of two +3 (remaining 4) succeeds; other `OVER_RECEIVE` — final received **9**, never **12**

---

## 8. Partial Receiving

Example exercised in tests:

```
sent = 10
BE1 = 4 → received 4, inTransit 6, PARTIALLY_RECEIVED
BE2 = 3 → received 7, inTransit 3, PARTIALLY_RECEIVED
BE3 = 3 → received 10, inTransit 0, RECEIVED
```

`inTransit = sentQuantity - receivedQuantity` (computed, not stored).

---

## 9. API

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/inventory/transfers` | auth | list |
| GET | `/api/inventory/transfers/:id` | auth | detail + computed inTransit |
| POST | `/api/inventory/transfers` | admin | create DRAFT |
| PATCH | `/api/inventory/transfers/:id` | admin | DRAFT only |
| POST | `/api/inventory/transfers/:id/cancel` | admin | DRAFT only |
| GET | `/api/inventory/documents` | auth | list |
| GET | `/api/inventory/documents/:id` | auth | detail |
| POST | `/api/inventory/documents` | admin | create DRAFT BS/BE |
| PATCH | `/api/inventory/documents/:id` | admin | DRAFT only |
| POST | `/api/inventory/documents/:id/validate` | admin | validate (+ dispatch/receive state) |
| POST | `/api/inventory/documents/:id/cancel` | admin | DRAFT only |

Existing: `locations`, `balances`, `movements` unchanged.

---

## 10. Tests

`npm run test:transfer-documents` — **ALL PASSED**

| Test | Result |
|------|--------|
| 1 Transfer creation DRAFT | PASS |
| 2 Same source/destination | PASS |
| 3 Invalid qty 0 / -1 | PASS |
| 4 BS creation | PASS |
| 5 Second BS fails | PASS |
| 6 Dispatch, no stock mutation | PASS |
| 7 BE 4 → partial | PASS |
| 8 BE +3 → 7/3 | PASS |
| 9 BE +3 → RECEIVED | PASS |
| 10 Over-receive fails | PASS |
| 11 Concurrent +3/+3 → received 9 | PASS |
| 12 Validated immutable | PASS |
| 13 Draft edit | PASS |
| 14 Legacy totals unchanged | PASS |
| 15 Number uniqueness | PASS |

---

## 11. Before / After Database Validation

| Metric | Before | After |
|--------|--------|-------|
| COUNT(Pillow) | 2 | 2 |
| SUM(Pillow.stock) | **62** | **62** |
| COUNT(PillowStockHistory) | 11 | 11 |
| COUNT(Location) | 2 | 2 |
| COUNT(InventoryBalance) | 0 | **0** |
| COUNT(StockMovement) | 0 | **0** |

Transfer/document test rows cleaned up. Sequence counters may advance (non-stock).

---

## 12. Regression

| Area | Status |
|------|--------|
| PillowStock / pillow-orders / orders | Unchanged |
| Analytics | Unchanged |
| Locations / balances / movements APIs | Intact |
| Frontend build | SUCCESS |
| Backend tsc new errors | **None** |

---

## 13. Explicit Non-Goals (confirmed NOT done)

- [x] Stock migration / redistribution  
- [x] InventoryBalance mutations  
- [x] StockMovement creation (`TRANSFER_OUT` / `TRANSFER_IN` unused)  
- [x] Order / PillowOrder / reservation / fulfillment / returns  
- [x] Analytics / UI redesign  
- [x] Physical cancel after dispatch  

---

## 14. Risks

1. **Documents without stock effect** — operators may think BS validation moved stock; it does not yet.  
2. Dual state remains: legacy `Pillow.stock` vs empty balances.  
3. Post-dispatch cancellation deferred (needs reversal workflow later).  
4. Request-level idempotency keys deferred; uniqueness via document numbers + state guards.  
5. Future cutover must wire validate → InventoryService atomically.

---

## 15. Recommendation for TASK 6

**Wire operational stock effects on document validation:**

1. Validate BS → `InventoryService.decreasePhysical` at source + ledger `TRANSFER_OUT` (or transit representation)  
2. Validate BE → `increasePhysical` at destination + `TRANSFER_IN`  
3. Keep partial receive / concurrent locks  
4. Still **do not** migrate the legacy 62 until an explicit assign-to-WH script  

Alternatively, if counts remain unknown: first run controlled **legacy stock → WH-MAIN INITIAL** migration (Option B from TASK 4), then enable transfer stock effects.

---

## Final Safety Checklist

- [x] Transfer / TransferLine / StockDocument / StockDocumentLine / DocumentSequence  
- [x] TR/BS/BE numbering concurrency-safe  
- [x] Multiple BE + partial receiving  
- [x] InTransit computed  
- [x] Source ≠ destination; received ≤ sent  
- [x] State machines + validated immutability  
- [x] Concurrent receiving protected  
- [x] No InventoryBalance / StockMovement / Pillow.stock changes  
- [x] No order/reservation/fulfillment/returns/analytics/UI  
- [x] Tests pass + cleanup  
- [x] Frontend build OK  
- [x] Report created  

**STOP — awaiting approval before TASK 6.**
