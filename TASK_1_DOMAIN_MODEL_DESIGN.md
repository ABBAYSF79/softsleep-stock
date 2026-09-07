# TASK 1 — DOMAIN MODEL DESIGN

## Accessory Inventory Management

**Status:** DESIGN ONLY — no code, schema, or migrations applied  
**Date:** 2026-09-05  
**Depends on:** `AUDIT_REPORT.md` (TASK 0 — validated)  
**Stack:** MySQL · Prisma · Express · React · React Query  

---

## 1. Executive Summary

The current accessory inventory is a **single global counter** (`Pillow.stock`) with a thin history ledger (`PillowStockHistory`) and two sales channels (`PillowOrder`, `OrderPillowItem`).

The target architecture introduces:

- **Locations** (Warehouse, Showroom — extensible)
- **InventoryBalance** per `(Pillow, Location)` with physical / presentation / reserved
- **Available** as a **computed** value (never independently editable)
- **Company physical** = Σ location.physical + in-transit residual
- **Immutable StockMovement** ledger (alongside legacy `PillowStockHistory`)
- **Generic Transfer** + **Bon de Sortie / Bon d’Entrée** documents
- **Reservation** before physical fulfillment
- **Compatibility dual-write** so existing UI/APIs keep working

**Principle:** evolve under the existing models; do not replace `Pillow`, `PillowOrder`, or `OrderPillowItem` blindly. Keep `Pillow.stock` updated as a **compatibility mirror** until cutover is proven.

---

## 2. Existing vs Target Architecture

### Existing

```
Pillow.stock  ← sole quantity
     ↑ written by routes inline
PillowStockHistory (INITIAL | SUPPLY | OUTGOING | ADJUSTMENT)

PillowOrder ──immediate OUTGOING──► Pillow.stock--
Order + OrderPillowItem ──status leave PENDING──► Pillow.stock--
```

### Target

```
Pillow (catalog: name, price; stock = COMPAT MIRROR)
Location (WH-MAIN, SR-MAIN, …)
InventoryBalance (pillowId + locationId)
  physical, presentation, reserved
  available = physical - presentation - reserved   ← computed

InTransit residual (from open TransferLines)

StockMovement (immutable rich ledger)  ║ dual-write ║  PillowStockHistory (legacy)
Transfer + TransferLine + StockDocument (BS / BE)
Reservation (order-linked, location-linked)
```

### What stays untouched (behavior / contracts)

| Keep | Why |
|------|-----|
| `Pillow`, `PillowOrder`, `PillowOrderItem`, `OrderPillowItem` models | Existing data + UI |
| `Pillow.stock` field | Old UI/API readers |
| `PillowStockHistory` + enum values | Analytics / history pages |
| Mattress `OrderStatus` enum | Do not invent parallel order statuses on `Order` |
| Dashboard / Sales / Finance = mattress only | Explicit product rule |
| Commission = mattress only | Explicit product rule |
| Roles: ADMIN, SALES, LIVREUR, SUIVI | No new enum roles |

---

## 3. Domain Model Diagram

```
┌────────────┐       ┌──────────────────┐
│   Pillow   │───────│ InventoryBalance │──────┐
│  (catalog) │ 1   * │ pillow+location  │      │
└─────┬──────┘       └────────┬─────────┘      │
      │                       │                │
      │                       ▼                │
      │              ┌────────────────┐        │
      │              │    Location    │        │
      │              └───────┬────────┘        │
      │                      │                 │
      │     ┌────────────────┼─────────────────┘
      │     │                │
      ▼     ▼                ▼
┌──────────────┐    ┌─────────────────┐
│ Reservation  │    │  StockMovement  │ (immutable)
└──────┬───────┘    └────────┬────────┘
       │                     │
       │            ┌────────┴────────┐
       │            │                 │
       ▼            ▼                 ▼
┌─────────────┐  ┌──────────┐   ┌──────────────┐
│PillowOrder /│  │ Transfer │───│StockDocument │
│OrderPillow  │  │ + Lines  │   │ BS / BE      │
│Item         │  └──────────┘   └──────────────┘
└─────────────┘
```

**Company physical ownership**

```
companyPhysical =
  SUM(InventoryBalance.physical for all locations)
  + SUM(TransferLine.sentQuantity - TransferLine.receivedQuantity)
      for transfers in {OUTGOING, IN_TRANSIT, PARTIALLY_RECEIVED}
```

---

## 4. Location Model

### Purpose

Generic stock place. Never hardcode “only warehouse → showroom”.

### Proposed fields

| Field | Type | Notes |
|-------|------|-------|
| `id` | Int PK | |
| `code` | String | Unique business code: `WH-MAIN`, `SR-MAIN` |
| `name` | String | Display name |
| `type` | Enum `LocationType` | `WAREHOUSE` \| `SHOWROOM` \| `OTHER` |
| `active` | Boolean default true | Soft-disable; no hard delete if balances exist |
| `isSellable` | Boolean default true | Showroom true; future DAMAGED false |
| `allowsPresentation` | Boolean | Typically true for SHOWROOM only |
| `sortOrder` | Int optional | UI ordering |
| `createdAt` / `updatedAt` | DateTime | |

### Constraints

- `@@unique([code])`
- Index on `type`, `active`

### Seed (Task 2)

| code | type | name |
|------|------|------|
| `WH-MAIN` | WAREHOUSE | Entrepôt principal |
| `SR-MAIN` | SHOWROOM | Showroom principal |

### Relations

- `InventoryBalance[]`
- `Transfer` as source / destination
- `Reservation[]`
- `StockMovement[]` (location / from / to)

### Extensibility

Later: `WH-2`, `SR-CASABLANCA`, `DAMAGED`, `RETURNS_HOLD` via new rows — **no schema redesign**.

---

