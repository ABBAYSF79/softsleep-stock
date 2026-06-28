import {
  endOfDay,
  endOfMonth,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";
import { DateRange } from "react-day-picker";

export const OVERVIEW_ALL = "ALL";

export type DateFilterPreset =
  | "today"
  | "yesterday"
  | "lastWeek"
  | "lastMonth"
  | "thisMonth"
  | "custom";

export interface ConfirmationUserRecord {
  id: number;
  name: string;
  phone?: string;
  email?: string;
  salesmanId?: number;
  salesman?: { id: number; name: string; email?: string };
  linkedSalesUserId?: number | null;
  linkedSalesUser?: { id: number; name: string; email?: string } | null;
}

export function buildDateRangeParams(
  dateFilter: DateFilterPreset,
  customRange?: DateRange
): { startDate: string; endDate: string } | Record<string, never> {
  const now = new Date();

  if (dateFilter === "custom") {
    if (!customRange?.from || !customRange?.to) return {};
    return {
      startDate: startOfDay(customRange.from).toISOString(),
      endDate: endOfDay(customRange.to).toISOString(),
    };
  }

  switch (dateFilter) {
    case "today":
      return {
        startDate: startOfDay(now).toISOString(),
        endDate: endOfDay(now).toISOString(),
      };
    case "yesterday": {
      const day = subDays(now, 1);
      return {
        startDate: startOfDay(day).toISOString(),
        endDate: endOfDay(day).toISOString(),
      };
    }
    case "lastWeek":
      return {
        startDate: startOfDay(subDays(now, 6)).toISOString(),
        endDate: endOfDay(now).toISOString(),
      };
    case "lastMonth":
      return {
        startDate: startOfDay(subMonths(now, 1)).toISOString(),
        endDate: endOfDay(now).toISOString(),
      };
    case "thisMonth":
      return {
        startDate: startOfMonth(now).toISOString(),
        endDate: endOfDay(endOfMonth(now)).toISOString(),
      };
    default:
      return {};
  }
}

export function getDateRangeFromPreset(preset: DateFilterPreset): DateRange | undefined {
  const now = new Date();

  switch (preset) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "yesterday": {
      const day = subDays(now, 1);
      return { from: startOfDay(day), to: endOfDay(day) };
    }
    case "lastWeek":
      return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
    case "lastMonth":
      return { from: startOfDay(subMonths(now, 1)), to: endOfDay(now) };
    case "thisMonth":
      return { from: startOfMonth(now), to: endOfDay(endOfMonth(now)) };
    case "custom":
      return undefined;
    default:
      return undefined;
  }
}

/** Confirmation users linked to a salesman via linkedSalesUser or owner salesmanId */
export function confirmationUserMatchesSalesman(
  confirmationUser: ConfirmationUserRecord,
  salesUserId: number
): boolean {
  const linkedId =
    confirmationUser.linkedSalesUserId ?? confirmationUser.linkedSalesUser?.id ?? null;
  const ownerId = confirmationUser.salesmanId ?? confirmationUser.salesman?.id ?? null;

  return linkedId === salesUserId || ownerId === salesUserId;
}

export function filterConfirmationUsersBySalesman(
  confirmationUsers: ConfirmationUserRecord[],
  salesUserId: number | null
): ConfirmationUserRecord[] {
  const filtered = salesUserId === null
    ? confirmationUsers
    : confirmationUsers.filter((cu) => confirmationUserMatchesSalesman(cu, salesUserId));

  return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
}

type OrderWithConfirmationUser = {
  confirmationUser?: {
    id: number;
    name: string;
    phone?: string;
    email?: string;
  } | null;
};

