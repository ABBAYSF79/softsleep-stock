# AUDIT REPORT — Accessory Inventory Management (TASK 0)

**Date:** 2026-09-05  
**Scope:** Pillow / Accessoires stock, orders, analytics, and related mattress-order supplements  
**Constraint:** Read-only audit — **no code modified**  
**Stack note:** Spec §29 mentions MongoDB/Mongoose; this project uses **MySQL + Prisma**. Concurrency must use Prisma/MySQL patterns (`$transaction`, conditional `updateMany`, row locks), not Mongoose.

---

## A. Existing Architecture

### High-level

```
Frontend (React + React Query)
  ├─ PillowOrders / PillowStock / PillowStockAnalytics
  ├─ OrderManagement / AdvancedEdit (OrderPillowItem supplements)
  └─ hooks/useApi.ts → /api/pillow-* , /api/orders

Backend (Express + Prisma)
  ├─ routes/pillow-stock.ts     ← catalog + supply/outgoing + analytics
  ├─ routes/pillow-orders.ts    ← standalone accessory orders
  ├─ routes/orders.ts           ← mattress orders + pillow supplements
  ├─ routes/stock.ts            ← mattress variant stock (parallel domain)
  └─ routes/dashboard.ts        ← mattress Order KPIs only

DB (MySQL)
  ├─ Pillow.stock               ← single scalar source of truth TODAY
  ├─ PillowStockHistory         ← append-only-ish ledger (mutable not enforced)
  ├─ PillowOrder / PillowOrderItem
  └─ Order / OrderPillowItem
```

### Critical architectural facts

| Fact | Detail |
|------|--------|
| No service layer | All inventory logic lives **inline in route handlers**. No `InventoryService` / shared mutation helper. |
| Dual inventory domains | Mattress = `ProductVariant.stock` + `StockHistory`; Accessoire = `Pillow.stock` + `PillowStockHistory`. Fully separate. |
| Single location model | No Warehouse / Showroom / InTransit / Reservation / Transfer. One global `Pillow.stock`. |
| Naming | UI French **Accessoires** ↔ code **Pillow** (`pillow-*` routes/models). |
| No cron jobs | No scheduled stock jobs found. |
| Almost no automated tests | Only `useRowSelection.test.ts` + one e2e; **no pillow/stock scenario tests**. |
| Document numbering | Only Invoice `reference` exists. No TRF/BS/BE sequence system. |

### Roles (actual enum)

`ADMIN` | `SALES` | `LIVREUR` | `SUIVI`  

**Not present:** CAISSIERE, CLIENT (as UserRole). Spec roles must map onto existing roles.

---

## B. Existing Stock Flow

### Source of truth (current)

`Pillow.stock` is the **only** quantity. Total = that field. No per-location breakdown.

### Operations (`/api/pillow-stock`)

| Operation | Route | Auth | Stock effect | History type |
|-----------|-------|------|--------------|--------------|
| List | `GET /` | auth | read `Pillow.stock` | — |
| Create | `POST /` | admin + code `admin123456` | set initial stock | `INITIAL` |
| Supply | `POST /:id/supply` | admin + code | `stock += qty` | `SUPPLY` |
| Outgoing | `POST /:id/outgoing` | admin + code | `stock -= qty` (reject if &lt; 0) | `OUTGOING` (negative qty) |
| History | `GET /history` | admin + code | — | — |
| History query | `GET /history-query` | admin | paginated ledger | — |
| Analytics | `GET /analytics` | admin | derived from history + `Pillow.stock` | — |

### Mutation pattern

All mutations use `prisma.$transaction` + **read → compute → write**:

```
findUnique → previousStock = pillow.stock → newStock = previous ± qty → update({ stock: newStock })
```

**Not atomic against concurrent writers** (no `WHERE stock >= qty`, no `decrement` with check). Two concurrent deductions of the last units can both succeed → negative or oversell risk.

### History model (`PillowStockHistory`)

Fields: `pillowId`, `quantity`, `type`, `reason`, `previousStock`, `newStock`, `userId`, `createdAt`.

Missing vs target ledger: `locationId`, `direction`, `referenceType`/`referenceId`, `transferId`, `orderId`, `fromLocation`, `toLocation`, structured notes.

Types today: `INITIAL` | `SUPPLY` | `OUTGOING` | `ADJUSTMENT`.

