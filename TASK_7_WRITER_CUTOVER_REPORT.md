# TASK 7 — WRITER CUTOVER REPORT

**Date:** 2026-09-05  
**Status:** COMPLETE — controlled writer cutover only (no legacy stock migration)

```
TASK 7 WRITER CUTOVER COMPLETE
NO LEGACY MIGRATION EXECUTED
PRODUCTION STOCK / HISTORY / BALANCES / MOVEMENTS UNCHANGED
```

---

## 1. Before / After metrics (live DB)

| Metric | Before | After |
|--------|--------|-------|
| COUNT(Pillow) | 2 | 2 |
| SUM(Pillow.stock) | **62** | **62** |
| COUNT(PillowStockHistory) | 11 | 11 |
| COUNT(Location) | 2 | 2 |
| COUNT(InventoryBalance) | **0** | **0** |
| COUNT(StockMovement) | **0** | **0** |

Confirmed after isolated tests (`test:inventory-service`, `test:writer-cutover`, `test:transfer-documents`, `test:inventory-balance`, `test:legacy-migration`).

No Warehouse/Showroom allocation was invented. No INITIAL StockMovements. No `--execute` legacy migration.

---

## 2. Architecture after cutover

```text
AccessoryStockWriter (dual-path)
        │
        ├─ unmigrated (no InventoryBalance)
        │     → legacy Pillow.stock + PillowStockHistory
        │
        └─ migrated (InventoryBalance exists)
              → InventoryService
                    → InventoryBalance
                    → StockMovement
                    → PillowStockMirror → Pillow.stock
```

`Pillow.stock` is a **compatibility mirror only** when balances exist.  
`PillowStockHistory` remains legacy; not converted to StockMovement.

---

## 3. Files changed

| File | Change |
|------|--------|
| `backend/src/services/PillowStockMirror.ts` | Mirror helper: `isPillowInventoryMigrated`, `computeCompanyPhysicalStock`, `syncPillowStockMirror` |
| `backend/src/services/AccessoryStockWriter.ts` | Dual-path supply/outgoing; no location guessing |
| `backend/src/services/InventoryService.ts` | Syncs Pillow.stock only if already migrated (or `forceSyncMirror`); docs updated |
| `backend/src/routes/pillow-stock.ts` | Supply/outgoing thin wrappers → AccessoryStockWriter |
| `backend/src/routes/pillow-orders.ts` | Documented location blocker; **legacy writers kept** |
| `backend/src/routes/orders.ts` | Documented location blocker on status + Advanced Edit; **legacy kept** |
| `backend/src/services/StockDocumentService.ts` | Future BS/BE → InventoryService boundary documented; **stock effects not activated** |
| `backend/src/services/TransferService.ts` | Future stock-effect boundary documented |
| `backend/scripts/test-inventory-service.ts` | Isolated temp pillow; production-safe |
| `backend/scripts/test-writer-cutover.ts` | New TASK 7 regression suite |
| `backend/package.json` | `test:writer-cutover` script |

---

## 4. Writer status matrix

| Writer | Path when unmigrated | Path when migrated | Notes |
|--------|----------------------|--------------------|-------|
| `POST /api/pillow-stock` (create) | Legacy INITIAL | Legacy INITIAL | Still no invented balances |
| `POST /:id/supply` | Legacy + history | InventoryService SUPPLY + mirror | Requires `locationId` or `locationCode` |
| `POST /:id/outgoing` | Legacy + history | InventoryService SALE + mirror | Requires explicit location |
| PillowOrder create | Legacy deduct | **Still legacy** | No order location — blocked |
| PillowOrder → RETURNED | Legacy restore once | **Still legacy** | Same blocker |
| Mattress order status (pillow lines) | Legacy | **Still legacy** | No order location — blocked |
| Advanced Edit `PUT /:id/full` pillows | Legacy | **Still legacy** | Same blocker |
| BS/BE validate | Documents only | Documents only | Stock effects deferred |

**No business route mutates `InventoryBalance` directly.** All new inventory mutations go through `InventoryService`.

---

## 5. Accessory order lifecycle (no double deduction)

### Standalone `PillowOrder`

| Event | Stock effect (current) |
|-------|------------------------|
| CREATE | Deduct once (`Pillow.stock` + `PillowStockHistory` OUTGOING) |
| PENDING → IN_PROCESS | None |
| IN_PROCESS → DELIVERED | None |
| → RETURNED (first time) | Restore once (ADJUSTMENT) |
| Already RETURNED | Locked; no further restore |
| Status changes other than return | No deduct/restore |

### Mattress `Order` + `OrderPillowItem`

