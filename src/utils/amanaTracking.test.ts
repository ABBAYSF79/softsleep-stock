import { describe, expect, it } from "vitest";
import {
  amanaStatusBadgeClass,
  amanaStatusDotClass,
  canTrackAmanaOrder,
  formatAmanaDateTime,
  isAmanaDeliveryServiceName,
  suggestedOrderStatusFromAmana,
} from "@/utils/amanaTracking";

describe("amanaTracking utils", () => {
  it("detects AMANA delivery service by name", () => {
    expect(isAmanaDeliveryServiceName("AMANA")).toBe(true);
    expect(isAmanaDeliveryServiceName("Amana Express")).toBe(true);
    expect(isAmanaDeliveryServiceName("Chrono")).toBe(false);
  });

  it("gates tracking icon on trackingCode only (no delivery service name)", () => {
    expect(
      canTrackAmanaOrder({
        trackingCode: "QD136777960MA",
      })
    ).toBe(true);
    expect(
      canTrackAmanaOrder({
        trackingCode: "",
      })
    ).toBe(false);
    expect(
      canTrackAmanaOrder({
        trackingCode: "QD136777911MA",
      })
    ).toBe(true);
  });

  it("maps status codes to existing badge color classes", () => {
    expect(amanaStatusBadgeClass("DELIVERED")).toContain("green");
    expect(amanaStatusBadgeClass("IN_TRANSIT")).toContain("blue");
    expect(amanaStatusBadgeClass("DELIVERY_ATTEMPT")).toContain("amber");
    expect(amanaStatusBadgeClass("RETURNED_TO_SENDER")).toContain("red");
  });

  it("maps status codes to timeline dot colors", () => {
    expect(amanaStatusDotClass("DELIVERED")).toContain("green");
    expect(amanaStatusDotClass("IN_TRANSIT")).toContain("blue");
    expect(amanaStatusDotClass("UNKNOWN")).toContain("gray");
  });

  it("formats last update display", () => {
    expect(formatAmanaDateTime("2026-09-08", "18:34")).toMatch(/Sep/);
    expect(formatAmanaDateTime("2026-09-08", "18:34")).toContain("18:34");
  });

  it("suggests order status patch from AMANA codes", () => {
    expect(suggestedOrderStatusFromAmana("DELIVERED")).toBe("DELIVERED");
    expect(suggestedOrderStatusFromAmana("RETURNED_TO_SENDER")).toBe("RETURNED");
    expect(suggestedOrderStatusFromAmana("IN_TRANSIT")).toBeNull();
  });
});
