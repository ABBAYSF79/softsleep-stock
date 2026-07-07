import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { format } from 'date-fns';
import { formatPrice } from './order-utils';

export type ProductOverviewExcelRow = {
  orderId: number;
  orderDate: string;
  customerName: string;
  customerPhone: string;
  city: string;
  status: string;
  productName: string;
  variantLabel: string;
  quantity: number;
};

function safeExcelFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]+/g, '-')
    .replace(/\s+/g, '_')
    .replace(/-+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '');
}

/** Builds `.xlsx` name: period preset + date range + optional filter tags. */
export function buildProductOverviewExcelFilename(opts: {
  dateFilter: string;
  dateFrom?: Date;
  dateTo?: Date;
  statusFilter: string;
  productFilter: string;
  variantFilter?: string;
}): string {
  const period =
    opts.dateFrom && opts.dateTo
      ? `${format(opts.dateFrom, 'yyyy-MM-dd')}_${format(opts.dateTo, 'yyyy-MM-dd')}`
      : `exported_${format(new Date(), 'yyyy-MM-dd_HHmm')}`;

  let base = `product-overview_${opts.dateFilter}_${period}`;
  if (opts.statusFilter !== 'all') {
    base += `_status-${opts.statusFilter}`;
  }
  if (opts.productFilter !== 'all') {
    base += `_product-${opts.productFilter}`;
  }
  if (opts.variantFilter && opts.variantFilter !== 'all') {
    base += `_variant-${opts.variantFilter}`;
  }
  return safeExcelFilename(`${base}.xlsx`);
}

