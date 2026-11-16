import { describe, expect, it } from "vitest";
import {
  AMANA_PARCEL_BADGE_CLASS,
  AMANA_PARCEL_DOT_CLASS,
  AMANA_PARCEL_FALLBACK_LABELS,
  amanaParcelBadgeClass,
  amanaParcelDotClass,
  amanaParcelStatusLabel,
  isAmanaParcelStatusCode,
} from "@/utils/amanaParcelStatus";

describe("amanaParcelStatus utils", () => {
  it("exposes exactly 10 approved badge mappings", () => {
    expect(Object.keys(AMANA_PARCEL_BADGE_CLASS)).toHaveLength(10);
    expect(Object.keys(AMANA_PARCEL_FALLBACK_LABELS)).toHaveLength(10);
  });

  it("maps badge colors for key statuses", () => {
    expect(amanaParcelBadgeClass("SORTI_A_DESTINATION")).toContain("blue");
    expect(amanaParcelBadgeClass("ENVOI_ARRIVE")).toContain("purple");
    expect(amanaParcelBadgeClass("A_RECUPERER")).toContain("orange");
    expect(amanaParcelBadgeClass("ENVOI_EN_RETARD")).toContain("red");
    expect(amanaParcelBadgeClass("LIVREE")).toContain("green");
    expect(amanaParcelBadgeClass("IN_TRANSIT")).toContain("gray");
  });

  it("maps indicator dots to the same palette as badges", () => {
    expect(Object.keys(AMANA_PARCEL_DOT_CLASS)).toHaveLength(10);
    for (const code of Object.keys(AMANA_PARCEL_BADGE_CLASS)) {
      const hue = AMANA_PARCEL_DOT_CLASS[code as keyof typeof AMANA_PARCEL_DOT_CLASS]
        .replace("bg-", "")
        .split("-")[0];
      expect(amanaParcelBadgeClass(code)).toContain(hue);
    }
    expect(amanaParcelDotClass("IN_TRANSIT")).toContain("gray");
  });

  it("rejects BAM scrape codes as parcel status codes", () => {
    expect(isAmanaParcelStatusCode("IN_TRANSIT")).toBe(false);
    expect(isAmanaParcelStatusCode("SORTI_A_DESTINATION")).toBe(true);
  });

  it("prefers catalog labels when provided", () => {
    expect(
      amanaParcelStatusLabel("LIVREE", [{ code: "LIVREE", label: "Livrée" }])
    ).toBe("Livrée");
    expect(amanaParcelStatusLabel({ code: "ENVOI_EN_RETARD", label: "Envoi en retard" })).toBe(
      "Envoi en retard"
    );
  });
});
