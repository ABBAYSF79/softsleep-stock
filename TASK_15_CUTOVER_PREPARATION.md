# TASK 15 — Inventory Cutover Preparation

**Date:** 2026-09-06  
**Cutover executed:** NO  
**inventoryMode:** LEGACY (unchanged)  
**Final decision:**

```text
READY_FOR_PHYSICAL_COUNT
```

---

## 1. Executive Summary

TASK 15 delivers preparation tooling only: legacy-order diagnostics/transitions, cutover readiness, freeze controls, physical-count scaffolds, opening dry-run/hash clarity, admin Cutover UI, runbook, and post-cutover verify script.

No production opening inventory, mode switch, stock mutation, or automatic legacy-order migration was performed.

Physical quantities remain unknown until operators count — hence **READY_FOR_PHYSICAL_COUNT**, not READY_FOR_CUTOVER.

---

## 2. Current Production State

| Metric | Value |
|--------|-------|
| inventoryMode | LEGACY |
| cutoverStatus | OPEN |
| Pillow | 2 |
| Pillow.stock SUM | 0 |
| PillowStockHistory | 14 |
| Location | 2 |
| InventoryBalance / StockMovement | 0 / 0 |
| Transfer / StockDocument / Reservation | 0 / 0 / 0 |
| LegacyOrderTransition rows | 0 (no production transitions applied) |

Schema additions (additive, empty): `cutoverStatus` + count/freeze/backup fields on `InventoryCutoverSettings`; table `LegacyOrderTransition`.

---

## 3. Legacy Order Inventory

Open accessory flows (unchanged, read-only):

| ID | Type | Status | locationId | Reservation | Classification |
|----|------|--------|------------|-------------|----------------|
| 1210 | Order | PENDING | null | none | TRANSITION_REQUIRED |
| 1212 | Order | IN_PROCESS | null | none | TRANSITION_REQUIRED |
| 1213 | Order | PENDING | null | none | TRANSITION_REQUIRED |
| 1–3 | PillowOrder | PENDING | null | none | TRANSITION_REQUIRED |
| 55 | PillowOrder | PENDING | 2 | none | TRANSITION_REQUIRED |

**Admin must decide** CLOSE_UNDER_LEGACY or FREEZE (MIGRATE refused — see §4). No business decision was made in this task.

---

## 4. Transition Strategy

Service: `LegacyOrderTransitionService`

| Action | Behavior |
|--------|----------|
| CLOSE_UNDER_LEGACY | Audited record; inventory/status accessory paths **skip** further stock effects |
| FREEZE | Audited record; inventory-affecting changes → `LEGACY_ORDER_FROZEN_FOR_CUTOVER` |
| MIGRATE_TO_INVENTORY | Always `LEGACY_MIGRATION_REQUIRES_EXPLICIT_RECONCILIATION` (no auto-reserve; avoids double-accounting vs physical opening) |

Endpoints:

- `GET /api/inventory/cutover/legacy-orders`
- `POST /api/inventory/cutover/legacy-orders/:source/:id/transition` `{ action, confirm: true }`

---

## 5. Readiness Service

`CutoverReadinessService.getReadinessReport()` → `GET /api/inventory/cutover/readiness`

Returns `{ ready, blockers, warnings, checks[] }` with PASS/WARNING/BLOCKED.

Current expected blockers include: unresolved legacy orders, missing/unfinalized physical count, missing backup confirmation, possibly missing opening file.

---

## 6. Physical Count Workflow

- `PhysicalCountWorkflowService` + `GET /api/inventory/cutover/physical-count-sheet`
- CLI: `npm run inventory:count-sheet`
- Template refreshed: `backend/data/opening-inventory.template.json`
- Fields: pillowId, name, location, physicalCount, presentationCount, notes, countedBy, countedAt
- **No** available/reserved/inTransit as manual inputs
- WH presentation forced 0; SR presentation ≤ physical

---

## 7. Opening Inventory Validation

