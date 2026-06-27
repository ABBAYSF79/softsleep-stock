import { OrderItem, ProductVariant } from "@/types";

export const ORDER_STATUSES = {
  PENDING: { label: "Pending", value: "PENDING", color: "bg-yellow-100 text-yellow-800 hover:bg-yellow-100" },
  IN_PROCESS: { label: "In Process", value: "IN_PROCESS", color: "bg-blue-100 text-blue-800 hover:bg-blue-100" },
  DELIVERED: { label: "Delivered", value: "DELIVERED", color: "bg-green-100 text-green-800 hover:bg-green-100" },
  RETURNED: { label: "Returned", value: "RETURNED", color: "bg-red-100 text-red-800 hover:bg-red-100" },
} as const;

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