Returns from PillowOrder / mattress order use **`ADJUSTMENT`**, not a dedicated `RETURN` type.

---

## C. Existing PillowOrder Flow

### Models

- `PillowOrder`: customer, delivery, `status` (`OrderStatus`), `totalAmount`, `isPaid`, `userId`
- `PillowOrderItem`: `pillowId`, `quantity`, `price`

### Create (`POST /api/pillow-orders`)

1. Consolidate duplicate `pillowId` quantities.
2. Validate pillows exist + `stock >= qty`.
3. Price from `Pillow.price`; ADMIN/SALES may override `totalAmount`.
4. Transaction:
   - Create order `PENDING` + items
   - **Immediately** decrement `Pillow.stock`
   - Write `OUTGOING` with reason `Pillow order #id`
5. Non-admin list filtered to `userId = current user`.

**Stock timing:** deducted at **create**, not at delivery. Status `PENDING/IN_PROCESS/DELIVERED` does **not** change stock again.

### Status (`PATCH /:id/status`)

- Allowed: PENDING, IN_PROCESS, DELIVERED, RETURNED
- Non-admin: own orders only
- `RETURNED` is **locked** (cannot leave RETURNED)
- Transition **into** RETURNED: restore stock via `ADJUSTMENT` (+qty)
- No dedicated fulfillment / pickup / driver transit states

### Payment (`PATCH /:id/payment`)

Admin only → `isPaid` flag. No stock effect.

### Gaps vs target

| Target | Current |
|--------|---------|
| Location-aware sale | Global stock only |
| Reservation then fulfill | Immediate OUTGOING at create |
| Driver IN_TRANSIT | Absent |
| Customer pickup movement type | Absent (`ACCESSORY_DIRECT_SALE` absent) |
| Return to source location | Blind `Pillow.stock += qty` |
| Duplicate return guard | Partial (status lock) — good for status, but no ledger idempotency key |

---

## D. Existing Mattress Order + Accessories Flow

### Model

`OrderPillowItem` on `Order` (`pillowId`, `quantity`, `price`). No `fulfillmentLocation`, no reservation id, no fulfillment method.

### Create (`POST /api/orders`)

1. Validates mattress **and** pillow stock availability.
2. Creates order `PENDING` with optional `pillowItems`.
3. **Does not deduct** variant or pillow stock yet.
4. Auto `totalAmount` uses **mattress variants only** unless manual total provided — pillow supplements can be omitted from auto-total (UI often sends manual total; Advanced Edit adds pillow totals when auto-calculating).

### Status-driven stock (`PATCH` order status path)

| Transition | Variant stock | Pillow stock | Pillow history type |
|------------|---------------|--------------|---------------------|
| PENDING → IN_PROCESS / DELIVERED | −qty (`ORDER`) | −qty | `OUTGOING` |
| IN_PROCESS / DELIVERED → PENDING | +qty (`RETURN`) | +qty | `ADJUSTMENT` |
| * → RETURNED | +qty (`RETURN`) | +qty | `ADJUSTMENT` |
| RETURNED → IN_PROCESS / DELIVERED | −qty (`ORDER`) | −qty | `OUTGOING` |
| IN_PROCESS → DELIVERED | **no change** | **no change** | — |

Helper: local `applyPillowStockChange` inside the status handler (not shared with pillow-orders).

### Advanced Edit (`PUT /:id/full`)

Admin + static password:

1. If old status was IN_PROCESS/DELIVERED → restore old pillow/variant stock.
2. Replace line items.
3. If new status is IN_PROCESS/DELIVERED → deduct new quantities.
4. Advanced edit **allows negative pillow stock** (no check on re-apply). Mattress uses `decrement` without negative guard in comments.

### Delete order (`DELETE /:id`)

- Restores **variant** stock if IN_PROCESS/DELIVERED.
- **Does NOT restore `OrderPillowItem` pillow stock** (bug / data-loss risk).
- Cascade deletes pillow items without ledger compensation.

### Gaps vs target

- No reservation at PENDING
- No fulfillment location
- No driver / pickup / return destination choice
- Return from PENDING also **adds** stock even if never deducted (see Risks)

---

## E. Existing Analytics

### Endpoint

`GET /api/pillow-stock/analytics` (admin)

### Contract (frontend depends on this)