## 5. InventoryBalance Model

### Purpose

Source of truth for quantities **at a location** for one pillow.

### Fields

| Field | Type | Notes |
|-------|------|-------|
| `id` | Int PK | |
| `pillowId` | Int FK → Pillow | |
| `locationId` | Int FK → Location | |
| `physical` | Int | Units physically at location (≥ 0) |
| `presentation` | Int | Subset of physical for display (≥ 0) |
| `reserved` | Int | Reserved but still physically present (≥ 0) |
| `updatedAt` | DateTime | |
| `version` | Int optional | Optimistic concurrency if needed |

### Unique

```
@@unique([pillowId, locationId])
```

### Available — stored or calculated?

**Decision: CALCULATED, never stored.**

```
available = physical - presentation - reserved
```

Storing `available` creates a third independent value that can diverge.  
API responses may expose `available` as a derived field.

### Invariants (application-enforced)

```
physical >= 0
presentation >= 0
reserved >= 0
presentation <= physical
reserved <= physical - presentation
available >= 0   // follows from above
```

MySQL CHECK (8.0.16+) can help for non-negativity; **cross-field** rules must be enforced in `InventoryService` with conditional updates.

### Compatibility mirror

After every successful inventory mutation:

```
Pillow.stock = SUM(all InventoryBalance.physical) + inTransitQty(pillow)
```

So old UI continues to show a coherent company total.

---

## 6. Presentation Model

Presentation is **not** a separate balance table. It is `InventoryBalance.presentation` on a location with `allowsPresentation = true` (normally SHOWROOM).

### Semantics

| Question | Answer |
|----------|--------|
| Is it company physical? | **Yes** — included in `physical` |
| Is it saleable? | **No** — excluded from `available` |
| Is allocation a transfer? | **No** — internal reallocation |

### Operation: Display allocation

Movement type: `DISPLAY_ALLOCATION`

| Case | Effect |
|------|--------|
| Increase presentation by N | `presentation += N` (physical unchanged) |
| Decrease presentation by N | `presentation -= N` (returns to saleable pool) |

Requires: `available` before increase ≥ N (i.e. `physical - presentation - reserved >= N`).

Prevents: `presentation > physical`.

Audit fields on movement: pillow, location, qty delta, before/after presentation, user, reason, optional reference.

---

## 7. Reservation Model

### Purpose

Hold saleable quantity for an order **without** reducing physical.

### Fields

| Field | Type | Notes |
|-------|------|-------|
| `id` | Int PK | |
| `pillowId` | Int | |
| `locationId` | Int | Fulfillment source |
| `quantity` | Int | > 0 |
| `status` | Enum | `ACTIVE` \| `RELEASED` \| `FULFILLED` \| `CANCELLED` |
| `orderSource` | Enum | `PILLOW_ORDER` \| `MATTRESS_ORDER` |
| `pillowOrderId` | Int? | FK soft/nullable |
| `pillowOrderItemId` | Int? | |
| `orderId` | Int? | Mattress Order |
| `orderPillowItemId` | Int? | |
| `idempotencyKey` | String | Unique — prevents double reserve |
| `reservedByUserId` | Int | |
| `fulfilledQuantity` | Int default 0 | Partial fulfill support |
| `createdAt` / `updatedAt` / `releasedAt?` / `fulfilledAt?` | DateTime | |

### Uniqueness / idempotency

```
@@unique([idempotencyKey])
```

Recommended key format:

```
RES:{orderSource}:{orderId}:{lineId}:{locationId}
```

Also: at most one `ACTIVE` reservation per `(orderSource, lineId)` enforced in service.

### Status machine

```
ACTIVE → FULFILLED   (physical out)
ACTIVE → RELEASED    (cancel / revert)
ACTIVE → CANCELLED   (alias of release if preferred — pick one; recommend RELEASED)
FULFILLED / RELEASED → terminal
```

### Stock effects

| Event | physical | presentation | reserved | available |
|-------|----------|--------------|----------|-----------|
| Reserve N | — | — | +N | −N |
| Release N | — | — | −N | +N |
| Fulfill N | −N | — | −N | — (unchanged) |

### Integration note

During compatibility phase, creating a reservation may also update legacy `Pillow.stock` **only on fulfill**, not on reserve — so old “total stock” still means company physical, while available is location-aware.  
**Exception for transitional PillowOrder behavior:** see §13 — may keep immediate fulfill until Task 12 cutover flag.

---

## 8. StockMovement Model

### Purpose

Immutable, audit-friendly ledger for the **new** system.  
**Does not replace** `PillowStockHistory` during migration.

### Fields

| Field | Type | Notes |
|-------|------|-------|
| `id` | BigInt/Int PK | |
| `pillowId` | Int | |
| `locationId` | Int? | Primary location affected |
| `fromLocationId` | Int? | Transfers / fulfillments |
| `toLocationId` | Int? | |
| `quantity` | Int | Signed: + in, − out (or always positive + `direction`) |
| `direction` | Enum | `IN` \| `OUT` \| `INTERNAL` |
| `movementType` | Enum `StockMovementType` | See below |
| `physicalBefore` / `physicalAfter` | Int? | Snapshot at location |
| `presentationBefore` / `presentationAfter` | Int? | |
| `reservedBefore` / `reservedAfter` | Int? | |
| `reason` | String? | |
| `notes` | String? Text | |
| `referenceType` | Enum/String? | `TRANSFER`, `STOCK_DOCUMENT`, `PILLOW_ORDER`, `ORDER`, `RESERVATION`, `MANUAL` |
| `referenceId` | Int? | |
| `transferId` | Int? | |
| `stockDocumentId` | Int? | |
| `reservationId` | Int? | |
| `pillowOrderId` / `orderId` | Int? | |
| `userId` | Int | |
| `createdAt` | DateTime | No `updatedAt` — immutable |

