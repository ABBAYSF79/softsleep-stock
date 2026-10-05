import { describe, expect, it } from "vitest";
import {
  buildClientExportRows,
  normalizePhone,
  type ExportSourceOrder,
} from "./clientExport";

const orders: ExportSourceOrder[] = [
  {
    id: 2,
    createdAt: "2026-02-01T10:00:00.000Z",
    status: "DELIVERED",
    totalAmount: "1500.00",
    isPaid: true,
    customerName: "Sara",
    phone: "0612345678",
    city: "Casablanca",
    items: [
      {
        quantity: 1,
        productId: 1,
        product: { id: 1, name: "Ortho" },
        variant: { name: "160", product: { id: 1, name: "Ortho" } },
      },
      {
        quantity: 2,
        productId: 2,
        product: { id: 2, name: "Soft" },
        variant: { name: "140", product: { id: 2, name: "Soft" } },
      },
    ],
  },
  {
    id: 1,
    createdAt: "2026-01-01T10:00:00.000Z",
    status: "PENDING",
    totalAmount: 900,
    customerName: "Sara ancienne",
    phone: "+212612345678",
    city: "Rabat",
    items: [
      {
        quantity: 1,
        productId: 1,
        product: { id: 1, name: "Ortho" },
        variant: { name: "160" },
      },
    ],
  },
];

describe("normalizePhone", () => {
  it("treats local and international Moroccan numbers as the same", () => {
    expect(normalizePhone("0612345678")).toBe(normalizePhone("+212612345678"));
  });
});

describe("buildClientExportRows", () => {
  it("keeps the latest order per phone and only the selected columns", () => {
    const table = buildClientExportRows(orders, {
      mode: "order",
      columns: ["customerName", "phone", "products"],
      productIds: [],
      uniquePhone: true,
    });

    expect(table.headers).toEqual(["Client", "Téléphone", "Produits"]);
    expect(table.orderCount).toBe(1);
    expect(table.rows).toEqual([
      ["Sara", "0612345678", "Ortho 160 x1; Soft 140 x2"],
    ]);
  });

  it("exports one row per matching product line", () => {
    const table = buildClientExportRows(orders, {
      mode: "line",
      columns: ["customerName", "products", "quantity"],
      productIds: [2],
      uniquePhone: false,
    });

    expect(table.rows).toEqual([["Sara", "Soft", 2]]);
    expect(table.orderCount).toBe(1);
  });
});
