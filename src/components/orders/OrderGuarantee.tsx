import React, { forwardRef } from "react";
import { Order } from "@/types";
import { formatVariantDetails, getProductName } from "@/utils/order-utils";

interface OrderGuaranteeProps {
  order: Order | null;
}

export const OrderGuarantee = forwardRef<HTMLDivElement, OrderGuaranteeProps>(({ order }, ref) => {
  if (!order) return null;

  const regularItems = Array.isArray((order as any).items)
    ? (order as any).items
    : Array.isArray((order as any).orderItems)
      ? (order as any).orderItems
      : [];

  const displayItems = regularItems.length > 0
    ? regularItems
    : [{ id: "fallback", quantity: 1, productName: "Produit", size: "-" }];

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
              height: 296mm;
              margin: 0;
              padding: 0;
              overflow: hidden;
            }
          }
        `}
      </style>

      <div className="h-full p-[14mm] box-border flex flex-col bg-white">
        <div className="flex items-start justify-between border-b-2 border-black pb-5">
          <div className="flex items-start gap-4">
            <img
              src="https://res.cloudinary.com/dqkknqgiz/image/upload/v1767704930/Capture_d_%C3%A9cran_2025-11-27_232602-removebg-preview_dzmgll.png"
              alt="Softsleep Logo"
              className="h-14 w-auto object-contain grayscale"
            />
            <div className="pt-1">
              <p className="text-[11px] uppercase tracking-[0.35em] font-semibold">Softsleep</p>
              <h1 className="text-[24px] font-black uppercase tracking-[0.18em] leading-none mt-2">
                Certificat De Garantie
              </h1>
              <p className="text-[11px] uppercase tracking-[0.2em] mt-2 text-black/70">
                Matelas et accessoires de sommeil
              </p>
            </div>
          </div>

          <div className="h-[44mm] w-[44mm] rounded-full border-[3px] border-black flex flex-col items-center justify-center text-center shrink-0">
            <span className="text-[10px] uppercase tracking-[0.28em] font-bold">Garantie</span>
            <span className="text-[28px] leading-none font-black mt-1">10</span>
            <span className="text-[10px] uppercase tracking-[0.28em] font-bold mt-1">Ans</span>
          </div>
        </div>

        <div className="grid grid-cols-[1.15fr_0.85fr] gap-5 mt-6">
          <div className="border-2 border-black rounded-[18px] p-5">
            <p className="text-[11px] uppercase tracking-[0.26em] font-bold mb-4">Informations Client</p>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[9px] uppercase tracking-[0.2em] font-semibold text-black/60">Nom</p>
                  <p className="text-[18px] font-bold mt-1 break-words">{order.customerName || "-"}</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-[0.2em] font-semibold text-black/60">Telephone</p>
                  <p className="text-[18px] font-bold mt-1 break-words">{order.phone || "-"}</p>
                </div>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-[0.2em] font-semibold text-black/60">Date d'achat</p>
                <p className="text-[18px] font-bold mt-1">
                  {new Date(order.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>

          <div className="border-2 border-black rounded-[18px] p-5 bg-black text-white">
            <p className="text-[11px] uppercase tracking-[0.26em] font-bold mb-4">Couverture</p>
            <div className="space-y-3 text-[14px] leading-relaxed">
              <p>Garantie commerciale Softsleep de 10 ans.</p>
              <p>Valable a partir de la date d'achat mentionnee sur ce document.</p>
              <p>Le present certificat accompagne le produit pour toute demande SAV.</p>
            </div>
          </div>
        </div>

        <div className="mt-6 border-2 border-black rounded-[20px] p-5 flex-1">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[11px] uppercase tracking-[0.26em] font-bold">Produits Couverts</p>
            <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-black/60">
              Commande #{order.id}
            </p>
          </div>

          <div className="space-y-3">
            {displayItems.map((item: any, index: number) => {
              const variant = formatVariantDetails(item);
              const hasVariant = typeof variant === "string" && variant.trim() && variant.trim() !== "()";

              return (
                <div
                  key={item.id ?? index}
                  className="border border-black/20 rounded-2xl px-4 py-3 flex items-start justify-between gap-4"
                >
                  <div className="min-w-0">
                    <p className="text-[18px] font-black leading-tight break-words">
                      {getProductName(item)}
                    </p>
                    <p className="text-[11px] uppercase tracking-[0.2em] text-black/60 mt-1">
                      {hasVariant ? variant : "Dimension standard"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[9px] uppercase tracking-[0.18em] text-black/60 font-semibold">Qte</p>
                    <p className="text-[18px] font-black mt-1">{Number(item.quantity ?? 1)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-5">
          <div className="border-2 border-black rounded-[18px] p-5">
            <p className="text-[11px] uppercase tracking-[0.26em] font-bold mb-5">Cachet Softsleep</p>
            <div className="h-[34mm] rounded-2xl border border-dashed border-black/40 bg-black/[0.02] flex items-center justify-center overflow-hidden px-3 py-2">
              <img
                src="/image/cacket.png"
                alt="Cachet Softsleep"
                className="max-h-full max-w-full object-contain"
              />
            </div>
          </div>
          <div className="border-2 border-black rounded-[18px] p-5">
            <p className="text-[11px] uppercase tracking-[0.26em] font-bold mb-5">Signature Client</p>
            <div className="h-[34mm] rounded-2xl border border-dashed border-black/40" />
          </div>
        </div>

        <div className="mt-5 border-t-2 border-black pt-4 flex items-end justify-between gap-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] font-bold">Softsleep</p>
            <p className="text-[10px] text-black/70 mt-1">Document de garantie A4</p>
          </div>
          <p className="text-[9px] uppercase tracking-[0.16em] text-right text-black/60 max-w-[82mm] leading-relaxed">
            Conserver ce certificat avec votre preuve d'achat pour toute reclamation de garantie.
          </p>
        </div>
      </div>
    </div>
  );
});

OrderGuarantee.displayName = "OrderGuarantee";
