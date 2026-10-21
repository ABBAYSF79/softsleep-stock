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

/**
 * Digits only for WhatsApp (Morocco).
 * Accepts: 06XXXXXXXX, +2126XXXXXXXX, 2126XXXXXXXX, 002126XXXXXXXX
 * Always returns: 2126XXXXXXXX (no +, no leading 0)
 */
export const toWhatsAppPhone = (phone: string | null | undefined): string | null => {
  if (!phone?.trim()) return null;
  let digits = phone.replace(/\D/g, "");
  if (!digits) return null;

  // 00212… → 212…
  while (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  // Already international Morocco
  if (digits.startsWith("212")) {
    let national = digits.slice(3);
    // +212 0XXXXXXXX → drop the extra 0 after country code
    if (national.startsWith("0")) national = national.slice(1);
    if (!national) return null;
    digits = `212${national}`;
  } else if (digits.startsWith("0")) {
    // 06XXXXXXXX → 2126XXXXXXXX
    digits = `212${digits.slice(1)}`;
  } else if (/^[67]\d{8}$/.test(digits)) {
    // 9-digit mobile without leading 0 (6XXXXXXXX / 7XXXXXXXX)
    digits = `212${digits}`;
  }

  // Moroccan mobile: 212 + 9 digits starting with 6 or 7
  if (/^212[67]\d{8}$/.test(digits)) return digits;

  // Fallback: return cleaned digits if long enough (other formats)
  return digits.length >= 10 ? digits : null;
};

/** Arabic message asking the client to share their GPS location */
export const WHATSAPP_LOCATION_REQUEST_MESSAGE =
  "السلام عليكم، أنا الموزع. عافاك صيفط ليا الـ localisation ديالك فالخريطة باش نقدر نجي عندك. شكرا";

function buildWhatsAppSendUrl(whatsappPhone: string, message: string): string {
  // Official send URL — more reliable than wa.me short links in some browsers
  return `https://api.whatsapp.com/send?phone=${whatsappPhone}&text=${encodeURIComponent(message)}`;
}

export const openWhatsAppLocationRequest = (phone: string): boolean => {
  const whatsappPhone = toWhatsAppPhone(phone);
  if (!whatsappPhone) return false;
  window.open(buildWhatsAppSendUrl(whatsappPhone, WHATSAPP_LOCATION_REQUEST_MESSAGE), "_blank");
  return true;
};

export const openWhatsAppWithMessage = (
  phone: string | null | undefined,
  message: string
): boolean => {
  const whatsappPhone = toWhatsAppPhone(phone);
  if (!whatsappPhone) return false;
  const text = message.trim();
  if (!text) return false;
  window.open(buildWhatsAppSendUrl(whatsappPhone, text), "_blank");
  return true;
};

/**
 * First Strong Isolate + Pop Directional Isolate — keeps Latin names,
 * prices and tracking codes LTR inside Arabic RTL paragraphs.
 */
function bidiIsolate(value: string): string {
  return `\u2068${value}\u2069`;
}

type SuiviWhatsAppOrderFields = {
  customerName?: string | null;
  trackingCode?: string | null;
  totalAmount?: string | number | null;
  items?: any[];
  pillowItems?: any[];
};

function suiviWhatsAppPrice(order: SuiviWhatsAppOrderFields): string {
  if (
    order.totalAmount === undefined ||
    order.totalAmount === null ||
    String(order.totalAmount).trim() === ""
  ) {
    return "—";
  }
  return formatPrice(order.totalAmount);
}

function suiviWhatsAppProductLabel(order: SuiviWhatsAppOrderFields): string {
  const items = Array.isArray(order.items) ? order.items : [];
  const pillows = Array.isArray(order.pillowItems) ? order.pillowItems : [];
  const parts: string[] = [];

  for (const it of items) {
    const name = getProductName(it as OrderItem);
    const variant = formatVariantDetails(it as OrderItem);
    const qty = Number(it?.quantity) || 1;
    const label = variant ? `${name} (${variant})` : name;
    parts.push(qty > 1 ? `${qty}x ${label}` : label);
  }
  for (const it of pillows) {
    const name = it?.pillowName || "Accessoire";
    const qty = Number(it?.quantity) || 1;
    parts.push(qty > 1 ? `${qty}x ${name}` : name);
  }

  return parts.length ? parts.join(" · ") : "—";
}

function suiviWhatsAppFields(order: SuiviWhatsAppOrderFields) {
  return {
    name: bidiIsolate((order.customerName || "").trim() || "العميل"),
    code: bidiIsolate((order.trackingCode || "").trim() || "—"),
    price: bidiIsolate(suiviWhatsAppPrice(order)),
    product: bidiIsolate(suiviWhatsAppProductLabel(order)),
    brand: bidiIsolate("SoftSleep"),
  };
}

/** Suivi WhatsApp templates — editable before send (Arabic RTL) */
export function buildSuiviWhatsAppConfirmMessage(order: {
  customerName?: string | null;
}): string {
  const { name, brand } = suiviWhatsAppFields(order);
  return [
    `السلام عليكم أستاذ/ة ${name}`,
    ``,
    `معكم شركة ${brand}، نتواصل معكم بخصوص طلبكم لمرتبة الماتلاس.`,
    ``,
    `حاولنا الاتصال بكم عبر مكالمة هاتفية عادية لتأكيد الطلب قبل الإرسال، لكن تعذر علينا التواصل معكم.`,
    ``,
    `المرجو الرد على هذه الرسالة أو الاتصال بنا لتأكيد طلبكم. شكراً لثقتكم في ${brand} ❤️`,
  ].join("\n");
}

/** Model 2 — order left toward the client's city (original) */
export function buildSuiviWhatsAppShippingMessage(order: SuiviWhatsAppOrderFields): string {
  const { name, code, brand } = suiviWhatsAppFields(order);
  return [
    `السلام عليكم أستاذ/ة ${name}`,
    ``,
    `معكم شركة ${brand}، نعلمكم أن طلبكم قد خرج نحو مدينتكم.`,
    ``,
    `رمز التتبع لدى أمانة: ${code}`,
    ``,
    `سنقوم معكم بالمتابعة حتى يصلكم إن شاء الله. شكراً لثقتكم في ${brand} ❤️`,
  ].join("\n");
}

/** Model 3 — order arrived at post office */
export function buildSuiviWhatsAppPostOfficeMessage(order: SuiviWhatsAppOrderFields): string {
  const { name, code, price, brand } = suiviWhatsAppFields(order);
  return [
    `السلام عليكم ${name}،`,
    ``,
    `طلبكم من شركة ${brand} وصل لمكتب البريد، والمرجو التوجه لاستلامه.`,
    ``,
    `ثمن الطلبية: ${price} درهم`,
    `رقم التتبع: ${code}`,
    ``,
    `شكراً على ثقتكم فينا.`,
  ].join("\n");
}

/** Model 4 — delivery to home today */
export function buildSuiviWhatsAppHomeDeliveryTodayMessage(
  order: SuiviWhatsAppOrderFields
): string {
  const { name, code, price, brand } = suiviWhatsAppFields(order);
  return [
    `السلام عليكم ${name}،`,
    ``,
    `طلبكم من شركة ${brand} غادي يوصلكم اليوم حتى للمنزل.`,
    ``,
    `ثمن الطلبية: ${price} درهم`,
    `رقم التتبع: ${code}`,
    ``,
    `شكراً على ثقتكم فينا.`,
  ].join("\n");
}

/** Model 5 — apology for delivery delay */
export function buildSuiviWhatsAppDelayApologyMessage(
  order: SuiviWhatsAppOrderFields
): string {
  const { name, code, price, product, brand } = suiviWhatsAppFields(order);
  return [
    `السلام عليكم ${name}،`,
    ``,
    `نعتذر لكم عن التأخير في توصيل طلبكم من ${brand}. لقد تقدمنا بشكاية لدى شركة التوصيل لتسريع معالجة الطلب، ونعمل على أن يصلكم في أقرب وقت ممكن.`,
    ``,
    `المنتج: ${product}`,
    `ثمن الطلبية: ${price} درهم`,
    `رقم التتبع: ${code}`,
    ``,
    `شكراً على صبركم وثقتكم في ${brand}، ونعتذر لكم مرة أخرى عن هذا التأخير.`,
  ].join("\n");
}
