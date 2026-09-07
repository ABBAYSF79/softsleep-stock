# TASK 14.1 — Order Inventory Transition Policy

**Status:** Technical application policy (code-enforced)  
**Does NOT authorize:** automatic modification of production orders, cutover, or opening inventory.

---

## Purpose

Document how the application behaves when an order was created **before inventory cutover** (or otherwise has accessory lines without a linked `Reservation`), once:

```text
inventoryMode = INVENTORY
```

---

## Definitions

### Legacy / pre-cutover accessory order

An `Order` or `PillowOrder` that:

- has one or more accessory lines (`OrderPillowItem` / `PillowOrderItem`), and
- has **no** usable inventory `Reservation` linked to it, and
- typically has `locationId = null` (fulfillment location never captured).

These orders may already have affected **LEGACY** `Pillow.stock` while the system was in LEGACY mode.

### Inventory-native order

Created while `inventoryMode = INVENTORY` with a sellable `locationId` and a `Reservation` created atomically with the order.

---

## Policy (must hold)

```text
LEGACY ACTIVE ORDER
        ↓
NO INVENTORY RESERVATION
        ↓
TRANSITION REQUIRED
```

**NO SILENT INVENTORY SKIP.**

In INVENTORY mode, any operation that would change accessory inventory effects for such an order must **fail explicitly**, not return success while leaving stock unchanged.

### Domain error

```text
code: LEGACY_ORDER_INVENTORY_MIGRATION_REQUIRED
message: This order was created before inventory cutover and requires transition
         handling before its accessory inventory can be changed.
```

HTTP mapping: **400** with `{ error, code }` (via `reservationErrorToHttp`).

### Operations that enforce this

- `PATCH` order / pillow-order **status** changes that would fulfill, reverse, or return accessories
- `PUT /orders/:id/full` accessory reconcile when lines/status imply inventory work
- Any future path that calls `OrderAccessoryInventory.onStatusChangeInTx` / `reconcileOrderAccessoriesInTx` with `hasAccessoryLines` / non-empty lines

Orders **without** accessory lines remain unaffected (no reservation required).

---

## What this task does NOT do

Do **not** automatically:

1. create reservations for production legacy orders  
2. assign Warehouse / Showroom (or any default location)  
3. close or cancel production orders  
4. change production order statuses  
5. restore `Pillow.stock` to a historical value  

Operators must choose an explicit transition later.

---

## Allowed future operational options

(Documented for planning; **not** auto-executed by TASK 14.1)

1. **Close under LEGACY** — finish the order while still in LEGACY mode (legacy stock rules).  
2. **Explicit migrate** — assign a known sellable `locationId` and create a `Reservation` matching remaining open accessory qty (requires a dedicated, reviewed admin action).  
3. **Freeze** — leave the order open but block inventory-affecting status changes until migration (current INVENTORY behavior for unmigrated accessory orders).  
4. **Other safe, explicit tooling** — only if implemented and approved; never silent guesswork.

---

## New INVENTORY orders

For new orders with accessories in INVENTORY mode:

- `locationId` remains **mandatory** (sellable location).  
- No automatic default to Warehouse or Showroom.  
- Reservation is created in the **same transaction** as the order.

---

## Location requirement vs legacy null location

| Case | Behavior |
|------|----------|
| New INVENTORY order + accessories, missing location | `INVENTORY_LOCATION_REQUIRED` |
| Legacy order, `locationId = null`, no Reservation | `LEGACY_ORDER_INVENTORY_MIGRATION_REQUIRED` on inventory-affecting changes |
| Legacy order, location set later without Reservation | Still migration-required until an explicit reservation exists |

Null location remains an **identifier** of transition debt, not a cue to invent inventory.

---

## Status lifecycle once migrated (INVENTORY)

| Transition | Accessory effect |
|------------|------------------|
| PENDING → IN_PROCESS | No stock change; reservation stays ACTIVE |
| IN_PROCESS → DELIVERED | Fulfill remaining → physical↓ reserved↓ SALE |
| DELIVERED → PENDING | `reverseDelivery` → physical↑ reserved↑; reservation ACTIVE again |
| * → RETURNED | Return fulfilled qty + release remaining (customer return path) |
| Duplicate same status | Idempotent no-op |

---

## Delete policy (inventory-native)

If a reservation exists:

```text
DELETE → reverse if needed → release → detach orderId → delete order
```

in one transaction. Do not leave reserved stock orphaned.

Legacy orders without reservation delete as before (no inventory reservation work).

---

## Relation to cutover

This policy is a **gate** so cutover cannot silently corrupt stock via old open orders.

It is **not** itself the cutover. Switching `inventoryMode`, opening inventory, and migrating production rows remain separate, reviewed tasks (TASK 15+).