export async function exportProductOverviewToExcel(
  rows: ProductOverviewExcelRow[],
  filename: string
) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Product overview');

  worksheet.columns = [
    { header: 'Order', key: 'orderId', width: 10 },
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Customer', key: 'customerName', width: 24 },
    { header: 'Phone', key: 'customerPhone', width: 16 },
    { header: 'City', key: 'city', width: 18 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Product', key: 'product', width: 32 },
    { header: 'Variant', key: 'variant', width: 28 },
    { header: 'Qty', key: 'qty', width: 8 },
  ];

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE8E8EC' },
  };

  rows.forEach((r) => {
    worksheet.addRow({
      orderId: r.orderId,
      date: format(new Date(r.orderDate), 'yyyy-MM-dd'),
      customerName: r.customerName,
      customerPhone: r.customerPhone,
      city: r.city,
      status: r.status,
      product: r.productName,
      variant: r.variantLabel,
      qty: r.quantity,
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  saveAs(blob, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

export const exportOrdersToExcel = async (orders: any[], filename = 'orders-export.xlsx') => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Orders');

  // Define columns
  worksheet.columns = [
    { header: 'Order', key: 'id', width: 10 },
    { header: 'Date', key: 'date', width: 18 },
    { header: 'Nom', key: 'customerName', width: 20 },
    { header: 'Telephone', key: 'phone', width: 15 },
    { header: 'Ville', key: 'city', width: 15 },
    { header: 'Service Livraison', key: 'deliveryService', width: 20 },
    { header: 'Tracking', key: 'trackingCode', width: 18 },
    { header: 'Statut', key: 'status', width: 14 },
    { header: 'Adresse', key: 'address', width: 28 },
    { header: 'Prix', key: 'totalAmount', width: 15 },
    { header: 'Produit', key: 'items', width: 50 },
    { header: 'Note', key: 'note', width: 28 },
  ];

  // Style header row
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  };

  // Add data rows
  orders.forEach(order => {
    const createdAt = order?.createdAt ? new Date(order.createdAt) : null;
    const items = Array.isArray(order?.items) ? order.items : [];
    // Format items string
    const itemsString = items.map((item: any) => 
      `${item?.quantity ?? 0}x ${item?.product?.name || item?.productName || 'Unknown'} (${item?.variant?.name || item?.variantName || 'Unknown'})`
    ).join(', ');

    worksheet.addRow({
      id: order?.id ?? '',
      date: createdAt ? format(createdAt, 'yyyy-MM-dd HH:mm') : '',
      customerName: order.customerName,
      phone: order.phone || '',
      city: order.city || '',
      deliveryService: order.deliveryService?.name || '',
      trackingCode: order?.trackingCode || '',
      status: order?.status || '',
      address: order?.address || '',
      totalAmount: Number(order?.totalAmount ?? 0),
      items: itemsString,
      note: typeof order?.note === 'string' ? order.note : '',
    });
  });

  // Generate buffer and save file
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, filename);
};

export type ConfirmationTeamExcelRow = {
  orderId: number;
  orderDate: string;
  customerName: string;
  phone: string;
  city: string;
  address: string;
  deliveryService: string;
  trackingCode: string;
  status: string;
  isPaid: boolean;
  totalAmount: number;
  commission: number;
  confirmationUserName: string;
  products: string;
  pillowItems: string;
  note: string;
};

export function buildConfirmationTeamExcelFilename(
  confirmationUserName: string,
  periodDate: Date = new Date()
): string {
  const yearMonth = format(periodDate, 'yyyy-MM');
  const name = confirmationUserName.trim() || 'Confirmation';
  return safeExcelFilename(`${name}_${yearMonth}.xlsx`);
}

function formatOrderItemsForExcel(order: any): string {
  const items = Array.isArray(order?.items)
    ? order.items
    : Array.isArray(order?.orderItems)
      ? order.orderItems
      : [];

  return items
    .map((item: any) => {
      const qty = item?.quantity ?? 0;
      const product =
        item?.product?.name ?? item?.productName ?? 'Unknown product';
      const variant =
        item?.variant?.name ?? item?.variantName ?? item?.variant?.skuExt ?? '';
      return variant ? `${qty}x ${product} (${variant})` : `${qty}x ${product}`;
    })
    .join(' | ');
}

function formatPillowItemsForExcel(order: any): string {
  const items = Array.isArray(order?.pillowItems) ? order.pillowItems : [];
  if (!items.length) return '';

  return items
    .map((item: any) => {
      const qty = item?.quantity ?? 0;
      const name = item?.pillowName ?? item?.pillow?.name ?? 'Accessoire';
      return `${qty}x ${name}`;
    })
    .join(' | ');
}

export function mapOrdersToConfirmationTeamExcelRows(orders: any[]): ConfirmationTeamExcelRow[] {
  return orders.map((order) => {
    const createdAt = order?.createdAt ? new Date(order.createdAt) : new Date();
    const confirmationUser = order?.confirmationUser;

    return {
      orderId: order?.id ?? 0,
      orderDate: format(createdAt, 'yyyy-MM-dd HH:mm'),
      customerName: order?.customerName ?? '',
      phone: order?.phone ?? '',
      city: order?.city ?? '',
      address: order?.address ?? '',
      deliveryService: order?.deliveryService?.name ?? '',
      trackingCode: order?.trackingCode ?? '',
      status: order?.status ?? '',
      isPaid: Boolean(order?.isPaid),
      totalAmount: Number(order?.totalAmount ?? 0),
      commission: Number(order?.commission ?? 0),
      confirmationUserName: confirmationUser?.name ?? '',
      products: formatOrderItemsForExcel(order),
      pillowItems: formatPillowItemsForExcel(order),
      note: typeof order?.note === 'string' ? order.note : '',
    };
  });
}

export async function exportConfirmationTeamOverviewToExcel(
  orders: any[],
  filename: string
) {
  const rows = mapOrdersToConfirmationTeamExcelRows(orders);
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Confirmation team');

  worksheet.columns = [
    { header: 'Order ID', key: 'orderId', width: 10 },
    { header: 'Date', key: 'orderDate', width: 18 },
    { header: 'Customer', key: 'customerName', width: 22 },
    { header: 'Phone', key: 'phone', width: 16 },
    { header: 'City', key: 'city', width: 16 },
    { header: 'Address', key: 'address', width: 28 },
    { header: 'Delivery Service', key: 'deliveryService', width: 20 },
    { header: 'Tracking', key: 'trackingCode', width: 18 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Paid', key: 'isPaid', width: 8 },
    { header: 'Total (MAD)', key: 'totalAmount', width: 14 },
    { header: 'Commission (MAD)', key: 'commission', width: 16 },
    { header: 'Nom', key: 'confirmationUserName', width: 22 },
    { header: 'Products', key: 'products', width: 48 },
    { header: 'Accessoires', key: 'pillowItems', width: 28 },
    { header: 'Note', key: 'note', width: 32 },
  ];

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE8E8EC' },
  };

  rows.forEach((row) => worksheet.addRow(row));

  worksheet.getColumn('totalAmount').numFmt = '#,##0.00';
  worksheet.getColumn('commission').numFmt = '#,##0.00';

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  saveAs(blob, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}