### Movement types (enum candidate)

```
INITIAL
SUPPLY
TRANSFER_OUT
TRANSFER_IN
RESERVATION
RESERVATION_RELEASE
OUTGOING
FULFILLMENT
ACCESSORY_DIRECT_SALE
ORDER_CUSTOMER_PICKUP
DELIVERY_FULFILLMENT
RETURN
DAMAGE
ADJUSTMENT
DISPLAY_ALLOCATION
```

### Legacy compatibility

| Old `PillowStockChangeType` | New mapping (going forward) |
|-----------------------------|-----------------------------|
| INITIAL | INITIAL |
| SUPPLY | SUPPLY |
| OUTGOING | OUTGOING / FULFILLMENT / ACCESSORY_DIRECT_SALE (by context) |
| ADJUSTMENT | ADJUSTMENT (legacy returns stay as historical ADJUSTMENT) |

**Dual-write:** each new engine mutation writes:

1. `StockMovement` (rich)
2. `PillowStockHistory` (legacy shape) for analytics continuity
3. Refresh `Pillow.stock` mirror

Do **not** rewrite historical ADJUSTMENT rows that were returns.

### Immutability strategy

- **No UPDATE/DELETE API** for `StockMovement`
- Corrections = new compensating movement
- DB: app-level only (MySQL cannot easily revoke UPDATE privilege per table in Prisma); document as hard rule in service
- Optional: DB trigger later (out of scope)

---

## 9. Transfer Model

### Fields

| Field | Type | Notes |
|-------|------|-------|
| `id` | Int PK | |
| `reference` | String unique | `TRF-2026-000124` |
| `sourceLocationId` | Int | |
| `destinationLocationId` | Int | Must differ from source |
| `status` | Enum `TransferStatus` | See §15 |
| `notes` | String? | |
| `createdByUserId` | Int | |
| `approvedByUserId` | Int? | |
| `shippedAt` / `receivedAt` / `cancelledAt` | DateTime? | |
| `createdAt` / `updatedAt` | DateTime | |

### Rules

- Generic FROM → TO (any active locations)
- No hardcoded Warehouse→Showroom
- Validated documents cannot be deleted (status ≠ DRAFT)

---

## 10. TransferLine Model

| Field | Type | Notes |
|-------|------|-------|
| `id` | Int PK | |
| `transferId` | Int | |
| `pillowId` | Int | |
| `sentQuantity` | Int | Set at ship (≥ 0) |
| `receivedQuantity` | Int default 0 | Cumulative across receives |
| `notes` | String? | |

Derived:

```
remainingQuantity = sentQuantity - receivedQuantity
```

Constraints:

```
@@unique([transferId, pillowId])   // one line per pillow per transfer
receivedQuantity <= sentQuantity
sentQuantity >= 0
```

---

## 11. StockDocument Model

Unified document for Bon de Sortie and Bon d’Entrée.

| Field | Type | Notes |
|-------|------|-------|
| `id` | Int PK | |
| `reference` | String unique | `BS-…` / `BE-…` |
| `type` | Enum | `BON_SORTIE` \| `BON_ENTREE` |
| `transferId` | Int | |
| `status` | Enum | `DRAFT` \| `VALIDATED` \| `CANCELLED` (CANCELLED only if never stock-effecting; prefer no cancel after validate) |
| `documentDate` | DateTime | |
| `createdByUserId` | Int | |
| `receivedByUserId` | Int? | BE only |
| `notes` | String? | |
| `createdAt` | DateTime | |

### Lines (StockDocumentLine)

| Field | Notes |
|-------|-------|
| `documentId` | |
| `transferLineId` | Link to transfer line |
| `pillowId` | Denormalized for print |
| `quantity` | For BS = shipped qty; for BE = **this reception event** qty |
| `sentQuantitySnapshot` | On BE: what was expected remaining/sent context |

### Bon de Sortie effect (on validate / ship)

```
source.physical -= qty
inTransit residual += qty   // via TransferLine.sent
destination.physical unchanged
```

Movement: `TRANSFER_OUT`

### Bon d’Entrée effect (on validate receive)

```
inTransit residual -= receivedQty
destination.physical += receivedQty
```

Movement: `TRANSFER_IN`

**Never** auto-receive `sentQuantity` if UI omits received qty.

### Print

Documents must be printable (company info, refs, locations, lines, users, signatures). Reuse invoice print patterns where possible; do not break tickets.

---

## 12. InTransit Strategy

### Options compared

| Option | Pros | Cons |
|--------|------|------|
| **A. Virtual location `IN_TRANSIT`** | Fits InventoryBalance pattern | Risk of treating as sellable if misconfigured; mixes “place” with “state” |
| **B. Dedicated `InTransitBalance` table** | Explicit; easy queries | Extra table; dual update paths |
| **C. Derive from TransferLine** `sent - received` | Single source of truth; no drift vs transfers | Heavier queries; need careful indexing |

### Decision: **Option C as source of truth**, with optional **cached Option B later**

**Chosen for this project: Option C (primary).**

```
inTransit(pillowId) =
  SUM(sentQuantity - receivedQuantity)
  over TransferLines whose Transfer.status ∈
    {OUTGOING, IN_TRANSIT, PARTIALLY_RECEIVED}
```

Why safest here:

- Cannot diverge from transfer documents (Rules 3, 10, 13)
- Partial receive naturally updates residual
- No sellable location to misuse
- Matches “sent ≠ received” semantics exactly

**Optional later:** materialize `InTransitBalance` as a cache updated only inside `TransferService` transactions if analytics need speed — still driven by TransferLine.

### Company physical

```
companyPhysical(pillow) =
  SUM(InventoryBalance.physical) + inTransit(pillow)
```

