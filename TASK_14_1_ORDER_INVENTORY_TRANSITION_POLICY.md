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
STATUS / EDIT ALLOWED
        ↓
NEW INVENTORY SIDE-EFFECTS SKIPPED
```

**No new-ledger mutation for unmigrated legacy accessory orders.**

In INVENTORY mode, status changes and accessory reconcile on such orders **succeed** without creating or fulfilling a `Reservation`. The new inventory ledger (`InventoryBalance` / `StockMovement`) is **not** adjusted. This is intentional so day-to-day order workflow is not blocked by cutover debt.

### Explicit freeze still blocks

If an admin applied **FREEZE** via Cutover UI (`LegacyOrderTransition`), inventory-affecting paths still throw `LEGACY_ORDER_FROZEN_FOR_CUTOVER`.

### Domain error (removed as default)

`LEGACY_ORDER_INVENTORY_MIGRATION_REQUIRED` is **no longer** thrown for ordinary status/reconcile on unmigrated legacy accessory orders. Migration remains available as an optional admin action, not a gate.

### Operations covered

- `PATCH` order / pillow-order **status** changes → skip inventory when no reservation
- `PUT /orders/:id/full` accessory reconcile → skip when no reservation
- Paths calling `OrderAccessoryInventory.onStatusChangeInTx` / `reconcileOrderAccessoriesInTx`

Orders **without** accessory lines remain unaffected (no reservation required).
Inventory-native orders **with** a `Reservation` keep fulfill / reverse / return behavior unchanged.

---

## What this task does NOT do

Do **not** automatically:

1. create reservations for production legacy orders  
2. assign Warehouse / Showroom (or any default location)  
3. restore `Pillow.stock` to a historical value  
4. mutate the new inventory ledger for unmigrated legacy accessory orders  

Status changes on those orders are allowed with inventory skipped. Optional admin transitions (CLOSE / FREEZE / MIGRATE) remain available in Cutover UI.

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
| Legacy order, no Reservation | Status/reconcile allowed; new inventory **skipped** |
| Legacy order with admin FREEZE | `LEGACY_ORDER_FROZEN_FOR_CUTOVER` |
| Legacy order after explicit MIGRATE (has Reservation) | Normal INVENTORY fulfill / reverse / return |

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