/** Merge DB-linked confirmation users with those seen on the salesman's orders */
export function buildConfirmationUserOptions(
  confirmationUsers: ConfirmationUserRecord[],
  salesUserId: number | null,
  ordersForSalesman: OrderWithConfirmationUser[] = []
): ConfirmationUserRecord[] {
  const byId = new Map<number, ConfirmationUserRecord>();

  if (salesUserId === null) {
    for (const cu of confirmationUsers) {
      byId.set(cu.id, cu);
    }
  } else {
    for (const cu of filterConfirmationUsersBySalesman(confirmationUsers, salesUserId)) {
      byId.set(cu.id, cu);
    }

    for (const order of ordersForSalesman) {
      const cu = order.confirmationUser;
      if (cu?.id && !byId.has(cu.id)) {
        byId.set(cu.id, {
          id: cu.id,
          name: cu.name,
          phone: cu.phone,
          email: cu.email,
        });
      }
    }
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export interface OverviewFilterState {
  searchTerm: string;
  statusFilter: string;
  confirmationUserFilter: string;
  productFilter: string;
  salerUserFilter: string;
  dateFilter: DateFilterPreset;
  dateRange: DateRange | undefined;
}

export function createDefaultOverviewFilters(): OverviewFilterState {
  return {
    searchTerm: "",
    statusFilter: OVERVIEW_ALL,
    confirmationUserFilter: OVERVIEW_ALL,
    productFilter: OVERVIEW_ALL,
    salerUserFilter: OVERVIEW_ALL,
    dateFilter: "thisMonth",
    dateRange: getDateRangeFromPreset("thisMonth"),
  };
}

/** Build query params sent to GET /orders (explicit submit flow). */
export function buildApiOrderFilters(state: OverviewFilterState) {
  const dateParams = buildDateRangeParams(state.dateFilter, state.dateRange);

  return {
    ...(state.searchTerm.trim() ? { search: state.searchTerm.trim() } : {}),
    ...(state.statusFilter !== OVERVIEW_ALL ? { status: state.statusFilter } : {}),
    ...(state.salerUserFilter !== OVERVIEW_ALL
      ? { salesmanId: state.salerUserFilter }
      : {}),
    ...(state.confirmationUserFilter !== OVERVIEW_ALL
      ? { confirmationUserId: Number(state.confirmationUserFilter) }
      : {}),
    ...(state.productFilter !== OVERVIEW_ALL
      ? { productId: state.productFilter }
      : {}),
    ...dateParams,
  };
}

type OverviewOrder = {
  id?: number;
  status?: string;
  userId?: number;
  confirmationUserId?: number | null;
  confirmationUser?: { id: number; name?: string } | null;
  user?: { id: number; name?: string } | null;
  salesman?: { id: number; name?: string } | null;
  customerName?: string;
  phone?: string;
  items?: { product?: { id?: number }; variant?: { productId?: number } }[];
  orderItems?: { variant?: { productId?: number; product?: { id?: number } } }[];
};

/** Client-side safety net when the deployed API ignores a filter param. */
export function applyClientSideOrderFilters<T extends OverviewOrder>(
  orders: T[],
  state: OverviewFilterState
): T[] {
  let result = orders;

  if (state.confirmationUserFilter !== OVERVIEW_ALL) {
    const cuId = Number(state.confirmationUserFilter);
    if (Number.isFinite(cuId)) {
      result = result.filter(
        (o) =>
          o.confirmationUser?.id === cuId || o.confirmationUserId === cuId
      );
    }
  }

  if (state.salerUserFilter !== OVERVIEW_ALL) {
    const salerId = Number(state.salerUserFilter);
    if (Number.isFinite(salerId)) {
      result = result.filter(
        (o) =>
          o.user?.id === salerId ||
          o.userId === salerId ||
          o.salesman?.id === salerId
      );
    }
  }

  if (state.statusFilter !== OVERVIEW_ALL) {
    const status = state.statusFilter.toUpperCase();
    result = result.filter((o) => o.status?.toUpperCase() === status);
  }

  if (state.productFilter !== OVERVIEW_ALL) {
    const productId = Number(state.productFilter);
    if (Number.isFinite(productId)) {
      result = result.filter((o) => {
        const items = o.items ?? o.orderItems ?? [];
        return items.some((item) => {
          const pid =
            item.product?.id ??
            item.variant?.productId ??
            item.variant?.product?.id;
          return pid === productId;
        });
      });
    }
  }

  if (state.searchTerm.trim()) {
    const q = state.searchTerm.trim().toLowerCase();
    result = result.filter((o) => {
      const haystack = [
        String(o.id ?? ""),
        o.customerName,
        o.phone,
        o.confirmationUser?.name,
        o.user?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }

  return result;
}

export function overviewFiltersPending(
  draft: OverviewFilterState,
  applied: OverviewFilterState
): boolean {
  return (
    draft.searchTerm !== applied.searchTerm ||
    draft.statusFilter !== applied.statusFilter ||
    draft.confirmationUserFilter !== applied.confirmationUserFilter ||
    draft.productFilter !== applied.productFilter ||
    draft.salerUserFilter !== applied.salerUserFilter ||
    draft.dateFilter !== applied.dateFilter ||
    draft.dateRange?.from?.getTime() !== applied.dateRange?.from?.getTime() ||
    draft.dateRange?.to?.getTime() !== applied.dateRange?.to?.getTime()
  );
}
