import {
  endOfDay,
  endOfMonth,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";
import { DateRange } from "react-day-picker";

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
