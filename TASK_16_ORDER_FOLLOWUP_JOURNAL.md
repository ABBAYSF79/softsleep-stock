# TASK 16 — ORDER FOLLOW-UP JOURNAL (SUIVI)

## 1. Objective

Add an independent free-text chronological journal (**Suivi**) for mattress `Order` and `PillowOrder`, opened from Order Management via a new action icon. History is append-only (no edit/delete). Completely separate from the existing yellow `Note` field.

## 2. Existing Note Preservation

- `Order.note` / `Order.livreurNote` **unchanged**
- UI yellow note under customer name **unchanged**
- Follow-up create path never writes to `note`
- Backend tests assert note remains `EXISTING_NOTE_MUST_STAY` after follow-ups

## 3. Database Model

```prisma
model OrderFollowUp {
  id            Int      @id @default(autoincrement())
  orderId       Int?
  pillowOrderId Int?
  content       String   @db.Text
  userId        Int?
  createdAt     DateTime @default(now())
  // relations: Order?, PillowOrder?, User? (onDelete SetNull)
  @@index([orderId, createdAt])
  @@index([pillowOrderId, createdAt])
}
```

Exactly one parent set at service/API level (`orderId` XOR `pillowOrderId`).

## 4. Migration

- Path: `backend/prisma/migrations/20260908183000_add_order_followups/migration.sql`
- Result: **Applied** via `npx prisma migrate deploy` (MySQL `softsleep`)
- Additive only (CREATE TABLE + FKs + indexes). No DROP / data rewrite.

## 5. API

Mounted at `/api/order-followups`:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/order/:orderId` | List follow-ups (newest → oldest) |
| POST | `/order/:orderId` | Create `{ content }` |
| GET | `/pillow-order/:pillowOrderId` | List for pillow order |
| POST | `/pillow-order/:pillowOrderId` | Create for pillow order |

Server sets `userId` + `createdAt`. Empty / whitespace content rejected (max 8000 chars).

## 6. Backend Service

- File: `backend/src/services/OrderFollowUpService.ts`
- Access: reuses `assertCanAccessOrder` for mattress orders; pillow orders use ADMIN / own SALES / delivery-scoped LIVREUR|SUIVI
- No inventory / reservation / transfer / status updates

## 7. Frontend

- Hooks: `useOrderFollowUps`, `useAddOrderFollowUp`, `usePillowOrderFollowUps`, `useAddPillowOrderFollowUp` in `src/hooks/useApi.ts`
- Sheet: `src/components/orders/OrderFollowUpSheet.tsx` (Sheet side panel, project pattern)
- Order Management: History icon (tooltip **Suivi**) in row/mobile actions — **does not** touch Note UI

## 8. Drawer

Right `Sheet` with:

- Header: order #, client, phone, city, read-only status
- Textarea + **Ajouter le suivi**
- Historique (lazy-loaded only when open)

## 9. History

- Append-only, newest first
- Displays date/time, user name (fallback `Utilisateur supprimé`), full text
- No edit/delete in MVP

## 10. Authentication

All routes use existing `authMiddleware`.

## 11. Authorization

Same order-access rules as Order Management (admin / sales owner / livreur|suivi delivery scope).

## 12. Inventory Isolation

Create follow-up does **not** call InventoryService, ReservationService, TransferService, OpeningInventoryService, or any stock writers. Test snapshot of pillow stock / balances / movements / reservations / transfers unchanged.

## 13. Order Status Isolation

Create follow-up does **not** change `Order.status` or `PillowOrder.status` (asserted in tests).

## 14. Tests

| Suite | Result |
|-------|--------|
| `npm run test:order-followups` | **PASS** |
| `npx vitest run src` | **PASS** (13 tests) |
| Frontend isolation test | **PASS** |

Backend coverage: validation, Order + PillowOrder create, history order, concurrency, note/status isolation, inventory snapshot.

## 15. Regression

| Suite | Result |
|-------|--------|
| `test:order-location` | **PASS** |
| `test:inventory-service` | **PASS** |
| `test:order-inventory` | **PASS** |
| `test:cutover-prep` | **FAIL** (env: expects LEGACY start; local mode already cut over — pre-existing env dependency, unrelated to follow-ups) |
| `npm run build` | **PASS** |

Not all inventory scripts re-run in this session; core inventory + order inventory + location + frontend build OK. Follow-up feature has zero inventory coupling.

## 16. Production Safety

- Additive migration only
- No auto-seed of follow-ups for existing orders
- No note migration
- No status/stock side effects
- History loaded only on drawer open (no N+1 on table load)

## 17. Final Decision

```text
READY_FOR_TESTING
```

### Migration result

`20260908183000_add_order_followups` applied successfully.

### API summary

`GET/POST /api/order-followups/order/:id` and `GET/POST /api/order-followups/pillow-order/:id`.

### Frontend changes

- `OrderFollowUpSheet` + History action on Order Management rows/cards
- Hooks in `useApi.ts`
- Existing Note UI untouched

### Test / build

- `test:order-followups` PASS
- `vitest run src` PASS
- `npm run build` PASS
- `test:cutover-prep` FAIL (environment mode precondition only)
