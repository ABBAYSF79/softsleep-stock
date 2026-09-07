# Inventory Cutover Runbook

**Audience:** Admin / operator  
**Rule:** Physical count is the source of truth. Never copy `Pillow.stock` into opening inventory.

---

## BEFORE COUNT

1. Verify system health (app + DB reachable).
2. Take a **database backup** and store it offline. Do not mark backup confirmed until this is real.
3. Open **Inventory → Cutover → Legacy Orders** (`GET /api/inventory/cutover/legacy-orders`).
4. For **every** open accessory mattress order and pillow order, choose explicitly:
   - `CLOSE_UNDER_LEGACY` — finish under old rules; no Reservation; no inventory movement
   - `FREEZE` — block inventory-affecting changes until unfrozen/closed
   - Do **not** use `MIGRATE_TO_INVENTORY` unless a later post-cutover reconciliation process is approved (API refuses auto-migrate today)
5. Prepare count sheets: `npm run inventory:count-sheet`
6. Assign counters for Warehouse (`WH-MAIN`) and Showroom (`SR-MAIN`).
7. Communicate the freeze window to staff.

---

## COUNT

1. Set cutover freeze when ready: Admin Cutover status → `FROZEN` (`POST /api/inventory/cutover/status` with `confirm: true`), or mark count started.
2. Count Warehouse physical (presentation must be **0**).
3. Count Showroom physical and presentation (`presentation ≤ physical`).
4. Double-check discrepancies between counters.
5. Mark count finalized (`POST /api/inventory/cutover/count-finalized`).
6. Fill `backend/data/opening-inventory.json` from the count (copy from template).
7. Compute SHA-256 via dry-run output (`fileHash`).

```bash
cd backend
npm run inventory:opening -- --dry-run --file ./data/opening-inventory.json
```

Example dry-run fields per pillow: Warehouse physical, Showroom physical, Presentation, Company physical, Available WH/SR.

---

## RECONCILIATION

1. Open Cutover → Reconciliation (or use API preview).
2. Compare **legacy Pillow.stock** vs **physical company count**.
3. Investigate differences with management.
4. **Administrator approval** — never auto-repair / never auto-convert legacy stock into opening stock.

---

## PRE-CUTOVER

All must be true:

- [ ] `GET /api/inventory/cutover/readiness` has **no blockers** (or remaining blockers explicitly accepted by management)
- [ ] All open accessory flows closed/frozen/resolved
- [ ] Backup taken and `--confirm-backup` will be honest
- [ ] Count finalized
- [ ] Opening file hash recorded from dry-run
- [ ] Freeze active during count; no forbidden legacy stock mutations
- [ ] Regression tests re-run

---

## EXECUTION (future — not TASK 15)

```bash
npm run inventory:opening -- --execute --file ./data/opening-inventory.json --confirm-backup
```

This single transaction:

- creates InventoryBalance + INITIAL movements
- sets Pillow.stock mirror
- sets `inventoryMode = INVENTORY`
- stores opening file hash / cutover timestamps

If any validation fails → **full ROLLBACK**. No partial cutover.

UI **Execution** tab stays disabled; CLI only.

---

## AFTER

1. `npm run inventory:cutover:verify`
2. Run reconciliation UI
3. Smoke-test: supply, sale/reservation, transfer, BS/BE
4. Confirm legacy pillow-stock paths require INVENTORY location / cannot bypass
5. Confirm mattress stock remains isolated

---

## ABORT / ROLLBACK

- **During execute transaction failure:** automatic ROLLBACK — safe.
- **After successful cutover:** no casual undo. Use ADJUSTMENT / RETURN / compensating movements.
- Pre-cutover abort: set `cutoverStatus = ABORTED` or return to `OPEN` (does not invent stock).

---

## SAFETY

- Do not restore historical `Pillow.stock` to 62.
- Do not invent Warehouse/Showroom splits from history.
- Do not auto-migrate open legacy orders into Reservations.
