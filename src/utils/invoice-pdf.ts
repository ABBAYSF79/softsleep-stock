// @ts-ignore
import html2pdf from "html2pdf.js";

export const downloadInvoiceFromElement = async (element: HTMLElement, invoiceNumber: string) => {
  const opt = {
    margin: 0,
    filename: `Facture-${invoiceNumber}.pdf`,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: true, scrollY: 0, windowHeight: 1200 },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    pagebreak: { mode: ["avoid-all", "css", "legacy"] }
  };

  await html2pdf().set(opt).from(element).save();
};
