import { useMemo } from "react";
import { Package } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ConfirmationUser {
  id: number;
  name: string;
  active?: boolean;
}

interface SimulationOrderItem {
  quantity?: number;
  product?: { id?: number; name?: string } | null;
  variant?: {
    name?: string;
    productId?: number;
    product?: { id?: number; name?: string } | null;
  } | null;
  productName?: string;
}

interface SimulationOrder {
  id?: number;
  confirmationUserId?: number | null;
  confirmationUser?: { id?: number; name?: string } | null;
  items?: SimulationOrderItem[];
  orderItems?: SimulationOrderItem[];
}

interface ProductSimulationRow {
  productId: string;
  productName: string;
  quantity: number;
  orderCount: number;
}

interface ConfirmationProductSimulationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: ConfirmationUser[];
  orders?: SimulationOrder[];
  periodLabel?: string;
}

const getInitials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

const getOrderConfirmationUserId = (order: SimulationOrder) =>
  order.confirmationUser?.id ?? order.confirmationUserId ?? null;

const getItemProduct = (item: SimulationOrderItem) => {
  const productId =
    item.product?.id ?? item.variant?.productId ?? item.variant?.product?.id;
  const productName =
    item.product?.name ??
    item.variant?.product?.name ??
    item.productName ??
    "Unknown product";

  return {
    productId: productId != null ? String(productId) : `name:${productName}`,
    productName,
    quantity: Math.max(0, Number(item.quantity ?? 0)),
  };
};

const buildProductSimulationByUser = (
  orders: SimulationOrder[],
  userIds: Set<number>
) => {
  const simulation = new Map<number, Map<string, ProductSimulationRow>>();
  const ordersSeenByUserProduct = new Map<string, Set<number>>();

  for (const order of orders) {
    const confirmationUserId = getOrderConfirmationUserId(order);
    if (confirmationUserId == null || !userIds.has(confirmationUserId)) {
      continue;
    }

    if (!simulation.has(confirmationUserId)) {
      simulation.set(confirmationUserId, new Map());
    }

    const userProducts = simulation.get(confirmationUserId)!;
    const items = order.items ?? order.orderItems ?? [];

    for (const item of items) {
      const { productId, productName, quantity } = getItemProduct(item);
      if (quantity <= 0) continue;

      const existing = userProducts.get(productId);
      if (existing) {
        existing.quantity += quantity;
      } else {
        userProducts.set(productId, {
          productId,
          productName,
          quantity,
          orderCount: 0,
        });
      }

      const seenKey = `${confirmationUserId}:${productId}`;
      if (!ordersSeenByUserProduct.has(seenKey)) {
        ordersSeenByUserProduct.set(seenKey, new Set());
      }
      const seenOrders = ordersSeenByUserProduct.get(seenKey)!;
      if (order.id != null && !seenOrders.has(order.id)) {
        seenOrders.add(order.id);
        userProducts.get(productId)!.orderCount = seenOrders.size;
      } else if (order.id == null) {
        userProducts.get(productId)!.orderCount += 1;
      }
    }
  }

  const result = new Map<number, ProductSimulationRow[]>();
  for (const [userId, products] of simulation.entries()) {
    result.set(
      userId,
      [...products.values()].sort(
        (a, b) =>
          b.quantity - a.quantity || a.productName.localeCompare(b.productName)
      )
    );
  }

  return result;
};

export const ConfirmationProductSimulationDialog = ({
  open,
  onOpenChange,
  users,
  orders = [],
  periodLabel = "Selected period",
}: ConfirmationProductSimulationDialogProps) => {
  const productSimulationByUser = useMemo(() => {
    const userIds = new Set(users.map((user) => user.id));
    return buildProductSimulationByUser(orders, userIds);
  }, [orders, users]);

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      const aUnits = (productSimulationByUser.get(a.id) ?? []).reduce(
        (sum, row) => sum + row.quantity,
        0
      );
      const bUnits = (productSimulationByUser.get(b.id) ?? []).reduce(
        (sum, row) => sum + row.quantity,
        0
      );
      return bUnits - aUnits || a.name.localeCompare(b.name);
    });
  }, [productSimulationByUser, users]);

  const totalUnits = useMemo(
    () =>
      sortedUsers.reduce(
        (sum, user) =>
          sum +
          (productSimulationByUser.get(user.id) ?? []).reduce(
            (userSum, row) => userSum + row.quantity,
            0
          ),
        0
      ),
    [productSimulationByUser, sortedUsers]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-2xl overflow-hidden rounded-2xl border-slate-200 p-0">
        <DialogHeader className="border-b border-slate-100 bg-slate-50/70 px-5 py-5 text-left sm:px-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
              <Package className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="truncate text-lg text-slate-900">
                Product simulation
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm text-slate-500">
                Product quantities from filtered Team Overview orders for {periodLabel}.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[min(70vh,620px)] space-y-4 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">Filtered product count</p>
              <p className="mt-1 text-xs text-slate-500">
                Uses the applied date, confirmation user, product, and status filters.
              </p>
            </div>
            <div className="flex items-center gap-3 text-sm font-semibold text-slate-700">
              <span className="tabular-nums">{sortedUsers.length} users</span>
              <span className="text-slate-300">·</span>
              <span className="tabular-nums">{totalUnits} units</span>
            </div>
          </div>

          {sortedUsers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
              No confirmation users are available for this filter.
            </div>
          ) : (
            <div className="space-y-3">
              {sortedUsers.map((confirmationUser, index) => {
                const productRows =
                  productSimulationByUser.get(confirmationUser.id) ?? [];
                const userUnits = productRows.reduce(
                  (sum, row) => sum + row.quantity,
                  0
                );

                return (
                  <article
                    key={confirmationUser.id}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold tabular-nums text-slate-600">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                              {getInitials(confirmationUser.name)}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-900">
                                {confirmationUser.name}
                              </p>
                              <p className="text-xs text-slate-500">
                                {productRows.length} product
                                {productRows.length === 1 ? "" : "s"} in filtered orders
                              </p>
                            </div>
                          </div>
                          <span className="inline-flex shrink-0 items-center rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold tabular-nums text-sky-800">
                            {userUnits} unit{userUnits === 1 ? "" : "s"}
                          </span>
                        </div>

                        {productRows.length === 0 ? (
                          <p className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500">
                            No filtered orders/products for this confirmation user in{" "}
                            {periodLabel}.
                          </p>
                        ) : (
                          <ul className="space-y-1.5">
                            {productRows.map((row) => (
                              <li
                                key={row.productId}
                                className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-slate-800">
                                    {row.productName}
                                  </p>
                                  <p className="text-[11px] text-slate-500">
                                    in {row.orderCount} order
                                    {row.orderCount === 1 ? "" : "s"}
                                  </p>
                                </div>
                                <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                                  ×{row.quantity}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
