# TASK 9 — CLEAN CUTOVER & OPENING INVENTORY REPORT

**Date:** 2026-09-05  
**Status:** TOOLING COMPLETE — **PRODUCTION OPENING NOT EXECUTED**

```
CLEAN CUTOVER MECHANISM READY
NO PRODUCTION OPENING INVENTORY WRITTEN
WAITING FOR OPERATOR PHYSICAL COUNT FILE
inventoryMode = LEGACY
```

---

## Philosophy (replaces prior allocation approach)

```text
OLD DATA  →  KEEP AS HISTORY (PillowStockHistory, Orders)
PHYSICAL COUNT AT CUTOVER  →  NEW OPENING INVENTORY
NEW SYSTEM  →  InventoryBalance + StockMovement + Pillow.stock mirror
```

**Cancelled for this flow:** requiring `legacy-inventory-allocation.json` and  
`warehouse + showroom == Pillow.stock`.

The physical count at cutover is authoritative. Old `Pillow.stock` is compared for information only.

---

## 1. Before (live database)

| Metric | Value |
|--------|-------|
| inventoryMode | **LEGACY** |
| COUNT(Pillow) | 2 |
| SUM(Pillow.stock) | **62** |
| COUNT(PillowStockHistory) | 11 |
| COUNT(Location) | 2 |
| COUNT(InventoryBalance) | **0** |
| COUNT(StockMovement) | **0** |
| COUNT(Transfer) | 0 |
| COUNT(Order) | 1376 |
| COUNT(PillowOrder) | 3 |

| Pillow | Name | Old stock |
|--------|------|-----------|
| 1 | ice sleep | 16 |
| 2 | memoire de forme | 46 |

---

## 2. After this task (unchanged)

Same metrics — no production `--execute` was run.

`opening-inventory.json` is **missing** (template only). Dry-run exit 2.

---

## 3. Opening inventory file

**Template:** `backend/data/opening-inventory.template.json`  
**Operator file (required for execute):** `backend/data/opening-inventory.json`

Structure:

```json
{
  "version": 1,
  "cutoverDate": "YYYY-MM-DD",
  "locations": {
    "WH-MAIN": { "1": { "physical": 0, "presentation": 0 }, "2": { "physical": 0, "presentation": 0 } },
    "SR-MAIN": { "1": { "physical": 0, "presentation": 0 }, "2": { "physical": 0, "presentation": 0 } }
  }
}
```

Rules:

- WH presentation must be **0**
- SR `presentation <= physical`
- `reserved` opens at **0**
- Diff vs old `Pillow.stock` is **informational** (does not block)

---

## 4. Cutover mode

New table: `InventoryCutoverSettings` (singleton id=1)

| Field | Purpose |
|-------|---------|
| `mode` | `LEGACY` \| `INVENTORY` |
| `cutoverAt` | Timestamp when opening committed |
| `cutoverDate` | Date from opening file |
| `referenceType` | `OPENING_INVENTORY_V1` |
| `openingFileHash` | Audit hash of opening file |

`AccessoryStockWriter` now:

- **LEGACY** → always legacy `Pillow.stock` / `PillowStockHistory`
- **INVENTORY** + balances → `InventoryService` (requires location)

Order stock mutation cutover is **not** activated in this task.

---

## 5. Commands

```bash
npm run inventory:opening -- --generate-template
npm run inventory:opening -- --dry-run --file ./data/opening-inventory.json
# backup MySQL
npm run inventory:opening -- --execute --file ./data/opening-inventory.json --confirm-backup
```

Execute requires `--confirm-backup`. Missing file / invalid plan → STOP.

---

## 6. What execute will do (when unblocked)

One transaction:

1. Lock pillows  
2. Refuse if non-zero balances without `OPENING_INVENTORY_V1`  
3. Create WH + SR `InventoryBalance`  
4. Create `INITIAL` StockMovement only when `physical > 0`  
5. Set `Pillow.stock = SUM(physical)` after reconciliation  
6. Set `inventoryMode = INVENTORY`  
7. Activity `OPENING_INVENTORY_V1`  
8. Verify history/orders/transfers unchanged  

Idempotent re-run → `ALREADY_CUTOVER`.

---

## 7. Opening inventory (operator — not filled)

| Pillow | Old stock | WH | SR | Pres | New physical | Diff | Available |
|--------|-----------|----|----|------|--------------|------|-----------|
| *(awaiting opening-inventory.json)* | | | | | | | |

---

## 8. Reconciliation / movements / activity

**N/A on production** — not executed.

After a successful execute, report should show per pillow:

| Pillow.stock | SUM(InventoryBalance.physical) | Diff |
|--------------|--------------------------------|------|
| = | = | 0 |

---

## 9. Idempotency

Isolated tests confirmed second execute → `ALREADY_CUTOVER`, no duplicate balances/movements.

---

## 10. Legacy data

Confirmed unchanged on production after tooling/tests:

- PillowStockHistory = 11  
- Orders = 1376  
- PillowOrders = 3  
- Transfer = 0  
- Pillow.stock sum = 62  

---

## 11. Tests

```bash
npm run test:opening-inventory   # PASS
npm run test:writer-cutover      # PASS (mode-aware)
npm run test:legacy-migration    # PASS
npm run test:inventory-service   # PASS
npm run test:order-location      # PASS
```

---

## 12. Files

| File | Role |
|------|------|
| `backend/prisma/migrations/20260905183000_add_inventory_cutover_settings/` | Cutover settings table |
| `backend/src/services/InventoryMode.ts` | Mode reader |
| `backend/src/services/OpeningInventoryService.ts` | Opening cutover engine |
| `backend/src/services/AccessoryStockWriter.ts` | Respects LEGACY/INVENTORY mode |
| `backend/scripts/opening-inventory.ts` | CLI |
| `backend/scripts/test-opening-inventory.ts` | Isolated tests |
| `backend/data/opening-inventory.template.json` | Zeroed template |
| `backend/package.json` | `inventory:opening`, `test:opening-inventory` |

Prior `inventory:migrate-legacy` tooling remains available but is **not** the desired business cutover path.

---

## 13. Operator next steps (LOCAL and VPS separately)

1. Physically count WH / SR / presentation for each pillow on that environment.  
2. Copy template → `opening-inventory.json` and fill counts.  
3. Dry-run until `canExecute: true` (review Diff column).  
4. Take DB backup.  
5. `--execute --confirm-backup`.  
6. Re-run → expect `ALREADY_CUTOVER`.  
7. Update this report’s After / Reconciliation sections.

Do **not** copy local opening quantities to VPS without a separate physical count.

---

## FINAL

```
Clean cutover tooling ready.
Production still LEGACY with empty InventoryBalance.
STOP — waiting for opening-inventory.json + backup + explicit execute.
```
