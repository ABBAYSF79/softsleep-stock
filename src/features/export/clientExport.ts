import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { format } from "date-fns";
import api from "@/lib/api";

export const MATTRESS_ORDER_STATUSES = [
  { value: "PENDING", label: "En attente" },
  { value: "IN_PROCESS", label: "En cours" },
  { value: "DELIVERED", label: "Livré" },
  { value: "RETURNED", label: "Retourné" },
] as const;

export type MattressOrderStatus = (typeof MATTRESS_ORDER_STATUSES)[number]["value"];

export type ExportColumnId =
  | "orderId"
  | "date"
  | "customerName"
  | "phone"
  | "city"
  | "address"
  | "status"
  | "isPaid"
  | "totalAmount"
  | "products"
  | "variant"
  | "quantity"
  | "deliveryService"
  | "trackingCode"
  | "salesman"
  | "confirmation"
  | "note";

export type ExportMode = "order" | "line";

type ColumnDef = {
  id: ExportColumnId;
  label: string;
  width: number;
  text?: boolean;
};

export const EXPORT_COLUMNS: ColumnDef[] = [
  { id: "orderId", label: "N° commande", width: 14 },
  { id: "date", label: "Date", width: 18 },
  { id: "customerName", label: "Client", width: 24 },
  { id: "phone", label: "Téléphone", width: 16, text: true },
  { id: "city", label: "Ville", width: 16 },
  { id: "address", label: "Adresse", width: 32 },
  { id: "status", label: "Statut", width: 14 },
  { id: "isPaid", label: "Payé", width: 10 },
  { id: "totalAmount", label: "Total", width: 12 },
  { id: "products", label: "Produits", width: 42 },
  { id: "variant", label: "Variante", width: 22 },
  { id: "quantity", label: "Quantité", width: 12 },
  { id: "deliveryService", label: "Livraison", width: 18 },
  { id: "trackingCode", label: "Tracking", width: 18, text: true },
  { id: "salesman", label: "Commercial", width: 18 },
  { id: "confirmation", label: "Confirmation", width: 18 },
  { id: "note", label: "Note", width: 28 },
];

export const RETARGETING_COLUMNS: ExportColumnId[] = [
  "date",
  "customerName",
  "phone",
  "city",
  "status",
  "products",
];

export const CONTACT_COLUMNS: ExportColumnId[] = [
  "customerName",
  "phone",
  "city",
  "address",
];

export type ExportSourceItem = {
  quantity: number;
  price?: number | string;
  productId?: number;
  product?: { id?: number; name?: string };
  variant?: {
    name?: string;
    productId?: number;
    product?: { id?: number; name?: string };
    size?: { name?: string } | null;
  };
};

export type ExportSourceOrder = {
  id: number;
  createdAt: string;
  status: string;
  totalAmount: number | string;
  isPaid?: boolean;
  customerName: string;
  phone?: string | null;
  city?: string | null;
  address?: string | null;
  trackingCode?: string | null;
  note?: string | null;
  salesman?: { name?: string | null } | null;
  user?: { name?: string | null } | null;
  deliveryService?: { name?: string | null } | null;
  confirmationUser?: { name?: string | null } | null;
  items?: ExportSourceItem[];
  orderItems?: ExportSourceItem[];
};

export type ClientExportOptions = {
  mode: ExportMode;
  columns: ExportColumnId[];
  productIds: number[];
  uniquePhone: boolean;
};

export type ClientExportTable = {
  headers: string[];
  columnIds: ExportColumnId[];
  rows: (string | number)[][];
  orderCount: number;
};

const COLUMN_BY_ID = new Map(EXPORT_COLUMNS.map((column) => [column.id, column]));

export function statusLabel(status: string): string {
  return MATTRESS_ORDER_STATUSES.find((item) => item.value === status)?.label ?? status;
}

export function normalizePhone(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return "";
  let national = digits;
  if (national.startsWith("00212")) national = national.slice(5);
  else if (national.startsWith("212") && national.length >= 12) national = national.slice(3);
  if (national.startsWith("0")) national = national.slice(1);
  return national;
}

function lineItems(order: ExportSourceOrder): ExportSourceItem[] {
  if (order.items?.length) return order.items;
  return order.orderItems ?? [];
}

function itemProductId(item: ExportSourceItem): number | null {
  return item.product?.id ?? item.productId ?? item.variant?.product?.id ?? item.variant?.productId ?? null;
}

function productName(item: ExportSourceItem): string {
  return item.product?.name || item.variant?.product?.name || "Produit";
}

function variantLabel(item: ExportSourceItem): string {
  const size = item.variant?.size?.name;
  return [item.variant?.name, size].filter(Boolean).join(" · ");
}

function itemLabel(item: ExportSourceItem): string {
  const name = [productName(item), variantLabel(item)].filter(Boolean).join(" ");
  return `${name} x${item.quantity}`;
}

function matchingItems(order: ExportSourceOrder, productIds: number[]): ExportSourceItem[] {
  const items = lineItems(order);
  if (!productIds.length) return items;
  const selected = new Set(productIds);
  return items.filter((item) => {
    const id = itemProductId(item);
    return id != null && selected.has(id);
  });
}

