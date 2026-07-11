import { OrderItem, ProductVariant } from "@/types";

export const ORDER_STATUSES = {
  PENDING: { label: "Pending", value: "PENDING", color: "bg-yellow-100 text-yellow-800 hover:bg-yellow-100" },
  IN_PROCESS: { label: "In Process", value: "IN_PROCESS", color: "bg-blue-100 text-blue-800 hover:bg-blue-100" },
  DELIVERED: { label: "Delivered", value: "DELIVERED", color: "bg-green-100 text-green-800 hover:bg-green-100" },
  RETURNED: { label: "Returned", value: "RETURNED", color: "bg-red-100 text-red-800 hover:bg-red-100" },
} as const;

/** Amana tracking: SS + year + order reference + MA (no separators) */
export const generateAmanaTrackingCode = (orderId: number, date: Date = new Date()): string =>
  `SS${date.getFullYear()}${orderId}MA`;

export const formatPrice = (price: number | string | undefined | null | any): string => {
  if (price === null || price === undefined) return '0.00';
  
  if (typeof price === 'object' && price !== null) {
    if ('toString' in price) {
      const strVal = price.toString();
      const num = parseFloat(strVal);
      return isNaN(num) ? '0.00' : num.toFixed(2);
    }
    return '0.00';
  }

  const numPrice = typeof price === 'string' ? parseFloat(price) : price;
  if (isNaN(numPrice)) return '0.00';
  return numPrice.toFixed(2);
};

export const calculateOrderTotal = (items: OrderItem[] | undefined, orderTotal?: number): number => {
  if (orderTotal !== undefined && orderTotal !== null) {
    if (typeof orderTotal === 'object' && orderTotal !== null) {
      if ('toString' in orderTotal) {
        const n = parseFloat(String((orderTotal as any).toString()));
        return Number.isFinite(n) ? n : 0;
      }
      return 0;
    }
    const n = typeof orderTotal === 'string' ? parseFloat(orderTotal) : orderTotal;
    return Number.isFinite(n) ? n : 0;
  }
  if (!items || items.length === 0) return 0;
  
  return items.reduce((sum, item) => {
    const price = typeof item.price === 'string' ? parseFloat(item.price) : item.price;
    return sum + (price * item.quantity);
  }, 0);
};

export const formatVariantDetails = (item: OrderItem): string => {
  const v = item.variant;
  const s = v?.size;
  
  let sizeStr = '';
  if (s && typeof s === 'object' && 'value' in s) {
    sizeStr = s.value;
  } else {
    sizeStr = (typeof s === 'string' ? s : null) || v?.name || item.size || '-';
  }

  const colorStr = v?.color ? ` • ${v.color}` : '';
  return `${sizeStr}${colorStr}`;
};

export const getProductName = (item: OrderItem): string => {
  return item.variant?.product?.name || item.productName || 'Produit Inconnu';
};

/** Plain-text order summary for clipboard (uses order.totalAmount, not item list prices) */
export const buildOrderCopyText = (order: any): string => {
  const lines: string[] = [];
  const items = Array.isArray(order?.items) ? order.items : [];
  const pillowItems = Array.isArray(order?.pillowItems) ? order.pillowItems : [];
  const salesNote = typeof order?.note === "string" ? order.note.trim() : "";
  const livreurNote = typeof order?.livreurNote === "string" ? order.livreurNote.trim() : "";
  const note = livreurNote || salesNote || "—";

  lines.push(`Commande #${order?.id ?? "-"}`);
  lines.push(`Client: ${order?.customerName || "-"}`);
  lines.push(`Tél: ${order?.phone || "-"}`);
  lines.push(`Ville: ${order?.city || "-"}`);
  lines.push(`Adresse: ${order?.address || "-"}`);
  lines.push(`Prix: ${formatPrice(order?.totalAmount)} MAD`);
  lines.push("Produits:");

  for (const it of items) {
    const name = getProductName(it);
    const variant = formatVariantDetails(it);
    const qty = it.quantity ?? 0;
    lines.push(`- ${qty}x ${name} (${variant})`);
  }

  for (const it of pillowItems) {
    const name = it.pillowName || "Produit supplémentaire";
    const qty = it.quantity ?? 0;
    lines.push(`- ${qty}x ${name}`);
  }

  if (items.length === 0 && pillowItems.length === 0) {
    lines.push("-");
  }

  lines.push(`Note: ${note}`);

  return lines.join("\n");
};

const PHONE_ALLOWED_PATTERN = /^[0-9+\s]*$/;

/** Keeps only digits, spaces, and + while typing */
export const sanitizePhoneInput = (value: string): string =>
  value.replace(/[^0-9+\s]/g, "");

/** Required phone: non-empty, allowed chars only, at least one digit */
export const validatePhone = (phone: string): { valid: boolean; message?: string } => {
  const trimmed = phone.trim();
  if (!trimmed) {
    return { valid: false, message: "Phone number is required" };
  }
  if (!PHONE_ALLOWED_PATTERN.test(trimmed)) {
    return { valid: false, message: "Phone can only contain numbers, spaces, and +" };
  }
  if (!/\d/.test(trimmed)) {
    return { valid: false, message: "Phone must contain at least one number" };
  }
  return { valid: true };
};

/** Digits only for WhatsApp (Morocco: 0XXXXXXXXX → 212XXXXXXXXX) */
export const toWhatsAppPhone = (phone: string | null | undefined): string | null => {
  if (!phone?.trim()) return null;
  let digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `212${digits.slice(1)}`;
  return digits || null;
};

/** Arabic message asking the client to share their GPS location */
export const WHATSAPP_LOCATION_REQUEST_MESSAGE =
  "السلام عليكم، أنا الموزع. عافاك صيفط ليا الـ localisation ديالك فالخريطة باش نقدر نجي عندك. شكرا";

export const openWhatsAppLocationRequest = (phone: string): boolean => {
  const whatsappPhone = toWhatsAppPhone(phone);
  if (!whatsappPhone) return false;
  const waUrl = `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(WHATSAPP_LOCATION_REQUEST_MESSAGE)}`;
  window.open(waUrl, "_blank");
  return true;
};
