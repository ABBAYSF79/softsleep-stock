import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type { AmanaManagementExportRow } from "@/hooks/useApi";
import {
  AMANA_EXPORT_HEADERS,
  buildAmanaExportFilename,
  buildAmanaExportRows,
  buildAmanaManagementWorkbook,
} from "@/utils/amanaManagementExcel";

const rows: AmanaManagementExportRow[] = [
  {
    id: 1666,
    customerName: "Hélène Aït",
    city: "Fès",
    trackingCode: "1234567890123456789",
    amanaStatus: { code: "ENVOI_EN_RETARD", label: "Envoi en retard" },
  },
  {
    id: 1667,
    customerName: "Omar",
    city: "Casablanca",
    trackingCode: null,
    amanaStatus: null,
  },
  {
    id: 1666,
    customerName: "Hélène Aït (dup)",
    city: "Fès",
    trackingCode: "1234567890123456789",
    amanaStatus: { code: "LIVREE", label: "Livrée" },
  },
  {
    id: 1668,
    customerName: "Sara",
    city: "Rabat",
    trackingCode: "1E5",
    amanaStatus: { code: "RETARD_ARRIVE_DESTINATION", label: "Envoi en retard – Arrivé à destination" },
  },
];

describe("Amana Management Excel export", () => {
  it("maps rows to the four columns with French labels, deduplicated by id", () => {
    expect(buildAmanaExportRows(rows)).toEqual([
      ["Hélène Aït", "Fès", "1234567890123456789", "Envoi en retard"],
      ["Omar", "Casablanca", "", "Non initialisé"],
      ["Sara", "Rabat", "1E5", "Envoi en retard – Arrivé à destination"],
    ]);
  });

  it("builds a workbook with exact headers, frozen header, filters and text tracking codes", async () => {
    const wb = buildAmanaManagementWorkbook(rows);
    const ws = wb.getWorksheet("Amana Management")!;

    expect(ws.getRow(1).values).toEqual([undefined, ...AMANA_EXPORT_HEADERS]);
    expect(ws.columnCount).toBe(4);
    expect(ws.rowCount).toBe(4);
    expect(ws.getRow(1).font?.bold).toBe(true);
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(ws.autoFilter).toBeTruthy();
    expect(ws.getColumn(3).numFmt).toBe("@");

    // Round-trip through .xlsx to make sure values survive as text with accents.
    const buffer = await wb.xlsx.writeBuffer();
    const reread = new ExcelJS.Workbook();
    await reread.xlsx.load(buffer);
    const rs = reread.getWorksheet(1)!;
    expect(rs.getCell("A2").value).toBe("Hélène Aït");
    expect(rs.getCell("C2").value).toBe("1234567890123456789");
    expect(typeof rs.getCell("C4").value).toBe("string");
    expect(rs.getCell("C3").value ?? "").toBe("");
    expect(rs.getCell("D3").value).toBe("Non initialisé");
  });

  it("uses a dated descriptive filename", () => {
    expect(buildAmanaExportFilename(new Date(2026, 10, 16))).toBe(
      "Amana_Management_2026-11-16.xlsx"
    );
  });
});
