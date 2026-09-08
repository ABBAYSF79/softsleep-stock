import { describe, expect, it } from "vitest";
import { getQuickStatusTargets } from "@/components/orders/OrderQuickStatusControl";

/**
 * Lightweight frontend sanity for TASK 16 related UI isolation.
 * Full drawer interaction is covered manually / by integration.
 */
describe("Order follow-up feature isolation helpers", () => {
  it("does not offer PENDING → RETURNED in quick status", () => {
    const targets = getQuickStatusTargets("PENDING", {
      isAdmin: true,
      isSuivi: false,
      isLivreur: false,
      isSales: false,
    });
    expect(targets).not.toContain("RETURNED");
  });

  it("suivi pending targets exclude RETURNED", () => {
    const targets = getQuickStatusTargets("PENDING", {
      isAdmin: false,
      isSuivi: true,
      isLivreur: false,
    });
    expect(targets).toEqual(["IN_PROCESS", "DELIVERED"]);
  });
});
