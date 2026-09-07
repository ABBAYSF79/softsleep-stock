# TASK 8 — ORDER LOCATION & FULFILLMENT FOUNDATION REPORT

**Date:** 2026-09-05  
**Status:** COMPLETE — location foundation only (no stock migration / no InventoryService order cutover)

```
TASK 8 ORDER LOCATION FOUNDATION COMPLETE
NO LEGACY STOCK MIGRATION
NO INVENTORYBALANCE / STOCKMOVEMENT / TRANSFER CREATED
PRODUCTION STOCK UNCHANGED
```

---

## 1. Schema changes

Additive Prisma migration:

`backend/prisma/migrations/20260905173000_add_order_fulfillment_location/migration.sql`

| Model | Field | Notes |
|-------|-------|-------|
| `Order` | `locationId Int?` | FK → `Location.id`, `onDelete: Restrict`, indexed |
| `Order` | `location Location?` | Relation |
| `PillowOrder` | `locationId Int?` | FK → `Location.id`, `onDelete: Restrict`, indexed |
| `PillowOrder` | `location Location?` | Relation |
| `Location` | `orders Order[]` | Back-relation |
| `Location` | `pillowOrders PillowOrder[]` | Back-relation |

**Decision:** Fulfillment location lives on the **order header** (`Order` / `PillowOrder`), not on `OrderPillowItem` / `PillowOrderItem`. That matches one physical fulfillment source per order in the current architecture.

`NULL` = **LEGACY / UNKNOWN**. No backfill. No WH-MAIN / SR-MAIN guess.

---

## 2. Legacy data (unchanged / unassigned)

| Entity | Total | `locationId = NULL` |
|--------|-------|---------------------|
| `Order` | 1376 | **1376** |
| `PillowOrder` | 3 | **3** |
| `OrderPillowItem` | 4 | N/A (no location field — parent Order owns location) |

Existing rows were **not** populated.

---

## 3. API changes

Helper: `backend/src/utils/order-location.ts`

- `resolveOptionalSellableLocationId` — omit/null/'' → `null`; else require exists + `active` + `isSellable`
- `canChangeOrderFulfillmentLocation` — allow `PENDING` / `RETURNED`; block `IN_PROCESS` / `DELIVERED`
- Never defaults to Warehouse or Showroom

| Endpoint | Change |
|----------|--------|
| `GET /api/orders` | Includes optional `location` |
| `POST /api/orders` | Accepts optional `locationId`; stores if valid; **no stock timing change** |
| `PUT /api/orders/:id/full` | Optional `locationId`; blocked when status is `IN_PROCESS`/`DELIVERED`; **no inventory transfer** |
| `GET /api/pillow-orders` | Response adds `locationId` + `location` |
| `POST /api/pillow-orders` | Accepts optional `locationId`; stock still legacy path |

Status transitions (`PATCH .../status`) **unchanged** — still legacy `Pillow.stock` / mattress variant stock.

---

## 4. Frontend changes

| Screen | Change |
|--------|--------|
| `PillowOrderDialog.tsx` | Optional fulfillment location selector (create) |
| `OrderManagementDialog.tsx` | Optional location on create; read-only display when viewing |
| `OrderDialog.tsx` | Same optional create selector + view display |

**Not changed:** `AdvancedEdit.tsx` UI (API supports location on full update when safe; UI left alone to avoid unsafe edits). `OrderTicket` untouched.

Location selector is optional; empty = omit `locationId` (legacy).

---

## 5. Location edit policy (Advanced Edit / full update)

Changing `Order.locationId`:

| Current status | Allowed? | Effect |
|----------------|----------|--------|
| `PENDING` | Yes | Metadata only |
| `RETURNED` | Yes | Metadata only |
| `IN_PROCESS` | **No** | Explicit error — stock already deducted |
| `DELIVERED` | **No** | Explicit error |

**Never** creates Transfer / TRANSFER_OUT / TRANSFER_IN / InventoryBalance / StockMovement.

Driver delivery ≠ internal transfer (Transfer system untouched).

---

## 6. Stock safety — before / after

| Metric | Before | After |
|--------|--------|-------|
| COUNT(Pillow) | 2 | 2 |
| SUM(Pillow.stock) | **62** | **62** |
| COUNT(PillowStockHistory) | 11 | 11 |
| COUNT(Location) | 2 | 2 |
| COUNT(InventoryBalance) | **0** | **0** |
| COUNT(StockMovement) | **0** | **0** |
| COUNT(Transfer) | 0 | 0 |

Confirmed after full regression suite.

---

## 7. Tests

```bash
npm run test:order-location      # PASS (new)
npm run test:inventory-service   # PASS
npm run test:writer-cutover      # PASS
npm run test:transfer-documents  # PASS
npm run test:inventory-balance   # PASS
npm run test:legacy-migration    # PASS
```

Covered: NULL allowed, valid assign, invalid/inactive/non-sellable rejected, no WH/SR default, Order + PillowOrder store location, no InventoryBalance/StockMovement/Transfer/Pillow.stock/history mutation from location foundation tests.

---

## 8. Remaining blockers (still legacy `Pillow.stock`)

Even when `locationId` is set on a new order, **TASK 8 does not activate InventoryService** for:

1. PillowOrder create / return  
2. Mattress order PENDING → IN_PROCESS / DELIVERED pillow deductions  
3. Mattress order returns / reverts  
4. Advanced Edit accessory restore/reapply  
5. Unmigrated pillows (`InventoryBalance` still empty in production)

Future cutover must:

```text
Order.locationId (verified, non-null)
  + pillow InventoryBalance exists at that location
  → InventoryService.decreasePhysical / increasePhysical
```

If `locationId` is NULL → keep legacy path (do not invent WH/SR).

Also still blocked: TASK 6 legacy stock allocation (`InventoryBalance` empty until operator allocation + `--execute`).

---

## 9. Files changed

| File | Role |
|------|------|
| `backend/prisma/schema.prisma` | Nullable location relations |
| `backend/prisma/migrations/20260905173000_add_order_fulfillment_location/` | Additive migration |
| `backend/src/utils/order-location.ts` | Validation + policy helpers |
| `backend/src/routes/orders.ts` | Create / list / full update |
| `backend/src/routes/pillow-orders.ts` | Create / list |
| `backend/scripts/test-order-location.ts` | Tests |
| `backend/package.json` | `test:order-location` |
| `src/components/pillow-orders/PillowOrderDialog.tsx` | Optional selector |
| `src/components/orders/OrderManagementDialog.tsx` | Optional selector + view |
| `src/components/orders/OrderDialog.tsx` | Optional selector + view |

---

## 10. Acceptance checklist

| Criterion | Status |
|-----------|--------|
| PillowOrder optional Location | ✅ |
| Order optional Location | ✅ |
| Existing orders valid with NULL | ✅ (1376 / 3) |
| No guessed locations | ✅ |
| Location validation (active + sellable) | ✅ |
| No WH/SR fallback | ✅ |
| Stock semantics unchanged | ✅ |
| No InventoryBalance / StockMovement / Transfer | ✅ |
| Pillow.stock / history unchanged | ✅ |
| APIs/frontend compatible | ✅ |
| Additive migration | ✅ |
| Tests pass | ✅ |

---

## FINAL

```
Order ──optional──► Location (WH-MAIN | SR-MAIN | NULL=legacy)
Future InventoryService fulfillment is prepared, not activated.
```