In-transit is **owned** by company, **not saleable**, **not at showroom/warehouse available**.

---

## 13. Order Integration

### 13.1 PillowOrder / PillowOrderItem

**Do not remove models.** Add optional inventory metadata later (or side tables) without breaking creates.

#### Target lifecycle (after Task 12)

| Step | Behavior |
|------|----------|
| **Create** | Validate `available` at chosen `fulfillmentLocation` (default SHOWROOM or WH — **business decision**). Create `Reservation` ACTIVE. Status `PENDING`. **Do not** reduce physical yet. |
| **Direct sale / immediate showroom** | Flag `fulfillmentMethod = DIRECT_SALE` → reserve+fulfill in one transaction (physical −qty). Movement `ACCESSORY_DIRECT_SALE`. |
| **Customer pickup** | Method `CUSTOMER_PICKUP` → fulfill at showroom. Movement `ORDER_CUSTOMER_PICKUP`. |
| **Driver delivery** | Method `DELIVERY` → fulfill to IN_TRANSIT (driver), then clear transit on DELIVERED. Movement `DELIVERY_FULFILLMENT`. |
| **Status IN_PROCESS / DELIVERED** | Must not double-deduct if already fulfilled. |
| **RETURNED** | `ReturnService` to source location / damaged; reservation/fulfillment reverse once. |

#### Compatibility bridge

Until Task 12 cutover flag:

- Keep current “deduct at create” **via InventoryService** writing location balance + mirror `Pillow.stock` + dual history, so behavior matches today but goes through the engine.

#### Proposed future fields (design only — add in later tasks)

On `PillowOrder` or side table:

- `defaultFulfillmentLocationId`
- `fulfillmentMethod` enum: `DELIVERY` \| `CUSTOMER_PICKUP` \| `DIRECT_SALE`

On `PillowOrderItem` or Reservation link:

- `reservationId`, `fulfilledQuantity`

### 13.2 Mattress Order + OrderPillowItem

**Preserve** mattress `Order.status`: `PENDING | IN_PROCESS | DELIVERED | RETURNED`.

Inventory lifecycle is **orthogonal** (tracked on Reservation + item fields):

```
Order PENDING
  → create Reservation(s) on create or on confirm   [Task 13 decision]
Order IN_PROCESS / DELIVERED
  → Fulfill reservation at fulfillmentLocation
Order RETURNED
  → ReturnService (once)
```

#### Proposed future fields on `OrderPillowItem`

| Field | Purpose |
|-------|---------|
| `fulfillmentLocationId` | Never arbitrary deduction |
| `fulfillmentMethod` | DELIVERY / CUSTOMER_PICKUP / … |
| `reservationId` | Link |
| `fulfilledQuantity` | Idempotent fulfill |
| `returnedQuantity` | Idempotent return |

#### Mapping to existing status (preserve UX)

| Mattress status today | Inventory meaning (target) |
|-----------------------|----------------------------|
| PENDING | Reserved (or not yet — see open decisions) |
| IN_PROCESS | Fulfilled / out to driver or packing |
| DELIVERED | Customer received; transit cleared |
| RETURNED | Return processed |

**Critical:** `IN_PROCESS → DELIVERED` must remain **zero stock delta** if already fulfilled at IN_PROCESS (already true today for pillows).

---

## 14. Return Strategy

### Destinations

| Type | Effect |
|------|--------|
| `RETURN_TO_SHOWROOM` | destination showroom `physical += qty` |
| `RETURN_TO_WAREHOUSE` | warehouse `physical += qty` |
| `DAMAGED` | Prefer location with `isSellable=false` **or** `DAMAGE` movement reducing saleable and increasing damaged hold — **open decision** if DAMAGED location needed in Task 2 |

### Rules

- Link to original order + reservation/fulfillment
- `returnedQuantity` cumulative ≤ `fulfilledQuantity`
- Duplicate return → `DUPLICATE_RETURN`
- Movement type: `RETURN` (not `ADJUSTMENT` for new ops)
- Optional: returns land as `reserved` or inspection hold (`presentation`-like non-saleable) until admin clears — **open business decision**

### PillowOrder RETURNED

Replace blind `Pillow.stock +=` with return to **fulfillment location that supplied the goods**. Status lock `RETURNED` remains.

---

## 15. State Machines

### TransferStatus

```
DRAFT
  → APPROVED          (admin)
  → CANCELLED         (admin; only if never shipped)

APPROVED
  → OUTGOING          (create/validate Bon Sortie; stock leaves source)
  → CANCELLED         (admin; no stock yet)

OUTGOING
  → IN_TRANSIT        (optional explicit step, or collapse with OUTGOING)

IN_TRANSIT
  → PARTIALLY_RECEIVED (first BE with received < sent)
  → RECEIVED           (BE completes all lines)

PARTIALLY_RECEIVED
  → PARTIALLY_RECEIVED (more BE events)
  → RECEIVED           (remaining = 0 for all lines)

RECEIVED → terminal
CANCELLED → terminal
```

**Invalid examples:** RECEIVED → IN_TRANSIT; CANCELLED → APPROVED; DRAFT → RECEIVED.

#### When stock changes

| Transition | Stock |
|------------|-------|
| DRAFT / APPROVED | None |
| → OUTGOING / ship BS | Source −, transit + |
| BE receive | Transit −, dest + |
| CANCEL after ship | **Forbidden** — use reverse transfer / adjustment |

#### Idempotency

- Ship once per transfer (`shippedAt` set / status guard)
- Each BE line event has idempotency key
- Receive cannot exceed remaining

### ReservationStatus

```
ACTIVE → FULFILLED | RELEASED
FULFILLED / RELEASED → terminal
```

### StockDocument

```
DRAFT → VALIDATED  (stock effects here)
VALIDATED → no delete; corrections via new docs/movements
```

---

