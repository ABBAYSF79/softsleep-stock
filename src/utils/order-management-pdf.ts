// @ts-ignore
import html2pdf from "html2pdf.js";
import { formatPrice, formatVariantDetails, getProductName } from "./order-utils";

export type OrdersPdfExportOptions = {
  title?: string;
  filterLines?: string[];
  /** When true, adds a Statut column (order.status). */
  showStatus?: boolean;
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  IN_PROCESS: "In Process",
  DELIVERED: "Delivered",
  RETURNED: "Returned",
};

function buildOrdersExportElement(orders: any[], options?: OrdersPdfExportOptions) {
  const showStatus = Boolean(options?.showStatus);
  const root = document.createElement("div");
  root.style.fontFamily = "Arial, 'Segoe UI', Tahoma, sans-serif";
  root.style.color = "#0f172a";
  root.style.background = "#ffffff";
  root.style.padding = "16px";
  root.style.textAlign = "left";
  root.style.lineHeight = "1.35";
  root.dir = "ltr";
  root.lang = "fr";

  const title = document.createElement("div");
  title.style.fontSize = "18px";
  title.style.fontWeight = "700";
  title.style.marginBottom = "8px";
  title.textContent = options?.title || "Export des commandes";
  root.appendChild(title);

  const subtitle = document.createElement("div");
  subtitle.style.fontSize = "11px";
  subtitle.style.color = "#64748b";
  subtitle.style.marginBottom = options?.filterLines?.length ? "8px" : "14px";
  subtitle.textContent = new Date().toLocaleString("fr-FR");
  root.appendChild(subtitle);

  if (options?.filterLines?.length) {
    const filtersBox = document.createElement("div");
    filtersBox.style.fontSize = "11px";
    filtersBox.style.color = "#334155";
    filtersBox.style.background = "#f8fafc";
    filtersBox.style.border = "1px solid #e2e8f0";
    filtersBox.style.borderRadius = "6px";
    filtersBox.style.padding = "8px 10px";
    filtersBox.style.marginBottom = "14px";

    const filtersTitle = document.createElement("div");
    filtersTitle.style.fontWeight = "700";
    filtersTitle.style.marginBottom = "4px";
    filtersTitle.textContent = "Filtres appliqués";
    filtersBox.appendChild(filtersTitle);

    options.filterLines.forEach((line) => {
      const row = document.createElement("div");
      row.textContent = line;
      filtersBox.appendChild(row);
    });

    root.appendChild(filtersBox);
  }

  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";
  table.style.fontSize = "10.5px";
  table.style.tableLayout = "fixed";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  const headers: Array<{ label: string; width?: string }> = [
    { label: "N°", width: showStatus ? "5%" : "6%" },
    { label: "Client", width: showStatus ? "12%" : "14%" },
    { label: "Téléphone", width: "10%" },
    { label: "Ville", width: "9%" },
    { label: "Adresse", width: showStatus ? "14%" : "16%" },
    { label: "Produit et dimension", width: showStatus ? "24%" : "28%" },
    { label: "Qté", width: "5%" },
    ...(showStatus ? [{ label: "Statut", width: "10%" }] : []),
    { label: "Prix", width: "8%" },
  ];

  headers.forEach((h) => {
    const th = document.createElement("th");
    th.textContent = h.label;
    th.style.textAlign = "left";
    th.style.padding = "8px 6px";
    th.style.border = "1px solid #e2e8f0";
    th.style.background = "#f8fafc";
    th.style.color = "#0f172a";
    th.style.fontWeight = "700";
    th.style.verticalAlign = "top";
    if (h.width) th.style.width = h.width;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  const cell = (value: string) => {
    const td = document.createElement("td");
    td.textContent = value || "-";
    td.style.padding = "7px 6px";
    td.style.border = "1px solid #e2e8f0";
    td.style.verticalAlign = "top";
    td.style.wordBreak = "break-word";
    return td;
  };

  orders.forEach((order, orderIndex) => {
    const items = Array.isArray(order?.items) ? order.items : [];
    const rowsCount = Math.max(items.length, 1);
    const statusRaw = String(order?.status ?? "");
    const statusLabel = STATUS_LABELS[statusRaw] || statusRaw || "-";

    for (let i = 0; i < rowsCount; i += 1) {
      const tr = document.createElement("tr");
      tr.style.pageBreakInside = "avoid";

      if (i === 0) {
        const idCell = cell(String(order?.id ?? ""));
        idCell.rowSpan = rowsCount;
        idCell.style.fontWeight = "700";
        tr.appendChild(idCell);

        const customerCell = cell(String(order?.customerName ?? ""));
        customerCell.rowSpan = rowsCount;
        tr.appendChild(customerCell);

        const phoneCell = cell(String(order?.phone ?? ""));
        phoneCell.rowSpan = rowsCount;
        tr.appendChild(phoneCell);

        const cityCell = cell(String(order?.city ?? ""));
        cityCell.rowSpan = rowsCount;
        tr.appendChild(cityCell);

        const addressCell = cell(String(order?.address ?? ""));
        addressCell.rowSpan = rowsCount;
        tr.appendChild(addressCell);
      }

      const it = items[i];
      const name = it ? getProductName(it) : "";
      const variant = it ? formatVariantDetails(it) : "";
      const productAndDimension = [name, variant].filter(Boolean).join(" — ");
      const qty = it ? String(it?.quantity ?? 0) : "";

      tr.appendChild(cell(productAndDimension));
      tr.appendChild(cell(String(qty)));

      if (i === 0) {
        if (showStatus) {
          const statusCell = cell(statusLabel);
          statusCell.rowSpan = rowsCount;
          tr.appendChild(statusCell);
        }

        const totalCell = cell(`MAD ${formatPrice(order?.totalAmount)}`);
        totalCell.rowSpan = rowsCount;
        totalCell.style.fontWeight = "700";
        tr.appendChild(totalCell);
      }

      if (orderIndex % 2 === 1) {
        tr.style.background = "#fcfcfd";
      }

      tbody.appendChild(tr);
    }
  });

  table.appendChild(tbody);
  root.appendChild(table);

  return root;
}

/** @deprecated alias — French export is the default */
export async function exportSelectedOrdersToPdfArabic(
  orders: any[],
  filename = "orders-selected.pdf",
  options?: OrdersPdfExportOptions
) {
  return exportSelectedOrdersToPdf(orders, filename, options);
}

export async function exportSelectedOrdersToPdf(
  orders: any[],
  filename = "orders-selected.pdf",
  options?: OrdersPdfExportOptions
) {
  const element = buildOrdersExportElement(orders, options);
  document.body.appendChild(element);

  const opt = {
    margin: 6,
    filename,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false, scrollY: 0, windowHeight: 1200 },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    pagebreak: { mode: ["avoid-all", "css", "legacy"] },
  };

  try {
    await html2pdf().set(opt).from(element).save();
  } finally {
    element.remove();
  }
}
