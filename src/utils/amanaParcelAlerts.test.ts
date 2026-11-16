import { describe, expect, it } from "vitest";
import type { AmanaParcelAlert } from "@/hooks/useApi";
import { filterAlertsBySeverity, formatAlertElapsed } from "@/utils/amanaParcelAlerts";

const HOUR = 60 * 60 * 1000;

describe("amanaParcelAlerts utils", () => {
  it("formats elapsed time in floored days and hours", () => {
    expect(formatAlertElapsed(30 * HOUR)).toBe("1 j 6 h");
    expect(formatAlertElapsed(48 * HOUR)).toBe("2 j");
    expect(formatAlertElapsed(80 * HOUR + 59 * 60 * 1000)).toBe("3 j 8 h");
    expect(formatAlertElapsed(5 * HOUR)).toBe("5 h");
    expect(formatAlertElapsed(-HOUR)).toBe("0 h");
  });

  it("filters by severity and returns everything when no severity is selected", () => {
    const alerts = [
      { orderId: 1, severity: "CRITICAL" },
      { orderId: 2, severity: "INFO" },
      { orderId: 3, severity: "CRITICAL" },
    ] as AmanaParcelAlert[];
    expect(filterAlertsBySeverity(alerts, "CRITICAL").map((a) => a.orderId)).toEqual([1, 3]);
    expect(filterAlertsBySeverity(alerts, "WARNING")).toEqual([]);
    expect(filterAlertsBySeverity(alerts, null)).toBe(alerts);
  });
});