## 16. Transaction Boundaries

All use Prisma `$transaction` (+ conditional `updateMany` for concurrency).

### Supply

1. Lock/get InventoryBalance (create if missing)
2. `physical += qty`
3. StockMovement SUPPLY
4. Dual-write PillowStockHistory SUPPLY
5. Refresh Pillow.stock mirror
6. Activity log  
Rollback on any failure.

### Reservation

1. Check available ≥ qty (conditional update `reserved` where available enough)
2. Create Reservation ACTIVE + idempotencyKey
3. Movement RESERVATION  
No physical change. Mirror `Pillow.stock` unchanged.

### Reservation release

1. Status ACTIVE → RELEASED (once)
2. `reserved -= qty`
3. Movement RESERVATION_RELEASE

### Transfer ship (Bon Sortie validate)

1. Transfer APPROVED → OUTGOING/IN_TRANSIT
2. For each line: source available/physical enough; `physical -= sent`
3. Create BS document + lines
4. Movements TRANSFER_OUT
5. Dual-write + mirror refresh  
Destination untouched.

### Transfer receive (Bon Entrée)

1. Validate remaining ≥ receivedQty
2. Create BE (or BE event) 
3. `receivedQuantity +=`
4. Dest `physical +=`
5. Movement TRANSFER_IN
6. Update transfer status PARTIAL/RECEIVED
7. Mirror refresh

### Direct sale

1. Ensure presentation not sold (available check)
2. Optional reserve+fulfill atomic OR physical −
3. Movement ACCESSORY_DIRECT_SALE
4. Link PillowOrder
5. Dual-write + mirror

### Fulfillment

1. Reservation ACTIVE; qty ok
2. physical −, reserved −
3. Status FULFILLED / partial fulfilledQuantity
4. Movement FULFILLMENT / DELIVERY_FULFILLMENT / ORDER_CUSTOMER_PICKUP
5. Dual-write + mirror

### Return

1. Guard duplicate / qty
2. Dest physical + (or DAMAGED path)
3. Movement RETURN
4. Update returnedQuantity
5. Dual-write + mirror

### Display allocation

1. Check available ≥ delta (for increase)
2. presentation ±
3. Movement DISPLAY_ALLOCATION
4. Dual-write optional (legacy type ADJUSTMENT or skip legacy if confusing — prefer legacy ADJUSTMENT with clear reason for analytics continuity)

---

## 17. Constraints

### Database-level (Prisma / MySQL)

| Constraint | Implementation |
|------------|----------------|
| Unique location code | `Location.code` @unique |
| One balance per pillow+location | `@@unique([pillowId, locationId])` |
| Unique transfer reference | `Transfer.reference` @unique |
| Unique document reference | `StockDocument.reference` @unique |
| Unique reservation idempotency | `Reservation.idempotencyKey` @unique |
| Unique transfer line | `@@unique([transferId, pillowId])` |
| Unique document sequence row | `DocumentSequence(prefix, year)` @unique |
| Non-negative ints | App + optional MySQL CHECK |

### Application / service-level (required)

| Rule | Why app-level |
|------|----------------|
| available ≥ 0 | Cross-field |
| presentation ≤ physical | Cross-field |
| reserved ≤ physical − presentation | Cross-field |
| received ≤ sent | Cross-row on TransferLine |
| Transfer source ≠ destination | |
| Invalid status transitions | State machine |
| No delete validated BS/BE | |
| Duplicate fulfill/return | Business idempotency |
| Concurrent oversell prevention | Conditional UPDATE where `physical - presentation - reserved >= N` |
| Pillow.stock mirror coherence | Derived write |

---

## 18. Indexes

| Table | Indexes |
|-------|---------|
| Location | `code` unique; `type`; `active` |
| InventoryBalance | unique `(pillowId, locationId)`; `locationId` |
| StockMovement | `(pillowId, createdAt)`; `locationId`; `transferId`; `movementType`; `referenceType+referenceId`; `userId` |
| Transfer | `reference` unique; `(status, createdAt)`; source/dest FKs |
| TransferLine | unique `(transferId, pillowId)`; `pillowId` |
| StockDocument | `reference` unique; `transferId`; `type` |
| Reservation | `idempotencyKey` unique; `(status, pillowId)`; order FKs; `locationId` |
| DocumentSequence | unique `(prefix, year)` |

---

## 19. Permissions

Map **existing** roles only.

| Capability | ADMIN | SALES | LIVREUR | SUIVI |
|------------|-------|-------|---------|-------|
| View inventory totals | ✓ | ✓ (read) | limited assigned | limited |
| Supply / adjustment / display alloc | ✓ | ✗ | ✗ | ✗ |
| Create/approve/ship/receive transfer | ✓ | ✗ (unless later) | ✗ | ✗ |
| Validate BS/BE | ✓ | ✗ | ✗ | ✗ |
| Create PillowOrder | ✓ | ✓ | ✗ | ✗ |
| Reserve on create (own orders) | ✓ | ✓ | ✗ | ✗ |
| Fulfill / pickup showroom | ✓ | ✓ | △ assigned | △ |
| Driver delivery fulfill | ✓ | ✗ | ✓ assigned | ✗ |
| Returns | ✓ | ✓ own? | ✗ | △ |
| Reconciliation / analytics | ✓ | ✗ | ✗ | ✗ |
| Legacy pillow-stock password gate | Keep for ADMIN mutations | | | |

△ = only if linked to delivery service / order access (reuse `order-access.ts` patterns).

**Backend enforces all**; frontend hiding is not security.

---

## 20. Document Numbering

### Table `DocumentSequence`

| Field | Type |
|-------|------|
| `id` | Int |
| `prefix` | String (`TRF`, `BS`, `BE`, `ADJ`) |
| `year` | Int |
| `lastValue` | Int |
| `@@unique([prefix, year])` |

