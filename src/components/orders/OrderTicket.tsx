import React, { forwardRef } from 'react';
import { Order } from '@/types';
import { formatPrice, calculateOrderTotal, formatVariantDetails, getProductName } from "@/utils/order-utils";

interface OrderTicketProps {
  order: Order | null;
}

export const OrderTicket = forwardRef<HTMLDivElement, OrderTicketProps>(({ order }, ref) => {
  if (!order) return null;

  // Calculate total if not present
  const totalAmount = calculateOrderTotal(order.orderItems, order.totalAmount);

  // Get the first item (assuming one product per order as requested)
  const item = order.orderItems?.[0];

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
      
      <div className="flex flex-col h-full p-[10mm] justify-start box-border relative">
        
        {/* TOP RIGHT INFO (Date & Order No) */}
        <div className="absolute top-[10mm] right-[10mm] text-right leading-tight z-10">
          <div className="bg-white px-3 py-2 border-2 border-black rounded-lg shadow-sm">
            <p className="text-[9px] text-black uppercase tracking-wider font-semibold">Date: {new Date(order.createdAt).toLocaleDateString()}</p>
            <p className="text-[9px] text-black font-bold uppercase tracking-wider mt-0.5">N° {order.id}</p>
          </div>
        </div>

        {/* HEADER */}
        <div className="pb-4 mb-4 mt-0 relative border-b-2 border-black">
          <div className="flex flex-col md:flex-row items-center justify-between w-full">
            
            {/* Logo & Brand (Left Top) */}
            <div className="flex flex-col items-start mb-2 md:mb-0 absolute top-0 left-0">
              <img 
                src="https://res.cloudinary.com/dqkknqgiz/image/upload/v1767704930/Capture_d_%C3%A9cran_2025-11-27_232602-removebg-preview_dzmgll.png" 
                alt="SoftSleep Logo" 
                className="h-16 object-contain mb-2 grayscale"
              />
              <h1 className="text-2xl font-extrabold uppercase tracking-widest text-black">
                SOFTSLEEP
              </h1>
              <p className="text-[10px] text-black tracking-[0.2em] uppercase mt-0.5">Matelas & Accessoires</p>
              <p className="text-xs font-black text-black tracking-wider mt-1">400 29 521</p>
            </div>

            {/* Phone & Bank (Centered & Compact) */}
            <div className="flex flex-col items-center justify-center w-full mt-20">
               <div className="text-center space-y-3 bg-white px-8 py-4 border-2 border-black rounded-xl shadow-sm">
                 <div className="flex flex-col items-center">
                   <span className="uppercase text-[9px] font-bold text-black tracking-widest mb-0.5">RIB Bancaire</span>
                   <span className="text-2xl font-black text-black tracking-wider font-mono">13150927</span>
                 </div>
                 <div className="w-8 h-px bg-black mx-auto"></div>
                 <div className="flex flex-col items-center">
                   <span className="uppercase text-[9px] font-bold text-black tracking-widest mb-0.5">Service Client</span>
                   <span className="text-sm font-bold text-black tracking-tight">+212 659 530 932</span>
                 </div>
               </div>
            </div>

          </div>
        </div>

        {/* CLIENT INFO - Compact */}
        <div className="mb-4">
          <h2 className="text-[10px] font-bold uppercase text-black tracking-widest mb-2 ml-1">Informations Client</h2>
          <div className="border-2 border-black p-4 bg-white rounded-xl shadow-sm">
            <div className="grid grid-cols-1 gap-3">
              <div>
                <span className="block text-[9px] uppercase text-black font-bold tracking-wider mb-0.5">Nom complet</span>
                <span className="block text-base font-bold text-black">{order.customerName}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="block text-[9px] uppercase text-black font-bold tracking-wider mb-0.5">Téléphone</span>
                  <span className="block text-base font-bold text-black">{order.phone || '-'}</span>
                </div>
                <div>
                  <span className="block text-[9px] uppercase text-black font-bold tracking-wider mb-0.5">Ville</span>
                  <span className="block text-base font-bold text-black">{order.city || '-'}</span>
                </div>
              </div>
              <div>
                <span className="block text-[9px] uppercase text-black font-bold tracking-wider mb-0.5">Adresse de livraison</span>
                <span className="block text-base font-bold text-black leading-tight">{order.address || '-'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* PRODUCT INFO - Compact */}
        <div className="flex-grow">
          <h2 className="text-[10px] font-bold uppercase text-black tracking-widest mb-2 ml-1">Détails de la commande</h2>
          
          <div className="border-2 border-black overflow-hidden rounded-xl shadow-sm">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b-2 border-black">
                  <th className="text-left p-3 border-r-2 border-black w-2/3 uppercase text-[9px] font-bold text-black tracking-widest">Description</th>
                  <th className="text-right p-3 w-1/3 uppercase text-[9px] font-bold text-black tracking-widest">Prix Total</th>
                </tr>
              </thead>
              <tbody>
                {item ? (
                  <tr className="bg-white">
                    <td className="p-4 border-r-2 border-black align-top">
                      <p className="text-lg font-bold text-black mb-2 leading-tight">
                        {getProductName(item)}
                      </p>
                      <div className="inline-flex items-center text-xs font-medium text-black">
                        {formatVariantDetails(item)}
                      </div>
                    </td>
                    <td className="p-4 text-right align-top">
                      <span className="text-xl font-bold text-black">{formatPrice(totalAmount)} <span className="text-sm text-black font-normal">DH</span></span>
                    </td>
                  </tr>
                ) : (
                  <tr>
                    <td colSpan={2} className="p-4 text-center italic text-black text-sm">Aucun produit sélectionné</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-black text-white">
                  <td className="p-3 border-r-2 border-white text-right font-bold uppercase tracking-widest text-[10px]">Total à payer</td>
                  <td className="p-3 text-right">
                    <span className="text-xl font-black">{formatPrice(totalAmount)} DH</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* SIGNATURES */}
        <div className="mt-8 mb-4 border-t-2 border-black pt-6">
          <div className="flex justify-between gap-8">
            {/* Signature Livreur */}
            <div className="flex-1 flex flex-col">
              <span className="text-[10px] font-bold uppercase text-black tracking-widest mb-8 text-center">Signature Livreur</span>
              <div className="h-16 border-b-2 border-dashed border-black mx-4"></div>
            </div>
            
            {/* Signature Client */}
            <div className="flex-1 flex flex-col">
              <span className="text-[10px] font-bold uppercase text-black tracking-widest mb-8 text-center">Signature Client</span>
              <div className="h-16 border-b-2 border-dashed border-black mx-4"></div>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="text-center mt-auto pt-4 border-t-2 border-black">
          <p className="text-xs font-medium text-black">Merci de votre confiance.</p>
          <p className="text-[10px] text-black mt-0.5 uppercase tracking-wider">SOFTSLEEP - Matelas & Accessoires de Sommeil</p>
        </div>

      </div>
    </div>
  );
});

OrderTicket.displayName = 'OrderTicket';