```json
{
  "range": { "from", "to" },
  "summary": {
    "openingStock", "closingStock", "currentStock",
    "supplyQty", "outgoingQty", "adjustmentNet", "initialQty", "netQty", "operations"
  },
  "monthly": [...],
  "perPillow": [...]
}
```

Filters: `pillowId`, `from`, `to` (default ~6 months).

### Logic

- Opening = last history `newStock` before range (else first INITIAL-ish)
- Closing = last history `newStock` ≤ range end
- Current = live `Pillow.stock`
- Aggregates SUPPLY / OUTGOING / ADJUSTMENT / INITIAL in range

### Mattress stock analytics

`GET /api/stock/analytics` exists; `useStockAnalytics` hook exists; **no dedicated page** wired like PillowStockAnalytics.

### Sales KPIs

Dashboard / Sales / Finance / invoices use **mattress `Order` only**. PillowOrders excluded — **must stay excluded** unless explicit product decision.

---

## F. Existing Permissions

| Area | Who |
|------|-----|
| List pillow stock | Any authenticated |
| Mutate pillow stock / history / analytics | ADMIN (+ static code for mutations/history) |
| Pillow orders CRUD-ish | ADMIN all; others own only; payment ADMIN |
| Mattress order pillow supplements | Same order ACL (`order-access.ts`: sales own, livreur/suivi by delivery service) |
| Pillow stock UI unlock | Frontend `sessionStorage` + hardcoded `admin123456` (also backend) |
| Livreur UI | Mattress deliveries; **no PillowOrder livreur flow** |

Static password `admin123456` is duplicated in: pillow-stock, pillow-orders link, orders advanced edit/delete, frontend PillowStock.

---

## G. Existing UI

| Page / Component | Path | Role |
|------------------|------|------|
| `PillowOrders.tsx` | `/pillow-orders` | List/create/status/payment unlock stock |
| `PillowStock.tsx` | `/pillow-stock` | Admin inventory board (locked) |
| `PillowStockAnalytics.tsx` | `/pillow-stock-analytics` | Admin analytics + ledger |
| `PillowOrderDialog` | — | Create order |
| `PillowOrderPreviewDialog` | — | Preview + payment |
| `PillowDialog` / `PillowOperationDialog` / `PillowHistorySheet` | — | Create / supply-outgoing / history |
| `OrderManagementDialog` | — | Mattress + Accessoires supplement |
| `AdvancedEdit.tsx` | `/advanced-edit` | Full rewrite incl. pillows |
| `OrderTicket.tsx` | — | Prints accessoires lines |

Nav: Accessoires Orders in Orders group; stock/analytics reached via buttons (not primary nav items for stock).

**Must preserve** these pages; extend progressively — do not delete.

---

## H. Existing Database Models

### Pillow domain (relevant)

```
Pillow { id, name, price, stock, createdAt, updatedAt }
PillowStockHistory { id, pillowId, quantity, type, reason, previousStock, newStock, userId, createdAt }
PillowOrder { id, userId, customer..., deliveryServiceId?, status, totalAmount, isPaid, ... }
PillowOrderItem { id, orderId, pillowId, quantity, price }
OrderPillowItem { id, orderId, pillowId, quantity, price }
```

### Enums

- `OrderStatus`: PENDING | IN_PROCESS | DELIVERED | RETURNED
- `PillowStockChangeType`: INITIAL | SUPPLY | OUTGOING | ADJUSTMENT
- `UserRole`: ADMIN | SALES | LIVREUR | SUIVI

### Absent (target requires)

Location, InventoryBalance, Transfer, TransferLine, StockDocument (BS/BE), Reservation, InTransit balance, DisplayAllocation, DocumentSequence, extended movement types.

---

## I. Existing API Routes

### Mounted in `app.ts`

| Prefix | File |
|--------|------|
| `/api/pillow-stock` | `pillow-stock.ts` |
| `/api/pillow-orders` | `pillow-orders.ts` |
| `/api/orders` | `orders.ts` (includes pillowItems) |
| `/api/stock` | mattress only |
| `/api/dashboard` | mattress only |

### Pillow-stock surface

- `GET /` `GET /history` `GET /history-query` `GET /analytics`
- `POST /` `POST /:id/supply` `POST /:id/outgoing`

### Pillow-orders surface

- `GET /` `GET /pillow-stock-link` `POST /`
- `PATCH /:id/status` `PATCH /:id/payment`