| Event | Pillow stock effect |
|-------|---------------------|
| CREATE (PENDING) | Validate only; **no deduct** |
| PENDING → IN_PROCESS or DELIVERED | Deduct once |
| IN_PROCESS → DELIVERED | **No second deduct** |
| IN_PROCESS/DELIVERED → PENDING | Restore once |
| → RETURNED | Restore once |
| RETURNED → IN_PROCESS/DELIVERED | Deduct again (reprocess) |
| Advanced Edit (if stock was deducted) | Restore old lines, apply new lines once in same transaction |
| DELETE | Mattress path may skip pillow restore (pre-existing audit finding; unchanged this task) |

Semantics preserved. No InventoryService double-deduct path introduced because order writers were not cut over.

---

## 6. Location blockers (do not guess)

| Flow | Blocker | Temporary behavior |
|------|---------|-------------------|
| PillowOrder | No `locationId` / fulfillment location on model | Legacy `Pillow.stock` |
| Mattress Order pillow lines | No inventory location on Order / OrderPillowItem | Legacy `Pillow.stock` |
| Advanced Edit accessory lines | Same as order | Legacy `Pillow.stock` |
| Migrated pillow supply/outgoing without location | Caller omitted location | **Hard fail** `LOCATION_REQUIRED` |
| Transfer BS/BE stock effects | Balances empty in production | Documents update only; no TRANSFER_OUT/IN movements |

Allowed location codes (`WH-MAIN`, `SR-MAIN`) are used **only** when the caller supplies a verified `locationId` or `locationCode`. No default/fallback.

---

## 7. Compatibility mirror rules

- `syncPillowStockMirror` runs inside the InventoryService transaction after StockMovement.
- Mirror runs only if the pillow **already had** InventoryBalance rows before the mutation, or `forceSyncMirror: true` (bootstrap/migration tooling).
- Prevents accidental InventoryService calls from overwriting unmigrated `Pillow.stock` (e.g. 62 → 10).
- Unmigrated: mirror is a no-op; legacy writers own `Pillow.stock`.

---

## 8. PillowStockHistory vs StockMovement

| Operation | History |
|-----------|---------|
| Unmigrated supply/outgoing/create/orders | `PillowStockHistory` (unchanged) |
| Migrated supply/outgoing | `StockMovement` only (no duplicate history row) |
| Analytics `/api/pillow-stock/analytics` | Still reads `PillowStockHistory` only (not migrated this task) |
| Historical conversion | **Not done** |

---

## 9. Transfer services (future boundary)

Documented, not activated:

```text
BON SORTIE VALIDATED
  → InventoryService.decreasePhysical(source) + TRANSFER_OUT
  → IN TRANSIT
BON ENTREE VALIDATED
  → InventoryService.increasePhysical(destination) + TRANSFER_IN
```

Today, validate still only updates transfer/document state. Activating without balances would invent stock — forbidden.

---

## 10. Tests executed

```bash
npm run test:inventory-service   # PASS
npm run test:writer-cutover      # PASS (new)
npm run test:transfer-documents  # PASS
npm run test:inventory-balance   # PASS
npm run test:legacy-migration    # PASS
```

Covered (isolated temp pillows; production metrics restored):

1. Supply increases physical  
2. Outgoing decreases physical  
3. Negative physical rejected  
4. Presentation cannot exceed physical/available  
5. Reserved cannot exceed available  
6. StockMovement created atomically  
7. Balance + movement + mirror rollback together  
8. Concurrent mutations do not go negative  
9–11. PillowOrder semantics — no double deduct/restore  
12. Advanced Edit negative guard  
13. Mattress `ProductVariant.stock` unchanged  
14. Pillow API shape fields present  
15. Unmigrated → no invented balances; migrated without location fails  

---

## 11. Acceptance criteria checklist

| Criterion | Status |
|-----------|--------|
| Real stock unchanged (62) | ✅ |
| Legacy history unchanged (11) | ✅ |
| No fake WH/SR allocation | ✅ |
| InventoryService central path when location-aware inventory exists | ✅ |
| No direct InventoryBalance mutations in business routes | ✅ |
| No new double deduct/restore | ✅ |
| Transactions protect inventory mutations | ✅ |
| Pillow.stock mirror when migrated | ✅ |
| Existing APIs/frontend contracts preserved | ✅ |
| Tests pass | ✅ |
| No destructive migration | ✅ |

---

## 12. Remaining work (out of scope)

1. Operator-verified WH/SR allocation + TASK 6 `--execute`  
2. Cut over PillowOrder / mattress pillow lines once location fields exist  
3. Activate BS/BE inventory effects after balances exist  
4. Analytics migration off `PillowStockHistory`  
5. Fix pre-existing mattress-order delete pillow-restore gap (audit only)

---

## FINAL

```
Writer cutover prepared and safely dual-pathed.
Unmigrated production data untouched.
InventoryService ready for post-migration location-aware mutations.
```