Existing `OpeningInventoryService` retained and used. Rejects negatives, unknown pillows/locations, WH presentation > 0, presentation > physical, etc. Company stock is **not** derived from legacy `Pillow.stock`.

Dry-run:

```bash
npm run inventory:opening -- --dry-run --file ./data/opening-inventory.json
```

Shows WH / SR / presentation / company physical / illustrative available / informational legacy diff. Full **SHA-256** `fileHash`.

---

## 8. Reconciliation

`GET /api/inventory/cutover/reconciliation-preview` compares legacy stock vs opening file when present. Status `RECONCILIATION_REQUIRED` on differences. **Never auto-repairs.**

---

## 9. Freeze Mechanism

`CutoverFreezeService` + `cutoverStatus`: OPEN | FREEZE_PENDING | FROZEN | COMPLETED | ABORTED

- `POST /api/inventory/cutover/status` (confirm required) — does **not** flip inventoryMode
- FROZEN blocks `AccessoryStockWriter` and legacy order accessory stock paths
- Reads remain available
- **Not activated on production** after tests (restored to OPEN)

---

## 10. Cutover Transaction Design

Documented for future execute (existing `OpeningInventoryService.execute`):

BEGIN → verify freeze/hash/locations/pillows → create balances + INITIAL movements → mirror → mode=INVENTORY → audit → COMMIT; else ROLLBACK.

UI never one-clicks execute.

---

## 11. Idempotency

Opening execute already returns ALREADY_CUTOVER / hash conflict behavior (TASK 9). Transitions are idempotent for same action. Verify script detects post-cutover invariants.

---

## 12. Abort Safety

- Failed execute → transaction rollback
- Successful cutover → **no casual undo**; use ADJUSTMENT/RETURN/compensating movements
- Pre-cutover: ABORTED / OPEN status only

---

## 13. Audit Trail

`Activity` type `CUTOVER_AUDIT` with action, modes, hash, notes, timestamps (FREEZE, COUNT_*, LEGACY_TRANSITION, etc.).

---

## 14. File Integrity

`OpeningInventoryService.fileHash` = full SHA-256 hex of canonical JSON. Stored on execute as `openingFileHash`.

---

## 15. Admin UI

`/inventory/cutover` — Readiness | Legacy Orders | Physical Count | Reconciliation | Execution (disabled).

Tab added to Inventory layout.

---

## 16. Backup Gate

Execute still requires `--confirm-backup`. Readiness treats `backupConfirmedAt == null` as BLOCKED. Production backup was **not** marked confirmed.

---

## 17. Runbook

`docs/INVENTORY_CUTOVER_RUNBOOK.md`

---

## 18. Post-Cutover Verification

```bash
npm run inventory:cutover:verify
```

Read-only. In LEGACY exits `NOT_CUTOVER` (code 2). After real cutover checks mode, INITIAL movements, mirror, constraints, reconciliation.

---

## 19. Tests

| Suite | Result |
|-------|--------|
| test:cutover-prep | PASS 14/14 |
| All prior inventory suites | PASS |
| vitest src | PASS 11 |
| npm run build | PASS |

Production inventory counts unchanged by tests.

---

## 20. Production Before/After

**Before & after TASK 15 tooling/tests:**

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

Additive schema only. No stock/order/reservation production mutations from this task’s business actions.

---

## 21. Remaining Blockers (for actual cutover)

1. Physical count not performed  
2. `opening-inventory.json` not filled from real counts  
3. 7 open accessory flows need explicit CLOSE/FREEZE  
4. Backup not confirmed  
5. Count not finalized / freeze not activated for a real window  

---

## 22. Warnings

- Pillow.stock SUM = 0 is current LEGACY truth after recent operations — opening must still use **physical count**, not restore 62  
- MIGRATE path intentionally refuses auto-reservation  
- UI execution permanently disabled by design  

---

## 23. Final Readiness

```text
READY_FOR_PHYSICAL_COUNT
```

**STOP.** Do not execute opening inventory. Do not switch inventoryMode. Do not invent quantities. Do not migrate/close production orders without an explicit admin action outside this task’s automation.
