export interface ProductVariant {
  id: number;
  name: string;
  size?: { value: string; name?: string } | string | null;
  color?: string;
  product?: { name: string };
}

export interface OrderItem {
  id: number;
  price: number;
  quantity: number;
  productName?: string;
  size?: string;
  variant?: ProductVariant;
}

export interface Order {
  id: number;
  createdAt: string;
  status: string;
  totalAmount: number;
  customerName: string;
  phone?: string;
  city?: string;
  address?: string;
  orderItems: OrderItem[];
  items?: OrderItem[];
  pillowItems?: Array<{
    id?: number;
    pillowId?: number;
    pillowName?: string;
    name?: string;
    price: number;
    quantity: number;
  }>;
  deliveryService?: { name: string };
  trackingCode?: string;
}