### No inventory/transfer routes yet

Proposed `/api/inventory`, `/api/transfers`, etc. are greenfield — must not collide with existing mounts.

---

## J. Existing Transactions

| Flow | Transactional? | Atomic stock check? |
|------|----------------|---------------------|
| Create pillow + INITIAL | Yes | N/A |
| Supply / Outgoing | Yes | Soft check only (read then write) |
| Create PillowOrder + deduct | Yes | Soft check |
| PillowOrder RETURNED restore | Yes | Soft |
| Mattress status + pillow deduct/restore | Yes | Soft |
| Advanced Edit | Yes | Soft; can go negative |
| Delete mattress order | **Partial** — restore variants outside strong paired pillow restore; pillow not restored |

Activity logs often created **outside** or after the stock transaction (minor consistency risk on activity only).

---

## K. Problems / Risks

### Critical bugs / integrity

1. **Delete mattress order does not restore pillow stock** when status was IN_PROCESS/DELIVERED.
2. **PENDING → RETURNED** on mattress order **adds** pillow (and variant) stock even though never deducted → stock inflation.
3. **Race conditions**: concurrent PillowOrder creates / status deductions can oversell (no conditional update).
4. **Advanced Edit** can drive `Pillow.stock` negative.
5. **Asymmetric stock timing**: PillowOrder deducts at create; OrderPillowItem at leave-PENDING — easy to confuse operators and analytics (OUTGOING mixes both).

### Medium risks

6. Return typed as `ADJUSTMENT` — pollutes adjustment analytics vs true returns.
7. No idempotency keys on fulfillment/return — relies on status machine only; mattress RETURNED from already-returned path unclear if double-hit possible via other routes.
8. Create order validates pillow stock at PENDING but does not reserve → oversell between create and IN_PROCESS.
9. Hardcoded admin password in multiple places (security + coupling).
10. Business logic duplicated across `pillow-orders.ts` and `orders.ts` (drift risk).
11. Mattress create auto-total may ignore pillow line value.
12. No reconciliation tool — cannot detect ledger vs `Pillow.stock` drift.
13. History not immutability-enforced (nothing prevents future UPDATE/DELETE on history rows).
14. Almost zero automated tests for stock scenarios.

### Low / operational

15. Spec mentions MongoDB; team must implement MySQL locking patterns.
16. Roles CAISSIERE/CLIENT not in enum — permission matrix needs remapping.
17. Invoice numbering only — TRF/BS/BE need new sequence design.

---

## L. Conflicts With New Specification

| Spec requirement | Current behavior | Conflict level |
|------------------|------------------|----------------|
| Multi-location (Warehouse/Showroom) | Single `Pillow.stock` | **Major** — requires new tables + migration |
| TOTAL = SUM(locations) | TOTAL = scalar field | **Major** |
| Presentation / Reserved / Available | Absent | **Major** |
| Reservation without physical deduct | PillowOrder deducts immediately; mattress validates but no reserve | **Major** |
| Transfers + BS/BE + IN_TRANSIT + partial receive | Absent | **Major** |
| Fulfillment location on OrderPillowItem | Absent | **Major** |
| Dedicated movement types (TRANSFER_*, RESERVATION, RETURN, DISPLAY_…) | Only 4 types | **Medium** — extend enum + map old |
| Immutable validated documents | No stock documents | **Major** |
| Return to source location | Blind global +stock | **Major** |
| Keep Pillow.stock until proven unused | Still used everywhere | **Compatibility layer required** |
| Keep PillowStockHistory | Still source for analytics | **Migrate / dual-write** |
| Keep analytics API contract | Frontend depends on shape | **Additive change only** |
| Keep PillowOrder UX/permissions | Exists | **Preserve; rewire stock engine** |
| Keep mattress KPIs excluding PillowOrders | Already excluded | **No change** |
| Commission mattress-only | Already | **No change** |
| No destructive delete of validated docs | N/A today; order delete exists | Align new docs; don't break order delete without plan |
| Mongo concurrency primitives | MySQL/Prisma | **Adapt mechanism** |

---

## M. Migration Strategy

### Principles

