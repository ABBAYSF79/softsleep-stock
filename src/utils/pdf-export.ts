import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatPrice } from './order-utils';

export const exportOrdersToPdf = (orders: any[], filename = 'orders-export.pdf') => {
  const doc = new jsPDF();

  // Add Title
  doc.setFontSize(18);
  doc.text('Liste des Commandes', 14, 22);
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 30);

  // Prepare table data
  const tableColumn = ["Nom", "Telephone", "Ville", "Service Livraison", "Prix", "Produit"];
  const tableRows: any[] = [];

  orders.forEach(order => {
    // Format items string
    const itemsString = order.items.map((item: any) => 
      `${item.quantity}x ${item.product?.name || 'Unknown'} (${item.variant?.name || 'Unknown'})`
    ).join(', ');

    const orderData = [
      order.customerName,
      order.phone || '',
      order.city || '',
      order.deliveryService?.name || '',
      `${parseFloat(order.totalAmount).toFixed(2)} MAD`,
      itemsString
    ];
    tableRows.push(orderData);
  });

  // Generate table
  autoTable(doc, {
    head: [tableColumn],
    body: tableRows,
    startY: 35,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [220, 53, 69] }, // Red color matching the theme roughly
    columnStyles: {
      0: { cellWidth: 30 }, // Nom
      1: { cellWidth: 25 }, // Phone
      2: { cellWidth: 20 }, // City
      3: { cellWidth: 25 }, // Delivery
      4: { cellWidth: 25 }, // Price
      5: { cellWidth: 'auto' } // Product
    }
  });

  // Save the PDF
  doc.save(filename);
};
