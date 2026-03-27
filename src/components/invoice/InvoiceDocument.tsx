import { format } from "date-fns";
import { formatPrice } from "@/utils/order-utils";

export interface InvoiceDocumentItem {
  key: string;
  productName: string;
  variantDetails: string;
  quantity: number;
}

interface InvoiceDocumentProps {
  companyName: string;
  companyAddress: string;
  companyIce?: string;
  companyRib?: string;
  companyPhone?: string;
  invoiceNumber: string;
  invoiceDate: string | Date;
  dueDate: string | Date;
  clientName: string;
  clientPhone?: string;
  clientAddress?: string;
  clientCity?: string;
  items: InvoiceDocumentItem[];
  subtotalHt: number;
  taxAmount: number;
  totalTtc: number;
  paymentMode: string;
}

export const InvoiceDocument = ({
  companyName,
  companyAddress,
  companyIce,
  companyRib,
  companyPhone,
  invoiceNumber,
  invoiceDate,
  dueDate,
  clientName,
  clientPhone,
  clientAddress,
  clientCity,
  items,
  subtotalHt,
  taxAmount,
  totalTtc,
  paymentMode
}: InvoiceDocumentProps) => {
  return (
    <div className="bg-white w-[210mm] h-[296mm] mx-auto p-[10mm] shadow-lg relative flex flex-col box-border overflow-hidden">
      <div className="flex justify-between items-start mb-6 border-b-2 border-black pb-4">
        <div className="flex flex-col items-start max-w-[50%]">
          <img
            src="https://res.cloudinary.com/dqkknqgiz/image/upload/v1767704930/Capture_d_%C3%A9cran_2025-11-27_232602-removebg-preview_dzmgll.png"
            alt="SoftSleep Logo"
            className="h-16 object-contain mb-2 grayscale"
          />
          <h1 className="text-2xl font-extrabold uppercase tracking-widest text-black">{companyName}</h1>
          <p className="text-[10px] text-black tracking-[0.2em] uppercase mt-1">{companyAddress}</p>
          <p className="text-[10px] font-black text-black tracking-wider mt-1">ICE: {companyIce || "-"}</p>
          <div className="mt-2 flex gap-4 text-[10px] text-gray-600">
            <div><span className="font-bold">RIB:</span> {companyRib || "-"}</div>
            <div><span className="font-bold">Tél:</span> {companyPhone || "-"}</div>
          </div>
        </div>

        <div className="text-right">
          <h1 className="text-3xl font-bold mb-3 tracking-widest text-gray-900">FACTURE</h1>
          <div className="space-y-1">
            <p className="text-xs text-black font-semibold">N° Facture: <span className="font-normal">{invoiceNumber}</span></p>
            <p className="text-xs text-black font-semibold">Date: <span className="font-normal">{format(new Date(invoiceDate), "dd/MM/yyyy")}</span></p>
            <p className="text-xs text-black font-semibold">Échéance: <span className="font-normal">{format(new Date(dueDate), "dd/MM/yyyy")}</span></p>
          </div>
        </div>
      </div>

      {items.length > 0 ? (
        <>
          <div className="mb-6">
            <div className="bg-gray-50 border border-gray-100 rounded-sm p-3">
              <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-1">Facturer à</p>
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-bold text-gray-900 uppercase">{clientName}</p>
                  {clientPhone && <p className="text-xs text-gray-600 mt-0.5">{clientPhone}</p>}
                </div>
                <div className="text-right max-w-[50%]">
                  {clientAddress && <p className="text-xs text-gray-600 leading-tight">{clientAddress}</p>}
                  {clientCity && <p className="text-xs text-gray-600 font-medium mt-0.5 uppercase">{clientCity}</p>}
                </div>
              </div>
            </div>
          </div>

          <div className="mb-12">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-black">
                  <th className="text-left py-2 text-[10px] font-bold uppercase tracking-widest text-black">Produit</th>
                  <th className="text-right py-2 text-[10px] font-bold uppercase tracking-widest text-black">Quantité</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.key} className="border-b border-gray-100">
                    <td className="py-2">
                      <p className="font-bold text-xs text-black">{item.productName}</p>
                      <p className="text-[10px] text-gray-500">{item.variantDetails}</p>
                    </td>
                    <td className="text-right py-2 text-xs">{item.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-end mt-6">
              <div className="w-1/3">
                <table className="w-full border-collapse">
                  <tbody>
                    <tr className="border-b border-gray-200">
                      <td className="py-2 text-xs font-semibold text-gray-600">Total HT</td>
                      <td className="py-2 text-right text-xs font-semibold text-gray-900">{formatPrice(subtotalHt)} DH</td>
                    </tr>
                    <tr className="border-b border-gray-200">
                      <td className="py-2 text-xs font-semibold text-gray-600">TVA (20%)</td>
                      <td className="py-2 text-right text-xs font-semibold text-gray-900">{formatPrice(taxAmount)} DH</td>
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="py-3 pl-2 text-sm font-bold text-black uppercase">Total TTC</td>
                      <td className="py-3 pr-2 text-right text-lg font-black text-black">{formatPrice(totalTtc)} DH</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="mt-auto pt-8 border-t border-gray-200">
            <div className="flex justify-between items-end">
              <div className="w-1/2">
                <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Mode de paiement</h3>
                <p className="text-sm font-semibold text-black">{paymentMode}</p>
              </div>
              <div className="flex flex-col items-center">
                <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">Cachet et Signature</h3>
                <img
                  src="/image/cacket.png"
                  alt="Cachet SoftSleep"
                  className="h-32 object-contain opacity-90 rotate-[-5deg]"
                />
              </div>
            </div>
          </div>

          <div className="mt-4 text-center">
            <p className="text-[9px] text-gray-400 uppercase tracking-widest">Document généré informatiquement par SoftSleep System</p>
          </div>
        </>
      ) : (
        <div className="text-center py-20 text-gray-400">
          <p>Veuillez sélectionner une commande pour générer la facture</p>
        </div>
      )}
    </div>
  );
};
