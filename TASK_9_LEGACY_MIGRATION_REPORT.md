# TASK 9 — LEGACY STOCK MIGRATION TO INITIAL INVENTORY

**Date:** 2026-09-05  
**Status:** TOOLING READY — **PRODUCTION EXECUTION BLOCKED**

```
TASK 9 MIGRATION TOOLING COMPLETE
NO PRODUCTION LEGACY STOCK MIGRATION EXECUTED
WAITING FOR VERIFIED LOCATION ALLOCATION
```

---

## Why execution stopped

Per TASK 9 final rule:

> If the allocation file is missing, invalid, incomplete, or does not match the live database: **STOP**. Do NOT guess.

Live check:

| Item | Result |
|------|--------|
| `backend/data/legacy-inventory-allocation.json` | **MISSING** |
| Template | Present with `warehouse: null` / `showroom: null` |
| Location evidence in history | `LOCATION_UNKNOWN` for both pillows |
| Dry-run | Exit 2 — allocation missing |
| `--execute` without `--confirm-backup` | **REFUSED** |

Example WH/SR numbers from the task brief were **not** applied.

---

## 1. Live database before (authoritative)

Printed by migration tooling at run time:

| Metric | Value |
|--------|-------|
| COUNT(Pillow) | **2** |
| SUM(Pillow.stock) | **62** |
| COUNT(PillowStockHistory) | **11** |
| COUNT(Location) | **2** (WH-MAIN, SR-MAIN active) |
| COUNT(InventoryBalance) | **0** |
| COUNT(StockMovement) | **0** |
| COUNT(Transfer) | **0** |
| LEGACY_INVENTORY_MIGRATION_V1 movements | **0** |

### Pillows

| ID | Name | Legacy stock | History vs stock | Location evidence |
|----|------|--------------|------------------|-------------------|
| 1 | ice sleep | 16 | MATCH (diff 0) | LOCATION_UNKNOWN |
| 2 | memoire de forme | 46 | MATCH (diff 0) | LOCATION_UNKNOWN |

### After this task (unchanged — no production execute)

Same metrics: stock **62**, history **11**, balances **0**, movements **0**, transfers **0**.

---

## 2. Allocation (required — not provided)

Expected file:

```text
backend/data/legacy-inventory-allocation.json
```

Template refreshed at:

```text
backend/data/legacy-inventory-allocation.template.json
```

Operator must fill integers so that for **each** pillow:

```text
warehouse >= 0
showroom >= 0
presentation >= 0
presentation <= showroom
warehouse + showroom == Pillow.stock   (read live at execution time)
```

Cover **all** current Pillow IDs. No extras. No guessing from city/driver/history.

---

## 3. Tooling changes (TASK 9)

| File | Change |
|------|--------|
| `backend/src/services/LegacyInventoryMigration.ts` | Conflict detection; always create WH+SR `INITIAL` (incl. physical 0); presentation on INITIAL (no extra ADJUSTMENT); pillow `FOR UPDATE`; expected movement plan; scoped `onlyPillowIds` for isolated tests; Activity details enriched |
| `backend/scripts/migrate-legacy-inventory.ts` | Live DB printout; plan table; `canExecute`; **`--confirm-backup` required** for `--execute`; pre-flight dry validation |
| `backend/scripts/test-legacy-migration.ts` | Isolated execute + idempotency + conflict + concurrency; production untouched |

### Execute command (when ready)

```bash
# 1) Fill allocation from template (verified physical counts)
# 2) Dry-run
npm run inventory:migrate-legacy -- --dry-run --allocation ./data/legacy-inventory-allocation.json

# 3) Take MySQL backup (operator)

# 4) Execute only if canExecute: true
npm run inventory:migrate-legacy -- --execute --allocation ./data/legacy-inventory-allocation.json --confirm-backup
```

Idempotent re-run returns `ALREADY_MIGRATED` with no duplicates.

---

## 4. What execute will create (when unblocked)

For each pillow (currently 2 → **4 balances**, **4 INITIAL movements**):

| Location | physical | presentation | reserved | INITIAL qty |
|----------|----------|--------------|----------|-------------|
| WH-MAIN | warehouse | 0 | 0 | warehouse |
| SR-MAIN | showroom | presentation | 0 | showroom |

References:

```text
LEGACY_INVENTORY_MIGRATION_V1:pillow:{id}:WH
LEGACY_INVENTORY_MIGRATION_V1:pillow:{id}:SR
```

- Does **not** modify `Pillow.stock` or `PillowStockHistory`
- Does **not** create Transfers / in-transit
- Reserved opens at **0**
- One Prisma transaction; reconciliation failure → full rollback
- Activity `type = LEGACY_INVENTORY_MIGRATION_V1` when an admin user exists

---

## 5. Tests executed

```bash
npm run test:legacy-migration   # PASS (isolated execute; production unchanged)
npm run test:inventory-service  # PASS
npm run test:writer-cutover     # PASS
npm run test:order-location     # PASS
npm run test:transfer-documents # PASS
npm run test:inventory-balance  # PASS
```

Isolated coverage includes: valid success, mismatch/negative/presentation/missing/extra, conflict non-zero balance, ALREADY_MIGRATED, no duplicate movements, Pillow.stock/history unchanged, reserved=0, no Transfer, concurrent safe.

Production `--execute` was **not** run.

---

## 6. Backup confirmation

CLI now hard-requires:

```text
--confirm-backup
```

Execute without it prints `BACKUP REQUIRED BEFORE EXECUTION` and exits 2 (verified).

---

## 7. Reconciliation / movements / activity

**Not applicable on production** — migration not executed.

Placeholder for post-execute report update:

| Pillow | Pillow.stock | SUM(physical) | Diff |
|--------|--------------|---------------|------|
| — | — | — | — |

---

## 8. Out of scope (unchanged)

- Order / PillowOrder writers  
- Transfer BS/BE stock effects  
- Analytics  
- Automatic WH/SR assignment for historical orders  

---

## 9. Operator next steps

1. Physically count Warehouse vs Showroom for pillows **1** and **2** (stocks **16** and **46**).  
2. Copy template → `legacy-inventory-allocation.json` and fill verified numbers.  
3. Dry-run until `canExecute: true`.  
4. Take DB backup.  
5. Run `--execute --confirm-backup`.  
6. Re-run execute → expect `ALREADY_MIGRATED`.  
7. Update this report’s after/reconciliation sections with live results (or run a follow-up verify pass).

---

## FINAL

```
Migration engine ready and tested in isolation.
Production opening inventory NOT written.
STOP — waiting for verified allocation + backup + explicit --execute --confirm-backup.
```
