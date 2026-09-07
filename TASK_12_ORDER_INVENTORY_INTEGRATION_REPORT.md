# TASK 12 — Order & Reservation Inventory Integration Report

**Date:** 2026-09-05  
**Status:** COMPLETE  
**Stop condition:** No cutover, no production order/stock mutations, no TASK 13.

---

## Production confirmation

```text
NO PRODUCTION STOCK MODIFIED
NO PRODUCTION ORDERS MODIFIED
NO PRODUCTION CUTOVER
inventoryMode = LEGACY
InventoryBalance = 0
StockMovement = 0
Reservation = 0
Pillow.stock SUM = 62
```

---

## Architecture

```text
Order / PillowOrder
        ↓
OrderAccessoryInventory (mode gate)
        ↓
ReservationService
        ↓
InventoryService (increaseReserved / fulfillReserved / releaseReserved / increasePhysical RETURN)
        ↓
InventoryBalance + StockMovement + PillowStockMirror
```

**Invariant:** `RESERVATION ≠ physical deduction`. `FULFILLMENT = physical deduction`.

---

## Schema added

Migration: `20260905181454_add_reservations`

- `Reservation` — reference RV-YYYY-######, source ORDER | PILLOW_ORDER, locationId, status, idempotencyKey
- `ReservationLine` — quantity, fulfilledQuantity, releasedQuantity, returnedQuantity

Statuses: `ACTIVE → PARTIALLY_FULFILLED → FULFILLED`, plus `RELEASED` / `CANCELLED`.

---

## Status mapping (INVENTORY mode)

| Order status event | Inventory action |
|--------------------|------------------|
| Create (PillowOrder / Order with accessories) | **Reserve** at `locationId` (required) |
| → IN_PROCESS | No accessory inventory change (stay reserved) |
| → DELIVERED | **Fulfill** remaining reserved (SALE) |
| → PENDING (from IN_PROCESS/DELIVERED) | Return any fulfilled qty + **release** remaining |
| → RETURNED | Return fulfilled qty + **release** remaining |

Mattress `ProductVariant.stock` rules are unchanged and independent.

### LEGACY mode

Existing behavior preserved:

- PillowOrder: deduct `Pillow.stock` on create; restore on RETURNED
- Mattress accessories: deduct on IN_PROCESS/DELIVERED; restore on PENDING/RETURNED

`OrderAccessoryInventory` no-ops when mode is LEGACY.

---

## Location

- INVENTORY + accessories → `INVENTORY_LOCATION_REQUIRED` if `locationId` missing
- Never defaults to WH-MAIN / SR-MAIN
- All mutations target `InventoryBalance(pillowId, locationId)`

---

## Double deduction prevention

- Idempotency key: `ORDER:{id}:RESERVE` / `PILLOW_ORDER:{id}:RESERVE`
- Fulfill is idempotent when status already `FULFILLED`
- INVENTORY status path skips legacy `Pillow.stock` accessory deltas
- Line-level remaining: `quantity - fulfilled - released`

---

## Concurrency

`SELECT … FOR UPDATE` on Reservation + ReservationLine; InventoryService locks InventoryBalance.

Prevents oversell on reserve, double fulfill, over-return.

---

## Legacy orders

- Not auto-converted to reservations
- Read-only diagnostic: `GET /api/inventory/diagnostics/legacy-accessory-orders`

---

## API

| Method | Path |
|--------|------|
| GET | `/api/inventory/reservations` |
| GET | `/api/inventory/reservations/:id` |
| POST | `/api/inventory/reservations/:id/release` |
| POST | `/api/inventory/reservations/:id/fulfill` |
| POST | `/api/inventory/reservations/:id/return` |
| GET | `/api/inventory/diagnostics/legacy-accessory-orders` |

---

## Frontend (minimal extension of TASK 11)

- `/inventory/reservations` list page + nav tab
- PillowOrderDialog / OrderManagementDialog: when Inventory mode initialized + location selected, show **Disponible** from balances instead of global `Pillow.stock`
- Stock page already shows Reserved / Available

---

## Mirror

| Operation | Pillow.stock |
|-----------|--------------|
| Reserve | unchanged |
| Release | unchanged |
| Fulfill | decreases |
| Return | increases |

---

## Tests

`npm run test:order-inventory` — **42/42 PASS**

Plus full regression:

| Suite | Result |
|-------|--------|
| test:inventory-service | PASS |
| test:writer-cutover | PASS |
| test:order-location | PASS |
| test:opening-inventory | PASS |
| test:legacy-migration | PASS |
| test:transfer-documents | PASS |
| test:inventory-transfers | PASS |
| test:order-inventory | PASS |
| frontend `npm run build` | PASS |

---

## Key files

- `backend/src/services/ReservationService.ts`
- `backend/src/services/OrderAccessoryInventory.ts`
- `backend/src/services/InventoryService.ts` (reserved/fulfill InTx helpers)
- `backend/src/routes/pillow-orders.ts`, `orders.ts`, `inventory.ts`
- `backend/scripts/test-order-inventory.ts`
- `src/pages/inventory/InventoryReservationsPage.tsx`

---

## Stop

TASK 12 complete. Do not execute opening inventory, switch mode, or start TASK 13.
