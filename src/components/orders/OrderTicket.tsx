import React, { forwardRef } from 'react';
import { Order } from '@/types';
import { formatPrice, formatVariantDetails, getProductName } from "@/utils/order-utils";
import Barcode from 'react-barcode';

interface OrderTicketProps {
  order: Order | null;
}

export const OrderTicket = forwardRef<HTMLDivElement, OrderTicketProps>(({ order }, ref) => {
  if (!order) return null;

  const regularItems = Array.isArray((order as any).items)
    ? (order as any).items
    : Array.isArray((order as any).orderItems)
      ? (order as any).orderItems
      : [];
  const supplementaryItems = Array.isArray((order as any).pillowItems) ? (order as any).pillowItems : [];
  const totalAmount = order.totalAmount;

  return (
    <div ref={ref} className="bg-white w-[210mm] h-[296mm] mx-auto text-black overflow-hidden relative font-sans">
      <style type="text/css" media="print">
        {`
          @page {
            size: A4;
            margin: 0;
          }
          @media print {
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            html, body {
              width: 210mm;
              height: 297mm;
              margin: 0;
              padding: 0;
              overflow: hidden;
            }
          }
        `}
      </style>
      
      <div className="flex flex-col h-full p-[7mm] justify-start box-border relative">
        
        {/* TOP RIGHT INFO (Date & Order No) */}
        <div className="absolute top-[7mm] right-[7mm] text-right leading-tight z-10">
          <div className="bg-white px-2 py-1.5 border-2 border-black rounded-md shadow-sm">
            <p className="text-[8px] text-black uppercase tracking-wider font-semibold">Date: {new Date(order.createdAt).toLocaleDateString()}</p>
            <p className="text-[8px] text-black font-bold uppercase tracking-wider mt-0.5">N° {order.id}</p>
          </div>
        </div>

        {/* HEADER */}
        <div className="pb-2 mb-2 mt-0 relative border-b-2 border-black">
          <div className="flex flex-col md:flex-row items-center justify-between w-full">
            
            {/* Logo & Brand (Left Top) */}
            <div className="flex flex-col items-start mb-1 md:mb-0 absolute top-0 left-0">
              <img 
                src="https://res.cloudinary.com/dqkknqgiz/image/upload/v1767704930/Capture_d_%C3%A9cran_2025-11-27_232602-removebg-preview_dzmgll.png" 
                alt="SoftSleep Logo" 
                className="h-11 object-contain mb-1 grayscale"
              />
              <h1 className="text-lg font-extrabold uppercase tracking-widest text-black">
                SOFTSLEEP
              </h1>
              <p className="text-[8px] text-black tracking-[0.18em] uppercase mt-0.5">Matelas & Accessoires</p>
              <p className="text-[10px] font-black text-black tracking-wider mt-0.5">400 29 521</p>
            </div>

            {/* Phone & Bank (Centered & Compact) */}
            <div className="flex flex-col items-center justify-center w-full mt-14">
               <div className="text-center space-y-2 bg-white px-5 py-2.5 border-2 border-black rounded-lg shadow-sm">
                 <div className="flex flex-col items-center">
                   <span className="uppercase text-[8px] font-bold text-black tracking-widest mb-0.5">RIB Bancaire</span>
                   <span className="text-lg font-black text-black tracking-wider font-mono">13150927</span>
                 </div>
                 <div className="w-6 h-px bg-black mx-auto"></div>
                 <div className="flex flex-col items-center">
                   <span className="uppercase text-[8px] font-bold text-black tracking-widest mb-0.5">Service Client</span>
                   <span className="text-[11px] font-bold text-black tracking-tight">+212 659 530 932</span>
                 </div>
               </div>
            </div>

          </div>
        </div>

        {/* CLIENT INFO - Compact */}
        <div className="mb-2">
          <h2 className="text-[9px] font-bold uppercase text-black tracking-widest mb-1 ml-1">Informations Client</h2>
          <div className="border-2 border-black p-3 bg-white rounded-lg shadow-sm">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <div>
                <span className="block text-[8px] uppercase text-black font-bold tracking-wider mb-0.5">Nom complet</span>
                <span className="block text-[13px] font-bold text-black leading-tight">{order.customerName}</span>
              </div>
              <div>
                <span className="block text-[8px] uppercase text-black font-bold tracking-wider mb-0.5">Téléphone</span>
                <span className="block text-[13px] font-bold text-black leading-tight">{order.phone || '-'}</span>
              </div>
              <div>
                <span className="block text-[8px] uppercase text-black font-bold tracking-wider mb-0.5">Ville</span>
                <span className="block text-[13px] font-bold text-black leading-tight">{order.city || '-'}</span>
              </div>
              <div>
                <span className="block text-[8px] uppercase text-black font-bold tracking-wider mb-0.5">Adresse de livraison</span>
                <span className="block text-[13px] font-bold text-black leading-tight break-words">{order.address || '-'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* PRODUCT INFO - Compact */}
        <div className="flex-grow">
          <h2 className="text-[9px] font-bold uppercase text-black tracking-widest mb-1 ml-1">Détails de la commande</h2>
          
          <div className="border-2 border-black overflow-hidden rounded-lg shadow-sm">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b-2 border-black">
                  <th className="text-left px-3 py-1.5 border-r-2 border-black w-[82%] uppercase text-[8px] font-bold text-black tracking-widest">Produit</th>
                  <th className="text-right px-3 py-1.5 w-[18%] uppercase text-[8px] font-bold text-black tracking-widest">Qté</th>
                </tr>
              </thead>
              <tbody>
                {regularItems.length > 0 || supplementaryItems.length > 0 ? (
                  <>
                    {regularItems.map((item: any, index: number) => {
                      const qty = Number(item.quantity ?? 0);
                      return (
                        <tr key={`regular-${item.id ?? index}`} className="bg-white border-b border-black/20">
                          <td className="px-3 py-2 border-r-2 border-black align-top">
                            <p className="text-[13px] font-bold text-black leading-tight">
                              {getProductName(item)}
                            </p>
                            <div className="inline-flex items-center text-[10px] font-medium text-black mt-0.5">
                              {formatVariantDetails(item)}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right align-top">
                            <span className="text-[13px] font-bold text-black">{qty}</span>
                          </td>
                        </tr>
                      );
                    })}

                    {supplementaryItems.map((item: any, index: number) => {
                      const qty = Number(item.quantity ?? 0);
                      return (
                        <tr key={`supp-${item.id ?? item.pillowId ?? index}`} className="bg-gray-50 border-b border-black/20">
                          <td className="px-3 py-2 border-r-2 border-black align-top">
                            <p className="text-[13px] font-bold text-black leading-tight">
                              {item.pillowName || item.name || 'Accessoire'}
                            </p>
                            <div className="inline-flex items-center text-[9px] font-medium text-black uppercase tracking-wide mt-0.5">
                              Produit supplémentaire
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right align-top">
                            <span className="text-[13px] font-bold text-black">{qty}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </>
                ) : (
                  <tr>
                    <td colSpan={2} className="p-4 text-center italic text-black text-sm">Aucun produit sélectionné</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-black text-white">
                  <td className="px-3 py-2.5 border-r-2 border-white text-right font-bold uppercase tracking-widest text-[9px]">Total à payer</td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="text-[18px] font-black">{formatPrice(totalAmount)} DH</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* SIGNATURES */}
        <div className="mt-3 mb-2 border-t-2 border-black pt-3">
          <div className="flex justify-between gap-4">
            {/* Signature Livreur */}
            <div className="flex-1 flex flex-col">
              <span className="text-[8px] font-bold uppercase text-black tracking-widest mb-4 text-center">Signature Livreur</span>
              <div className="h-8 border-b-2 border-dashed border-black mx-3"></div>
            </div>
            
            {/* Signature Client */}
            <div className="flex-1 flex flex-col">
              <span className="text-[8px] font-bold uppercase text-black tracking-widest mb-4 text-center">Signature Client</span>
              <div className="h-8 border-b-2 border-dashed border-black mx-3"></div>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="text-center mt-auto pt-2 border-t-2 border-black">
          {order.status === "IN_PROCESS" && order.trackingCode && (
            <div className="w-full flex flex-col items-center justify-center gap-1.5 pb-2">
              <div className="text-[8px] font-bold uppercase tracking-widest">Tracking Code</div>
              <div className="bg-white px-2 py-1.5 border-2 border-black rounded-md shadow-sm">
                <Barcode
                  value={order.trackingCode}
                  width={1.5}
                  height={48}
                  fontSize={10}
                  font="Arial"
                  fontOptions="bold"
                  textMargin={4}
                  margin={0}
                  displayValue={true}
                />
              </div>
            </div>
          )}
          <p className="text-[10px] font-medium text-black">Merci de votre confiance.</p>
          <p className="text-[8px] text-black mt-0.5 uppercase tracking-wider">SOFTSLEEP - Matelas & Accessoires de Sommeil</p>
        </div>

      </div>
    </div>
  );
});

OrderTicket.displayName = 'OrderTicket';