### Allocation (concurrency-safe)

Inside transaction:

```
UPDATE DocumentSequence
SET lastValue = lastValue + 1
WHERE prefix = ? AND year = ?
```

Read new value → format `PREFIX-YYYY-000001` (6-digit pad).

**Do not** touch Invoice `reference` / `invoiceNumber` generation.

---

## 21. Legacy Compatibility

### Compatibility period

Phases until Task 17–18 UI fully location-aware:

1. **Dual-write ON** — all mutations via services update InventoryBalance + StockMovement + PillowStockHistory + Pillow.stock
2. **Old routes** thin wrappers over services
3. **Old analytics** keep reading PillowStockHistory / Pillow.stock
4. **New analytics fields** additive only
5. **Deprecate** direct `tx.pillow.update({ stock })` outside InventoryService (lint/code review rule)
6. **Eventually** treat `Pillow.stock` as generated mirror only; removal is a **future** task after zero direct readers — **not in this program’s early tasks**

### Dual-write strategy

```
InventoryService.mutate(...)
  → InventoryBalance
  → StockMovement
  → PillowStockHistory (legacy types)
  → Pillow.stock = sum(physical) + inTransit
```

### Old UI

`PillowStock`, `PillowOrders`, analytics pages keep working against existing endpoints.

### Old analytics contract

Preserve:

```
{ range, summary, monthly, perPillow }
```

Add later (additive): warehouse, showroom, presentation, reserved, available, inTransit, transfers, returns.

---

## 22. Migration Strategy

1. Backup DB  
2. Count pillows, `SUM(stock)`, history rows, open orders with pillow lines  
3. Task 2: create Location rows WH-MAIN, SR-MAIN (no stock move yet beyond empty balances)  
4. Task 3: for each Pillow, create InventoryBalance at **WH-MAIN** with `physical = Pillow.stock` (idempotent: skip if balance exists and migration flag set)  
5. Verify `SUM(balance.physical) == SUM(Pillow.stock)` and inTransit = 0  
6. Enable dual-write for new ops  
7. Do **not** delete history  
8. Fix legacy bugs in Tasks 12–13 when order flows cut over  

**Initial placement recommendation:** 100% current stock → Warehouse (unless business provides a counted showroom split).

Idempotency: `InventoryMigration` flag table or `meta` row `pillow_inventory_v1 = done`.

---

## 23. Legacy Bug Resolution Plan

| # | Bug | Fix when | How |
|---|-----|----------|-----|
| 1 | DELETE mattress order skips pillow restore | **Task 13** | Delete path calls InventoryService restore if fulfilled; or block delete if stock docs exist |
| 2 | PENDING → RETURNED inflates stock | **Task 13** | Return only if previously fulfilled/deducted; else status-only |
| 3 | Concurrent oversell | **Task 3+** (engine) | Conditional updates on available/physical |
| 4 | Advanced Edit negative stock | **Task 13** | Same engine guards; reject if insufficient |
| 5 | Asymmetric PillowOrder vs OrderPillowItem timing | **Task 12–13** | Unify on reserve→fulfill; flag for transitional immediate fulfill |
| 6 | Returns as ADJUSTMENT | **Task 15** | New RETURN movements; leave old rows |
| 7 | No idempotency | **Task 11–15** | idempotencyKey on reserve/fulfill/receive/return |
| 8 | No reservation | **Task 11** | Reservation model |
| 9 | No reconciliation | **Task 16** | Reconciliation service/API |

**TASK 1 does not fix these.**

---

## 24. Proposed Service Layer

Introduce gradually (first real usage Task 3–5). Routes become thin.

| Service | Owns | Called by |
|---------|------|-----------|
| **InventoryService** | Balance mutations, available checks, Pillow.stock mirror, display alloc, supply/outgoing | pillow-stock routes; other services |
| **StockMovementService** | Append-only movements + dual-write to PillowStockHistory | Inventory / Transfer / Fulfillment / Return |
| **ReservationService** | Reserve / release / status; idempotency | pillow-orders, orders |
| **TransferService** | Transfer SM, ship, receive, BS/BE creation, numbering | `/api/transfers` |
| **FulfillmentService** | Direct sale, pickup, driver out; ties reservation→physical | pillow-orders, orders, livreur |
| **ReturnService** | Returns, duplicate guards, destination | pillow-orders, orders |
| **ReconciliationService** (Task 16) | Compare ledger vs balances vs mirror | admin analytics |
| **DocumentSequenceService** | TRF/BS/BE numbers | TransferService |

**Transaction ownership:** the **top-level use-case service** (TransferService, FulfillmentService, etc.) opens the transaction and calls Inventory/StockMovement with `tx` client.

**Prevent duplicated logic:** ban direct stock updates in routes after cutover; single InventoryService entry points.

---

## 25. Risks

| Risk | Mitigation |
|------|------------|
| Dual-write drift | Task 16 reconciliation; alert on mismatch |
| Partial cutover confusion (reserve vs immediate deduct) | Feature flag `ACCESSORY_INVENTORY_V2` |
| Over-complex transfer SM | Allow collapsing OUTGOING+IN_TRANSIT into one ship step if UX prefers |
| Performance of inTransit SUM | Index transfer status + lines; cache later |
| Team bypasses services | Code review + centralize in PR checklist |
| Showroom presentation sold accidentally | available check; UI disables presentation qty |
| Role gaps (no CAISSIERE) | Map showroom ops to ADMIN/SALES |

---

## 26. Open Business Decisions

**Must decide before or during Task 2–3 / 12–13:**

