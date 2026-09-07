# TASK 6 — LEGACY MIGRATION REPORT

## Audit / Migration Tooling Complete

**Date:** 2026-09-05  
**Status:** TOOLING + AUDIT + DRY-RUN COMPLETE — **EXECUTION BLOCKED**

```
TASK 6 AUDIT / MIGRATION TOOLING COMPLETE
NO LEGACY STOCK MIGRATION EXECUTED — WAITING FOR VERIFIED LOCATION ALLOCATION
```

---

## 1. Legacy inventory audit

Live database was audited (authoritative at execution time).

| Metric | Value |
|--------|-------|
| COUNT(Pillow) | 2 |
| SUM(Pillow.stock) | **62** |
| COUNT(PillowStockHistory) | 11 |
| COUNT(Location) | 2 (WH-MAIN, SR-MAIN) |
| COUNT(InventoryBalance) | 0 |
| COUNT(StockMovement) | 0 |

**Pillow has no SKU field** in schema.

Commands:

```bash
npm run inventory:migrate-legacy -- --audit --generate-template
npm run inventory:audit-legacy
```

---

## 2. Every Pillow and current stock

| ID | Name | Pillow.stock | Price |
|----|------|--------------|-------|
| 1 | ice sleep | **16** | 400 |
| 2 | memoire de forme | **46** | 250 |

---

## 3. Historical reconstruction

Formula used:

```
INITIAL + SUPPLY + OUTGOING + ADJUSTMENT
```

(`OUTGOING` quantities are already negative in history.)

### Pillow 1 — ice sleep

| Type | Sum qty |
|------|---------|
| INITIAL | +20 |
| OUTGOING | −4 |
| **Reconstructed** | **16** |
| Pillow.stock | 16 |
| Status | **MATCH** |

History reasons: Initial stock; Pillow orders #1–#3; Mattress order #1212 → IN_PROCESS.

### Pillow 2 — memoire de forme

| Type | Sum qty |
|------|---------|
| INITIAL | 0 |
| SUPPLY | +50 |
| OUTGOING | −6 |
| ADJUSTMENT | +2 |
| **Reconstructed** | **46** |
| Pillow.stock | 46 |
| Status | **MATCH** |

History includes mattress order #1209 IN_PROCESS → RETURNED (ADJUSTMENT +2) → reprocessed DELIVERED (OUTGOING −2).

---

## 4. Discrepancies

**None.** Both pillows: reconstructed history == `Pillow.stock`.

Do not “fix” anything — no discrepancy present.

---

## 5. Location evidence found

Searched `PillowStockHistory.reason` for warehouse/showroom/entrepôt/WH-MAIN/SR-MAIN keywords.

**Result: no location evidence on any history row.**

No DB field stores fulfillment location on `PillowOrderItem` / `OrderPillowItem`.

---

## 6. Missing location information

| Pillow | Classification |
|--------|----------------|
| 1 ice sleep | **LOCATION_UNKNOWN** |
| 2 memoire de forme | **LOCATION_UNKNOWN** |

Therefore:

- **DO NOT** assign 100% to WH-MAIN  
- **DO NOT** invent Showroom splits  
- **DO NOT** run `--execute` until operator allocation is provided  

---

## 7. Proposed allocation

**Cannot propose numeric WH/SR splits from data.**

Status for both pillows: **NEEDS_ALLOCATION**

Reserved for migration opening: **0** (no reliable active reservation state in legacy model; order cutover is a later task).

Presentation: unknown → operator may set `0` or a verified showroom display count (`presentation <= showroom`).

---

## 8. Items requiring operator allocation

Template written to:

`backend/data/legacy-inventory-allocation.template.json`

Operator must copy to:

`backend/data/legacy-inventory-allocation.json`

and fill **verified physical counts**:

```json
{
  "version": 1,
  "allocations": {
    "1": { "warehouse": <int>, "showroom": <int>, "presentation": <int> },
    "2": { "warehouse": <int>, "showroom": <int>, "presentation": <int> }
  }
}
```

Validation (enforced by tooling):

```
warehouse >= 0
showroom >= 0
presentation >= 0
presentation <= showroom
warehouse + showroom == Pillow.stock
```

Examples (NOT to use as truth — for format only):

- Pillow 1 stock 16 → e.g. `warehouse + showroom = 16`  
- Pillow 2 stock 46 → e.g. `warehouse + showroom = 46`  

---

## 9. Dry-run result

```bash
npm run inventory:migrate-legacy -- --dry-run
```

Result:

- Allocation file `legacy-inventory-allocation.json` **missing** (expected)  
- Exit: waiting for verified allocation  
- **No writes**

Dry-run with a filled file will print per-pillow WH/SR/presentation/available and `canExecute`.

---

## 10. Reconciliation preview

After a future successful `--execute` (not run):