function money(value: number | string | null | undefined): number {
  const amount = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function cellValue(
  column: ExportColumnId,
  order: ExportSourceOrder,
  items: ExportSourceItem[],
  mode: ExportMode
): string | number {
  const item = items[0];
  switch (column) {
    case "orderId":
      return order.id;
    case "date":
      return format(new Date(order.createdAt), "yyyy-MM-dd HH:mm");
    case "customerName":
      return order.customerName ?? "";
    case "phone":
      return order.phone ?? "";
    case "city":
      return order.city ?? "";
    case "address":
      return order.address ?? "";
    case "status":
      return statusLabel(order.status);
    case "isPaid":
      return order.isPaid ? "Oui" : "Non";
    case "totalAmount":
      return money(order.totalAmount);
    case "products":
      return mode === "line" ? (item ? productName(item) : "") : items.map(itemLabel).join("; ");
    case "variant":
      return mode === "line" ? (item ? variantLabel(item) : "") : items.map(variantLabel).filter(Boolean).join("; ");
    case "quantity":
      return items.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
    case "deliveryService":
      return order.deliveryService?.name ?? "";
    case "trackingCode":
      return order.trackingCode ?? "";
    case "salesman":
      return order.salesman?.name || order.user?.name || "";
    case "confirmation":
      return order.confirmationUser?.name ?? "";
    case "note":
      return order.note ?? "";
    default:
      return "";
  }
}

export function buildClientExportRows(
  orders: ExportSourceOrder[],
  options: ClientExportOptions
): ClientExportTable {
  const columnIds = EXPORT_COLUMNS.map((column) => column.id).filter((id) => options.columns.includes(id));
  const headers = columnIds.map((id) => COLUMN_BY_ID.get(id)?.label ?? id);

  const sorted = [...orders].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const kept: ExportSourceOrder[] = [];
  if (options.uniquePhone) {
    const seen = new Set<string>();
    for (const order of sorted) {
      const key = normalizePhone(order.phone);
      if (!key) {
        kept.push(order);
        continue;
      }
      if (seen.has(key)) continue;
      seen.add(key);
      kept.push(order);
    }
  } else {
    kept.push(...sorted);
  }

  const rows: (string | number)[][] = [];
  let orderCount = 0;

  for (const order of kept) {
    const items = matchingItems(order, options.productIds);
    if (options.productIds.length && items.length === 0) continue;
    orderCount += 1;

    if (options.mode === "line") {
      const lines = items.length ? items : [];
      for (const line of lines) {
        rows.push(columnIds.map((column) => cellValue(column, order, [line], "line")));
      }
      continue;
    }

    rows.push(columnIds.map((column) => cellValue(column, order, items, "order")));
  }

  return { headers, columnIds, rows, orderCount };
}

function safeExcelFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]+/g, "-")
    .replace(/\s+/g, "_")
    .replace(/-+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "");
}

export function buildClientExportFilename(input: {
  mode: ExportMode;
  statuses: string[];
  from?: Date;
  to?: Date;
}): string {
  const statusPart =
    input.statuses.length === 0 || input.statuses.length === MATTRESS_ORDER_STATUSES.length
      ? "tous-statuts"
      : input.statuses.join("-");
  const datePart = input.from
    ? `${format(input.from, "yyyy-MM-dd")}_${format(input.to ?? input.from, "yyyy-MM-dd")}`
    : "toute-periode";
  return safeExcelFilename(`clients-matelas_${input.mode}_${statusPart}_${datePart}.xlsx`);
}

export async function downloadClientExport(
  table: ClientExportTable,
  filename: string
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Clients");
  const header = worksheet.addRow(table.headers);
  header.font = { bold: true };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE8E8EC" },
  };

  table.columnIds.forEach((id, index) => {
    const column = COLUMN_BY_ID.get(id);
    const sheetColumn = worksheet.getColumn(index + 1);
    sheetColumn.width = column?.width ?? 16;
    if (id === "totalAmount") sheetColumn.numFmt = "#,##0.00";
  });

  table.rows.forEach((row) => {
    const added = worksheet.addRow(row);
    table.columnIds.forEach((id, index) => {
      if (COLUMN_BY_ID.get(id)?.text) {
        added.getCell(index + 1).numFmt = "@";
      }
    });
  });

  if (table.headers.length) {
    worksheet.views = [{ state: "frozen", ySplit: 1 }];
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(table.rows.length + 1, 1), column: table.headers.length },
    };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    filename
  );
}

export type FetchExportFilters = {
  statuses: MattressOrderStatus[];
  productIds: number[];
  startDate?: string;
  endDate?: string;
  city?: string;
  search?: string;
  isPaid?: "true" | "false";
};

const EXPORT_PAGE_SIZE = 200;
const EXPORT_MAX_PAGES = 100;

export async function fetchMattressOrdersForExport(
  filters: FetchExportFilters,
  onProgress?: (loaded: number, total: number) => void
): Promise<{ orders: ExportSourceOrder[]; total: number; truncated: boolean }> {
  const params: Record<string, string | number> = {
    page: 1,
    limit: EXPORT_PAGE_SIZE,
  };
  if (filters.statuses.length > 0 && filters.statuses.length < MATTRESS_ORDER_STATUSES.length) {
    params.statuses = filters.statuses.join(",");
  }
  if (filters.productIds.length) params.productIds = filters.productIds.join(",");
  if (filters.startDate) params.startDate = filters.startDate;
  if (filters.endDate) params.endDate = filters.endDate;
  if (filters.city?.trim()) params.city = filters.city.trim();
  if (filters.search?.trim()) params.search = filters.search.trim();
  if (filters.isPaid) params.isPaid = filters.isPaid;

  const orders: ExportSourceOrder[] = [];
  let total = 0;
  let page = 1;

  while (page <= EXPORT_MAX_PAGES) {
    const { data } = await api.get("/orders", { params: { ...params, page } });
    const batch: ExportSourceOrder[] = Array.isArray(data) ? data : data?.data ?? [];
    total = typeof data?.meta?.total === "number" ? data.meta.total : orders.length + batch.length;
    orders.push(...batch);
    onProgress?.(orders.length, total);
    const totalPages = data?.meta?.totalPages ?? 1;
    if (page >= totalPages || batch.length === 0) break;
    page += 1;
  }

  return { orders, total, truncated: orders.length < total };
}