1. **Initial stock placement:** 100% Warehouse (recommended) vs counted split Warehouse/Showroom?  
2. **Default fulfillment location** for new PillowOrders: Showroom or Warehouse?  
3. **When to reserve on mattress OrderPillowItem:** at create (PENDING) or at IN_PROCESS?  
4. **Transitional PillowOrder:** keep immediate physical deduct until flag, or switch to reserve-on-create immediately?  
5. **DAMAGED:** dedicated location vs movement-only?  
6. **Returns saleable immediately** or inspection hold?  
7. **Multiple BE documents per transfer** (recommended) vs single BE with multiple events?  
8. **Transfer SM:** keep separate OUTGOING vs IN_TRANSIT, or merge on ship?  
9. **Driver transit:** reuse TransferLine-style residual vs order-fulfillment transit table? (Recommend small `FulfillmentTransit` or movement-only linked to order — avoid overloading WH↔SR Transfer)  
10. **Legacy outgoing manual** (`POST /pillow-stock/:id/outgoing`): which location does it hit by default?

### Recommendation on §11 (Partial receiving documents)

**Safer architecture: multiple Bon d’Entrée documents per Transfer** (one per reception event), each with its own `BE-…` reference and lines quantities for **that** event.

Why:

- Clearer audit/print trail (“who received 18 on date X”)
- Natural partial receiving
- Avoids mutating a single validated BE (immutability)
- TransferLine.receivedQuantity remains the cumulative truth

Alternative (one BE + child ReceptionEvent) is also valid but adds another entity; multiple BE is simpler for print/permissions.

---

## 27. Task 2 Recommendation

**TASK 2 — Location System (implementation)**

Scope:

1. Add Prisma models: `Location` (+ `LocationType` enum) only — **minimal**  
2. Migration + seed `WH-MAIN`, `SR-MAIN`  
3. Read-only API `GET /api/inventory/locations` (or under `/api/pillow-stock/locations`)  
4. **Do not** move stock yet; **do not** change Pillow.stock writers  
5. Verify build; no regression on pillow pages  

Out of scope for Task 2: InventoryBalance, transfers, order changes.

**Prerequisite answers preferred from open decisions:** confirm seed locations and initial stock placement policy for Task 3.

---

## Appendix A — Proposed Prisma (PROPOSAL ONLY — DO NOT APPLY)

