import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { formatPrice } from './order-utils';

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