```
WH.physical + SR.physical == Pillow.stock   (per pillow)
SUM(all physical) == SUM(Pillow.stock)     (global)
presentation <= showroom physical
reserved = 0 at opening
Pillow.stock unchanged
PillowStockHistory unchanged
```

---

## 11. Migration script behavior

| Mode | Behavior |
|------|----------|
| `--audit` | Read-only audit + reconstruction |
| `--generate-template` | Write allocation template |
| `--dry-run --allocation <file>` | Validate plan; write nothing |
| `--execute --allocation <file>` | Single transaction; INITIAL movements; refuse if incomplete |

Package scripts:

```bash
npm run inventory:migrate-legacy -- --audit --generate-template
npm run inventory:migrate-legacy -- --dry-run --allocation ./data/legacy-inventory-allocation.json
npm run inventory:migrate-legacy -- --execute --allocation ./data/legacy-inventory-allocation.json
npm run test:legacy-migration
```

Core logic: `backend/src/services/LegacyInventoryMigration.ts`

---

## 12. Idempotency strategy

Reference: `LEGACY_INVENTORY_MIGRATION_V1`

- Skips pillows that already have `StockMovement` with `referenceType = LEGACY_INVENTORY_MIGRATION_V1` and `type = INITIAL`
- Unique `referenceNumber` per pillow/location: `LEGACY_INVENTORY_MIGRATION_V1:pillow:{id}:WH|SR|PRESENTATION`
- Refuses non-zero existing balances for target locations
- Second `--execute` → `ALREADY_MIGRATED` / skip — no double stock

---

## 13. Rollback strategy

- Full batch in **one Prisma `$transaction`** — any reconciliation failure rolls back all inserts  
- If a later operational mistake occurs after commit: compensating StockMovements / reverse migration procedure (not auto-delete history)  
- Restore from **MySQL backup** if needed  

---

## 14. Backup requirement

```
BACKUP REQUIRED BEFORE EXECUTION
```

Recommended before any future `--execute`:

```bash
mysqldump -u <user> -p softsleep > softsleep_backup_pre_inventory_migration_YYYYMMDD.sql
```

(or managed backup equivalent). Do not overwrite prior backups.

---

## 15. Cutover timestamp strategy

On successful execute:

- Cutover timestamp recorded in `Activity` (`type = LEGACY_INVENTORY_MIGRATION_V1`) with JSON details  
- **Before cutover:** `PillowStockHistory` = legacy evidence (kept intact, not rewritten)  
- **After cutover:** `StockMovement` = new inventory ledger opening + future ops  
- Do **not** convert every legacy history row into StockMovement (would duplicate narrative)

---

## 16. Existing writers requiring future refactor

These still mutate **`Pillow.stock` / `PillowStockHistory` only** and will **drift** from `InventoryBalance` until cutover:

| Writer | File |
|--------|------|
| Create pillow / supply / outgoing | `backend/src/routes/pillow-stock.ts` |
| PillowOrder create + RETURNED restore | `backend/src/routes/pillow-orders.ts` |
| Mattress order status pillow stock | `backend/src/routes/orders.ts` |
| Advanced edit pillow stock | `backend/src/routes/orders.ts` (`PUT /:id/full`) |
| Order delete (variants only; pillow gap known) | `backend/src/routes/orders.ts` |

Also later:

- Transfer BS/BE validate → must call `InventoryService` (TASK 5 documents only today)  
- Reservation / fulfillment / returns  

**Dual-write warning:** After balances exist, legacy routes can still change `Pillow.stock` without updating `InventoryBalance`. Do not leave this gap open in production without the next cutover task.

---

## 17. Risks

1. Operator invents WH/SR without physical count → wrong location truth  
2. Dual-write gap if balances migrated before writers cut over  
3. Pending PillowOrders already deducted from `Pillow.stock` at create — reserved=0 at migration is intentional; do not double-reserve later without care  
4. Mattress order #1210/#1213 PENDING with pillow lines may not have deducted pillow stock yet (stock timing asymmetry) — location migration unaffected, but cutover must respect legacy rules  

---

## 18. Recommendation for next task

1. Operator fills `legacy-inventory-allocation.json` from **physical count**  
2. Run `--dry-run` until `canExecute: true`  
3. Take MySQL backup  
4. Run `--execute` once  
5. Immediately start **writer cutover** (dual-write InventoryService + Pillow.stock mirror) so balances cannot drift  

Optional next: Transfer stock effects only **after** balances exist and writers are dual-writing.

---

## Tests run

`npm run test:legacy-migration` — **PASSED** (validation, NEEDS_ALLOCATION, unknown pillow, refuse execute, no side effects).  

`--execute` was **not** run against production data.

---

## Explicit non-goals confirmed

- [x] No `--execute` without verified allocation  
- [x] No guessing WH/SR  
- [x] No Pillow.stock changes  
- [x] No PillowStockHistory rewrite  
- [x] No order/PillowOrder/transfer writer cutover  
- [x] No Transfer stock effects  

---

**STOP — waiting for verified location allocation from operator.**
