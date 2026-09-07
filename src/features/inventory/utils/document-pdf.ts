// @ts-ignore
import html2pdf from 'html2pdf.js';

/**
 * Download a transfer stock document (BS / BE) as PDF from a rendered HTML element.
 */
export async function downloadInventoryDocumentPdf(
  element: HTMLElement,
  documentNumber: string
): Promise<void> {
  const safeName = String(documentNumber || 'document')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-');

  const opt = {
    margin: [10, 10, 10, 10],
    filename: `${safeName}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false, scrollY: 0 },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
  };

  await html2pdf().set(opt).from(element).save();
}