1. **Additive first** — new tables alongside `Pillow.stock`.
2. **Dual-write** during transition — location inventory + keep `Pillow.stock` in sync as derived/compatibility field.
3. **Idempotent migration script** — seed default Warehouse + Showroom; place all current `Pillow.stock` into **Warehouse** (or configurable default) once; mark migration flag.
4. **No silent rewrite of history** — append mapped ledger rows or keep old history readable; extend enum with new values without removing old.
5. **Feature flags / progressive cutover** — enable location APIs while UI still shows total = `Pillow.stock` until reconciliation passes.
6. **Backup + counts before migrate** — pillow count, sum(stock), history count, order item quantities outstanding.
7. **Never migrate destructive** in one shot — TASK-by-TASK as specified.

### Proposed compatibility layer

```
Pillow.stock  ≈  SUM(Inventory.physical by location) + InTransit
                 (presentation is subset of showroom physical)
```

During Phase A–C: writers go through `InventoryService` which updates location rows **and** refreshes `Pillow.stock`.  
Readers (old UI) keep using `Pillow.stock` until Task 18 UI cutover.  
Deprecate direct `tx.pillow.update({ stock })` outside the service.

### History mapping

| Old | New |
|-----|-----|
| INITIAL | INITIAL |
| SUPPLY | SUPPLY |
| OUTGOING | OUTGOING (or ACCESSORY_DIRECT_SALE / ORDER fulfillment when reclassified later) |
| ADJUSTMENT | ADJUSTMENT (returns remain ADJUSTMENT until retyped via new RETURN movements going forward) |

Do **not** rewrite historical ADJUSTMENT rows that were returns — optional annotation in reason/`referenceType` for new rows only.

### Default location seed

- `WAREHOUSE` (code: WH-MAIN)
- `SHOWROOM` (code: SR-MAIN)
- Optional virtual `IN_TRANSIT` location **or** separate transit balance table (prefer explicit transit bucket per pillow, not a sellable location)

**Initial stock placement recommendation:** put 100% of current `Pillow.stock` into **Warehouse** physical, presentation=0, reserved=0, unless business confirms showroom split (requires inventory count).

---

## N. Exact Files That Need Modification

### Backend (will change over tasks)

| File | Why |
|------|-----|
| `backend/prisma/schema.prisma` | Location, Inventory, Transfer, Movement, Reservation, sequences |
| New migrations under `backend/prisma/migrations/` | Additive schema |
| `backend/src/routes/pillow-stock.ts` | Supply/outgoing/analytics → inventory service |
| `backend/src/routes/pillow-orders.ts` | Reserve/fulfill/return location-aware |
| `backend/src/routes/orders.ts` | OrderPillowItem reservation/fulfillment; fix delete/PENDING→RETURNED |
| `backend/src/app.ts` | Mount new `/api/inventory`, `/api/transfers` |
| **New** `backend/src/services/inventory/*` | Central mutation engine (does not exist today) |
| **New** migration/seed scripts | Locations + stock split |
| Possibly `backend/src/middleware/auth.ts` | Fine-grained permissions later |

### Frontend

| File | Why |
|------|-----|
| `src/hooks/useApi.ts` | New hooks; keep existing pillow hooks working |
| `src/pages/PillowStock.tsx` | Evolve toward location view |
| `src/pages/PillowStockAnalytics.tsx` | Additive metrics |
| `src/pages/PillowOrders.tsx` + pillow-orders components | Fulfillment location / method |
| `src/components/orders/OrderManagementDialog.tsx` | Location + method on supplements |
| `src/pages/AdvancedEdit.tsx` | Same |
| `src/App.tsx` + `nav-config.ts` | New inventory/transfer routes |
| **New** Transfer / Bon / Ledger / Reconciliation pages | Task 18 |

### Do not casually change (regression surface)

- `dashboard.ts`, Finance, SalesOverview, ProductOverview (KPI isolation)
- Commission calculation paths
- OrderTicket / invoice print flows (extend carefully)
- Mattress `stock.ts` domain (parallel; only touch if shared patterns)

---

## O. Proposed Task Plan

Aligned with master spec; refined with audit findings:

