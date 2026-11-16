import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { format } from "date-fns";
import type { AmanaManagementExportRow } from "@/hooks/useApi";
import { amanaParcelStatusLabel } from "@/utils/amanaParcelStatus";

export const AMANA_EXPORT_HEADERS = [
  "Nom client",
  "Ville",
  "Tracking code",
  "Statut Amana",
] as const;

export const AMANA_EXPORT_UNINITIALIZED_LABEL = "Non initialisé";

export type AmanaExportSheetRow = [string, string, string, string];

/** One row per order id (first occurrence wins), in the given order. */
export function buildAmanaExportRows(rows: AmanaManagementExportRow[]): AmanaExportSheetRow[] {
  const seen = new Set<number>();
  const out: AmanaExportSheetRow[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push([
      row.customerName ?? "",
      row.city?.trim() ?? "",
      row.trackingCode?.trim() ?? "",
      row.amanaStatus
        ? amanaParcelStatusLabel(row.amanaStatus)
        : AMANA_EXPORT_UNINITIALIZED_LABEL,
    ]);
  }
  return out;
}

export function buildAmanaExportFilename(date: Date = new Date()): string {
  return `Amana_Management_${format(date, "yyyy-MM-dd")}.xlsx`;
}

export function buildAmanaManagementWorkbook(rows: AmanaManagementExportRow[]): ExcelJS.Workbook {
  const sheetRows = buildAmanaExportRows(rows);
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet("Amana Management", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  worksheet.columns = [
    { header: AMANA_EXPORT_HEADERS[0], key: "customerName", width: 30 },
    { header: AMANA_EXPORT_HEADERS[1], key: "city", width: 20 },
    // "@" keeps tracking codes as text (no numeric / scientific conversion in Excel)
    { header: AMANA_EXPORT_HEADERS[2], key: "trackingCode", width: 26, style: { numFmt: "@" } },
    { header: AMANA_EXPORT_HEADERS[3], key: "status", width: 38 },
  ];

  const header = worksheet.getRow(1);
  header.font = { bold: true, color: { argb: "FF0F172A" } };
  header.alignment = { vertical: "middle" };
  header.height = 20;
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8E8EC" } };
    cell.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } } };
  });

  for (const r of sheetRows) {
    worksheet.addRow(r);
  }

  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: AMANA_EXPORT_HEADERS.length },
  };

  return workbook;
}

export async function exportAmanaManagementToExcel(
  rows: AmanaManagementExportRow[],
  filename = buildAmanaExportFilename()
): Promise<number> {
  const workbook = buildAmanaManagementWorkbook(rows);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  saveAs(blob, filename);
  return workbook.getWorksheet(1)!.rowCount - 1;
}
