// @ts-ignore
import html2pdf from "html2pdf.js";
import { formatPrice, formatVariantDetails, getProductName } from "./order-utils";

function buildOrdersExportElement(orders: any[]) {
  const root = document.createElement("div");
  root.style.fontFamily =
    "Arial, 'Segoe UI', 'Tahoma', 'Noto Naskh Arabic', 'Noto Sans Arabic', sans-serif";
  root.style.color = "#0f172a";
  root.style.background = "#ffffff";
  root.style.padding = "16px";
  root.style.textAlign = "right";
  root.style.lineHeight = "1.35";
  root.dir = "rtl";
  root.lang = "ar";

  const title = document.createElement("div");
  title.style.fontSize = "18px";
  title.style.fontWeight = "700";
  title.style.marginBottom = "8px";
  title.textContent = "تصدير الطلبات";
  root.appendChild(title);

  const subtitle = document.createElement("div");
  subtitle.style.fontSize = "11px";
  subtitle.style.color = "#64748b";
  subtitle.style.marginBottom = "14px";
  subtitle.textContent = new Date().toLocaleString();
  root.appendChild(subtitle);

  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";
  table.style.fontSize = "10.5px";
  table.style.tableLayout = "fixed";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  const headers: Array<{ label: string; width?: string }> = [
    { label: "رقم", width: "5%" },
    { label: "الزبون", width: "12%" },
    { label: "الهاتف", width: "10%" },
    { label: "المدينة", width: "8%" },
    { label: "العنوان", width: "14%" },
    { label: "المنتج", width: "18%" },
    { label: "المقاس/اللون", width: "12%" },
    { label: "الكمية", width: "6%" },
    { label: "السعر", width: "7%" },
    { label: "الإجمالي", width: "8%" },
  ];

  headers.forEach((h) => {
    const th = document.createElement("th");
    th.textContent = h.label;
    th.style.textAlign = "right";
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
      const qty = it ? String(it?.quantity ?? 0) : "";
      const price = it ? `MAD ${formatPrice(it?.price)}` : "";

      tr.appendChild(cell(String(name)));
      tr.appendChild(cell(String(variant)));
      tr.appendChild(cell(String(qty)));
      tr.appendChild(cell(String(price)));

      if (i === 0) {
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

export async function exportSelectedOrdersToPdfArabic(orders: any[], filename = "orders-selected.pdf") {
  const element = buildOrdersExportElement(orders);
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