| Task | Focus | Gate before next |
|------|-------|------------------|
| **0** | Full audit → this report | User validation |
| **1** | Domain model design (Prisma sketch, reuse vs new) | User validation — **no code yet until approved** |
| **2** | Location system + seed (WH/SR) | Build OK; Pillow.stock unchanged |
| **3** | Inventory per location + sync `Pillow.stock` | Reconciliation script: sum(locations)+transit == Pillow.stock |
| **4** | Stock ledger extension + dual-write from old history writers | Analytics still green |
| **5** | Supply → location-aware | Scenario A |
| **6** | Display/presentation allocation | Constraints enforced |
| **7–10** | Transfer + BS + BE + reverse + partial | Scenarios B–D, L |
| **11** | Reservation engine | Scenario F, I |
| **12** | PillowOrder cutover (preserve UX) | Scenario E/G/H/K; existing order list OK |
| **13** | OrderPillowItem cutover + **fix delete & PENDING→RETURNED bugs** | Mattress order regression |
| **14** | Driver IN_TRANSIT flow | |
| **15** | Unified returns | Scenario H, K |
| **16** | Reconciliation API/UI | Discrepancy visible |
| **17** | Analytics additive fields | Old contract preserved |
| **18** | UI progressive | Old pages still work |
| **19** | Scenario tests A–L | CI/local green |

**Recommended first coding decision (Task 1):** prefer new `InventoryBalance` + `StockMovement` tables over overloading `PillowStockHistory` alone; keep writing `PillowStockHistory` for compatibility until Task 17.

---

## P. Regression Risks

| Risk | Mitigation |
|------|------------|
| PillowOrders create fails after cutover | Feature flag; dual-write; keep endpoint contracts |
| Analytics chart breaks | Additive JSON fields only; keep summary/monthly/perPillow |
| Mattress order status stock double-dip | Shared fulfillment state machine + tests J |
| Stock totals diverge during dual-write | Nightly/on-demand reconciliation; block deploys if discrepancy |
| Advanced Edit / delete break | Explicit Task 13 regression checklist |
| Permissions / livreur | Do not change order-access until Task 14 |
| KPI inflation if PillowOrders pulled into dashboard | Explicit ban in Task 17/18 |
| Migration run twice doubles stock | Idempotent migration marker table |
| Frontend unlock / admin code flows | Leave passwords/session unlock until security task (out of inventory scope unless requested) |

### Post-task checklist (mandatory)

- Backend `tsc` / build  
- Frontend build  
- Manual smoke: create PillowOrder, status, return; mattress order with pillows PENDING→IN_PROCESS→DELIVERED→RETURNED; pillow supply/outgoing; analytics page load  
- Compare `SUM(Pillow.stock)` before/after when touching migration  

---

## Appendix — Reference Index (`Pillow.stock` writers/readers)

### Writers (direct `Pillow.stock` mutation)

1. `backend/src/routes/pillow-stock.ts` — create, supply, outgoing  
2. `backend/src/routes/pillow-orders.ts` — create deduct, RETURNED restore  
3. `backend/src/routes/orders.ts` — status transitions, advanced edit apply/revert  

### Readers

- All of the above validators  
- `GET /api/pillow-stock` + analytics `currentStock`  
- Frontend: `PillowStock`, `PillowOrderDialog`, `OrderManagementDialog`, `AdvancedEdit`, `PillowStockAnalytics`  

### No other backends/crons found

---

## Appendix — Target Architecture (preview for Task 1)

```
Pillow (catalog: name, price; stock = COMPUTED/COMPAT)
Location (WAREHOUSE | SHOWROOM | …)
InventoryBalance (pillowId, locationId, physical, presentation, reserved)
  available = physical - presentation - reserved
InTransitBalance (pillowId, qty) OR TransferLine residual
StockMovement (immutable ledger, rich refs)
Transfer + TransferLine + status machine
StockDocument (BS / BE linked to Transfer)
Reservation (orderType, orderId, lineId, locationId, qty, status)
```

**Company physical** = Σ location.physical + in_transit  
**Saleable at location** = available  

---

## TASK 0 Conclusion

The current accessory system is a **single-bucket stock** with two order channels and a thin history ledger. It is **operationally useful but not location-safe, reservation-safe, or transfer-capable**. Several **integrity bugs** already exist (delete without pillow restore; PENDING→RETURNED inflation; races; advanced-edit negatives).

The master spec is a **large additive migration**, not a rewrite. Existing APIs, pages, PillowOrder permissions, analytics contract, mattress KPIs, and commission rules must be preserved while introducing a real inventory engine underneath.

**Next step:** await validation, then **TASK 1 — Domain Model Design only** (schema proposal, no implementation).
