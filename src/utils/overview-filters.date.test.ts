import { describe, expect, it } from "vitest";
import { endOfMonth, startOfMonth, subMonths } from "date-fns";
import { buildDateRangeParams } from "./overview-filters";

describe("buildDateRangeParams previousMonth", () => {
  it("covers the full previous calendar month", () => {
    const previous = subMonths(new Date(), 1);
    const range = buildDateRangeParams("previousMonth");

    expect(range).toMatchObject({
      startDate: startOfMonth(previous).toISOString(),
      endDate: expect.any(String),
    });
    if (!("endDate" in range)) throw new Error("expected a bounded range");
    expect(new Date(range.endDate).getTime()).toBeGreaterThanOrEqual(endOfMonth(previous).getTime() - 1000);
    expect(new Date(range.startDate).getMonth()).toBe(previous.getMonth());
    expect(new Date(range.endDate).getMonth()).toBe(previous.getMonth());
  });
});
