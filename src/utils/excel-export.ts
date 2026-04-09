import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { format } from 'date-fns';
import { formatPrice } from './order-utils';

export type ProductOverviewExcelRow = {
  orderId: number;
  orderDate: string;
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
    { header: 'Nom', key: 'customerName', width: 20 },
    { header: 'Telephone', key: 'phone', width: 15 },
    { header: 'Ville', key: 'city', width: 15 },
    { header: 'Service Livraison', key: 'deliveryService', width: 20 },
    { header: 'Prix', key: 'totalAmount', width: 15 },
    { header: 'Produit', key: 'items', width: 50 },
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
    // Format items string
    const itemsString = order.items.map((item: any) => 
      `${item.quantity}x ${item.product?.name || 'Unknown'} (${item.variant?.name || 'Unknown'})`
    ).join(', ');

    worksheet.addRow({
      customerName: order.customerName,
      phone: order.phone || '',
      city: order.city || '',
      deliveryService: order.deliveryService?.name || '',
      totalAmount: parseFloat(order.totalAmount),
      items: itemsString,
    });
  });

  // Generate buffer and save file
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, filename);
};