```prisma
// ========== PROPOSAL — NOT APPLIED TO schema.prisma ==========

enum LocationType {
  WAREHOUSE
  SHOWROOM
  OTHER
}

enum TransferStatus {
  DRAFT
  APPROVED
  OUTGOING
  IN_TRANSIT
  PARTIALLY_RECEIVED
  RECEIVED
  CANCELLED
}

enum StockDocumentType {
  BON_SORTIE
  BON_ENTREE
}

enum StockDocumentStatus {
  DRAFT
  VALIDATED
  CANCELLED
}

enum StockMovementType {
  INITIAL
  SUPPLY
  TRANSFER_OUT
  TRANSFER_IN
  RESERVATION
  RESERVATION_RELEASE
  OUTGOING
  FULFILLMENT
  ACCESSORY_DIRECT_SALE
  ORDER_CUSTOMER_PICKUP
  DELIVERY_FULFILLMENT
  RETURN
  DAMAGE
  ADJUSTMENT
  DISPLAY_ALLOCATION
}

enum MovementDirection {
  IN
  OUT
  INTERNAL
}

enum ReservationStatus {
  ACTIVE
  RELEASED
  FULFILLED
  CANCELLED
}

enum ReservationOrderSource {
  PILLOW_ORDER
  MATTRESS_ORDER
}

enum FulfillmentMethod {
  DELIVERY
  CUSTOMER_PICKUP
  DIRECT_SALE
}

model Location {
  id                 Int          @id @default(autoincrement())
  code               String       @unique
  name               String
  type               LocationType
  active             Boolean      @default(true)
  isSellable         Boolean      @default(true)
  allowsPresentation Boolean      @default(false)
  sortOrder          Int          @default(0)
  createdAt          DateTime     @default(now())
  updatedAt          DateTime     @updatedAt

  balances           InventoryBalance[]
  reservations       Reservation[]
  transfersFrom      Transfer[]   @relation("TransferSource")
  transfersTo        Transfer[]   @relation("TransferDestination")
  movements          StockMovement[] @relation("MovementLocation")
  movementsFrom      StockMovement[] @relation("MovementFrom")
  movementsTo        StockMovement[] @relation("MovementTo")

  @@index([type])
  @@index([active])
}

model InventoryBalance {
  id            Int      @id @default(autoincrement())
  pillowId      Int
  locationId    Int
  physical      Int      @default(0)
  presentation  Int      @default(0)
  reserved      Int      @default(0)
  version       Int      @default(0)
  updatedAt     DateTime @updatedAt

  pillow        Pillow   @relation(fields: [pillowId], references: [id])
  location      Location @relation(fields: [locationId], references: [id])

  @@unique([pillowId, locationId])
  @@index([locationId])
}

model StockMovement {
  id                   Int                 @id @default(autoincrement())
  pillowId             Int
  locationId           Int?
  fromLocationId       Int?
  toLocationId         Int?
  quantity             Int
  direction            MovementDirection
  movementType         StockMovementType
  physicalBefore       Int?
  physicalAfter        Int?
  presentationBefore   Int?
  presentationAfter    Int?
  reservedBefore       Int?
  reservedAfter        Int?
  reason               String?
  notes                String?             @db.Text
  referenceType        String?
  referenceId          Int?
  transferId           Int?
  stockDocumentId      Int?
  reservationId        Int?
  pillowOrderId        Int?
  orderId              Int?
  userId               Int
  createdAt            DateTime            @default(now())

  pillow               Pillow              @relation(fields: [pillowId], references: [id])
  location             Location?           @relation("MovementLocation", fields: [locationId], references: [id])
  fromLocation         Location?           @relation("MovementFrom", fields: [fromLocationId], references: [id])
  toLocation           Location?           @relation("MovementTo", fields: [toLocationId], references: [id])
  user                 User                @relation(fields: [userId], references: [id])
  transfer             Transfer?           @relation(fields: [transferId], references: [id])
  stockDocument        StockDocument?      @relation(fields: [stockDocumentId], references: [id])
  reservation          Reservation?        @relation(fields: [reservationId], references: [id])

  @@index([pillowId, createdAt])
  @@index([locationId])
  @@index([transferId])
  @@index([movementType])
  @@index([userId])
}

model Transfer {
  id                   Int            @id @default(autoincrement())
  reference            String         @unique
  sourceLocationId     Int
  destinationLocationId Int
  status               TransferStatus @default(DRAFT)
  notes                String?        @db.Text
  createdByUserId      Int
  approvedByUserId     Int?
  shippedAt            DateTime?
  receivedAt           DateTime?
  cancelledAt          DateTime?
  createdAt            DateTime       @default(now())
  updatedAt            DateTime       @updatedAt

  sourceLocation       Location       @relation("TransferSource", fields: [sourceLocationId], references: [id])
  destinationLocation  Location       @relation("TransferDestination", fields: [destinationLocationId], references: [id])
  lines                TransferLine[]
  documents            StockDocument[]
  movements            StockMovement[]
  createdBy            User           @relation("TransferCreatedBy", fields: [createdByUserId], references: [id])

  @@index([status, createdAt])
}

model TransferLine {
  id               Int      @id @default(autoincrement())
  transferId       Int
  pillowId         Int
  sentQuantity     Int      @default(0)
  receivedQuantity Int      @default(0)
  notes            String?

  transfer         Transfer @relation(fields: [transferId], references: [id], onDelete: Cascade)
  pillow           Pillow   @relation(fields: [pillowId], references: [id])
  documentLines    StockDocumentLine[]

  @@unique([transferId, pillowId])
  @@index([pillowId])
}

model StockDocument {
  id               Int                 @id @default(autoincrement())
  reference        String              @unique
  type             StockDocumentType
  status           StockDocumentStatus @default(DRAFT)
  transferId       Int
  documentDate     DateTime            @default(now())
  notes            String?             @db.Text
  createdByUserId  Int
  receivedByUserId Int?
  createdAt        DateTime            @default(now())

  transfer         Transfer            @relation(fields: [transferId], references: [id])
  lines            StockDocumentLine[]
  movements        StockMovement[]
  createdBy        User                @relation("StockDocumentCreatedBy", fields: [createdByUserId], references: [id])

  @@index([transferId])
  @@index([type])
}

model StockDocumentLine {
  id              Int           @id @default(autoincrement())
  documentId      Int
  transferLineId  Int
  pillowId        Int
  quantity        Int

  document        StockDocument @relation(fields: [documentId], references: [id], onDelete: Cascade)
  transferLine    TransferLine  @relation(fields: [transferLineId], references: [id])
  pillow          Pillow        @relation(fields: [pillowId], references: [id])

  @@index([documentId])
}

model Reservation {
  id                 Int                    @id @default(autoincrement())
  pillowId           Int
  locationId         Int
  quantity           Int
  fulfilledQuantity  Int                    @default(0)
  status             ReservationStatus      @default(ACTIVE)
  orderSource        ReservationOrderSource
  pillowOrderId      Int?
  pillowOrderItemId  Int?
  orderId            Int?
  orderPillowItemId  Int?
  idempotencyKey     String                 @unique
  reservedByUserId   Int
  createdAt          DateTime               @default(now())
  updatedAt          DateTime               @updatedAt
  releasedAt         DateTime?
  fulfilledAt        DateTime?

  pillow             Pillow                 @relation(fields: [pillowId], references: [id])
  location           Location               @relation(fields: [locationId], references: [id])
  movements          StockMovement[]

  @@index([status, pillowId])
  @@index([locationId])
  @@index([pillowOrderId])
  @@index([orderId])
}

model DocumentSequence {
  id        Int    @id @default(autoincrement())
  prefix    String
  year      Int
  lastValue Int    @default(0)

  @@unique([prefix, year])
}

// Existing models gain relations only in later tasks, e.g.:
// Pillow.balances InventoryBalance[]
// Pillow.movements StockMovement[]
// User relations for Transfer/StockDocument/StockMovement
// OrderPillowItem.fulfillmentLocationId / fulfillmentMethod / etc. — Task 13
```

**Note:** Existing `PillowStockChangeType` and `PillowStockHistory` remain as-is.

---

## Appendix B — Driver flow (detail)

Prefer **not** using WH↔SR `Transfer` for last-mile delivery.

```
Fulfillment at source location
  → physical −, reserved −
  → order-linked “out for delivery” state (fulfilledQuantity)
  → optional delivery transit qty on order line (not saleable)
DELIVERED
  → clear delivery transit (customer has goods; company physical − already done at fulfill)
RETURN
  → ReturnService to location
```

This avoids conflating internal replenishment transfers with customer delivery.

---

## Appendix C — Reconciliation design (Task 16 preview)

For each pillow:

| Metric | Formula |
|--------|---------|
| A | Σ InventoryBalance.physical |
| B | Σ (sent − received) open transfers |
| C | Pillow.stock (mirror) |
| D | Expected mirror = A + B |

If `C ≠ D` → `STOCK_DISCREPANCY` with details.  
Also verify per balance: `physical - presentation - reserved >= 0`.  
Optional: reconstruct from StockMovement sum vs balance (heavier).

Never hide discrepancies.

---

# TASK 1 COMPLETE — NO CODE IMPLEMENTED

Only file created/updated: `TASK_1_DOMAIN_MODEL_DESIGN.md`.

Awaiting approval before **TASK 2 — Location System**.
