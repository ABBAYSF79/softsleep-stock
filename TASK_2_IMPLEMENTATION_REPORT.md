# TASK 2 — IMPLEMENTATION REPORT

## Location System Foundation

**Date:** 2026-09-05  
**Scope:** Location model + seed + read-only API only  
**Status:** COMPLETE  

```
TASK 2 COMPLETE — LOCATION SYSTEM ONLY
NO INVENTORY/STOCK MIGRATION PERFORMED
```

---

## 1. Files changed

| File | Change |
|------|--------|
| `backend/prisma/schema.prisma` | Added `LocationType` enum + `Location` model (additive) |
| `backend/prisma/migrations/20260905121934_add_inventory_locations/migration.sql` | New migration |
| `backend/prisma/seed.ts` | Calls idempotent `seedLocations()` at start |
| `backend/scripts/seed-locations.ts` | **New** — idempotent WH-MAIN / SR-MAIN upsert |
| `backend/scripts/pillow-stock-snapshot.ts` | **New** — helper to count Pillow stock (validation) |
| `backend/scripts/verify-locations.ts` | **New** — smoke check for seeded locations |
| `backend/src/routes/inventory.ts` | **New** — `GET /locations` |
| `backend/src/app.ts` | Mount `/api/inventory` |
| `backend/package.json` | Script `seed:locations` |
| `src/hooks/useApi.ts` | Added `useInventoryLocations` hook (unused by pages yet) |

**Not modified:** `Pillow`, `PillowStockHistory`, pillow-stock/pillow-orders/orders routes, stock mutation logic, analytics, UI pages.

---

## 2. Prisma changes

### Enum `LocationType`

- `WAREHOUSE`
- `SHOWROOM`
- `OTHER`

### Model `Location`

| Field | Type | Notes |
|-------|------|-------|
| `id` | Int PK autoincrement | |
| `code` | String `@unique` | e.g. `WH-MAIN` |
| `name` | String | |
| `type` | LocationType | |
| `active` | Boolean default true | |
| `isSellable` | Boolean default true | |
| `allowsPresentation` | Boolean default false | |
| `sortOrder` | Int default 0 | |
| `createdAt` / `updatedAt` | DateTime | |

### Indexes

- Unique: `code`
- `type`, `active`, `sortOrder`

No relations to Pillow / InventoryBalance (deferred to later tasks).

---

## 3. Migration name

```
20260905121934_add_inventory_locations
```

Additive `CREATE TABLE Location` + enum only. No ALTER on existing tables.

---

## 4. Seed behavior

- Shared function: `backend/scripts/seed-locations.ts` → `seedLocations()`
- Uses `upsert` on `code` — **idempotent**
- Wired into `prisma/seed.ts` (runs first on full seed)
- Standalone: `npm run seed:locations`

### Seeded rows

| code | name | type | isSellable | allowsPresentation | sortOrder |
|------|------|------|------------|--------------------|-----------|
| WH-MAIN | Entrepôt principal | WAREHOUSE | true | false | 10 |
| SR-MAIN | Showroom principal | SHOWROOM | true | true | 20 |

**Does not** assign or move `Pillow.stock`.

### Double-run result

| Run | Location count |
|-----|----------------|
| 1st | 2 |
| 2nd | 2 (same ids 1, 2 — no duplicates) |

---

## 5. API endpoint

```
GET /api/inventory/locations
```

- Auth: `authMiddleware` (Bearer JWT — same as other routes)
- Filter: `active: true`
- Order: `sortOrder ASC`, then `code ASC`
- Response fields: `id`, `code`, `name`, `type`, `active`, `isSellable`, `allowsPresentation`, `sortOrder`
- **No** mutation endpoints

Verified via Prisma query matching the route (`scripts/verify-locations.ts` → `LOCATION_QUERY_OK`).

---

## 6. Frontend changes

- Added `useInventoryLocations()` in `src/hooks/useApi.ts`
- **No page changes** — PillowStock / PillowOrders / analytics UI untouched
- Hook ready for TASK 3+ consumers

---

## 7. Validation results

| Check | Result |
|-------|--------|
| `prisma validate` | Pass |
| Migration applied | Pass |
| `prisma generate` | Pass (after releasing lock from `ts-node-dev`) |
| Location seed ×2 | Pass — count stays 2 |
| Location query shape | Pass |
| Pillow stock unchanged | Pass (see §8) |
| Frontend `vite build` | Pass |
| Vitest unit (`useRowSelection`) | Pass (3 tests) |
| Vitest picking e2e playwright file | Fail (pre-existing; not related to TASK 2) |
| Backend `tsc` | Fail — **pre-existing** errors only (see §10) |
| ESLint `useApi.ts` | Many pre-existing `no-explicit-any`; new hook follows same style |

### Functional regression notes (Tests 1–7)

1. Pillow stock unchanged — **OK**  
2. PillowStock page — no code path changed — **OK**  
3. PillowOrders — unchanged — **OK**  
4. Mattress orders — unchanged — **OK**  
5. Analytics — unchanged — **OK**  
6. GET locations returns WH-MAIN + SR-MAIN — **OK**  
7. Seed twice no duplicates — **OK**  

---

## 8. Before / after Pillow stock totals

| Metric | Before migration | After seed ×2 |
|--------|------------------|---------------|
| `COUNT(Pillow)` | 2 | 2 |
| `SUM(Pillow.stock)` | 62 | 62 |
| `COUNT(PillowStockHistory)` | 11 | 11 |

**No stock movement performed.**

---

## 9. Tests / build results

```
Frontend build: SUCCESS (vite)
Backend tsc:    FAILED — pre-existing (orders.ts limitNum; users.ts null)
Unit tests:     3 passed (useRowSelection)
e2e via vitest: FAIL suite (Playwright file not meant for vitest — pre-existing)
```

`inventory.ts` introduces **no** new TypeScript errors.

---

## 10. Risks / issues discovered

1. **Backend `tsc` already red** on `orders.ts` (possibly undefined `limitNum`) and `users.ts` (null vs number). Out of TASK 2 scope; not introduced by Location work.  
2. **`prisma generate` EPERM** while `npm run dev` / `ts-node-dev` holds `query_engine-windows.dll.node`. Stop backend briefly before generate/migrate on Windows.  
3. Full `prisma/seed.ts` remains **non-idempotent** for users/products/orders; only the **location** portion is idempotent. Prefer `npm run seed:locations` on existing DBs.  
4. Running backend was briefly stopped to unlock Prisma generate; restart with `npm run dev` in backend if needed.  
5. No HTTP integration test against live server in this report (Prisma-level verification used). After restart, `GET /api/inventory/locations` with a valid token should return the two locations.

---

## Explicit non-goals (confirmed not done)

- InventoryBalance  
- StockMovement / Transfer / BS / BE  
- Reservation / fulfillment / returns  
- PillowOrder / OrderPillowItem changes  
- Pillow.stock migration or redistribution  
- Analytics changes  

---

## Next step (not started)

**TASK 3 — Inventory per location** (pending approval).
