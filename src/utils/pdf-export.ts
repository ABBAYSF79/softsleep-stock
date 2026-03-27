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

export const exportInvoiceToPdf = (invoice: any) => {
  const doc = new jsPDF();
  const invoiceDate = invoice.invoiceDate ? new Date(invoice.invoiceDate) : new Date();
  const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : new Date();
  const items = Array.isArray(invoice.items) ? invoice.items : [];

  doc.setFontSize(18);
  doc.text('FACTURE', 14, 18);
  doc.setFontSize(11);
  doc.text(`Reference: ${invoice.reference || '-'}`, 14, 26);
  doc.text(`Numero: ${invoice.invoiceNumber || '-'}`, 14, 32);
  doc.text(`Date: ${invoiceDate.toLocaleDateString()}`, 14, 38);
  doc.text(`Echeance: ${dueDate.toLocaleDateString()}`, 14, 44);

  doc.text(`Client: ${invoice.clientName || '-'}`, 120, 26);
  doc.text(`Telephone: ${invoice.clientPhone || '-'}`, 120, 32);
  doc.text(`Ville: ${invoice.clientCity || '-'}`, 120, 38);
  doc.text(`Adresse: ${invoice.clientAddress || '-'}`, 120, 44);

  const rows = items.map((item: any) => [
    item.productName || '-',
    item.variantDetails || '-',
    String(item.quantity || 0)
  ]);

  autoTable(doc, {
    head: [['Produit', 'Details', 'Qte']],
    body: rows,
    startY: 52,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [30, 41, 59] }
  });

  const finalY = (doc as any).lastAutoTable?.finalY || 110;
  doc.setFontSize(11);
  doc.text(`Mode paiement: ${invoice.paymentMode || '-'}`, 14, finalY + 10);
  doc.text(`Total HT: ${formatPrice(Number(invoice.subtotalHt || 0))} MAD`, 14, finalY + 18);
  doc.text(`TVA (${Number(invoice.taxRate || 20)}%): ${formatPrice(Number(invoice.taxAmount || 0))} MAD`, 14, finalY + 26);
  doc.setFontSize(12);
  doc.text(`Total TTC: ${formatPrice(Number(invoice.totalTtc || 0))} MAD`, 14, finalY + 36);

  if (invoice.notes) {
    doc.setFontSize(10);
    doc.text(`Note: ${invoice.notes}`, 14, finalY + 46);
  }

  doc.save(`Facture-${invoice.reference || invoice.invoiceNumber || invoice.id}.pdf`);
};
