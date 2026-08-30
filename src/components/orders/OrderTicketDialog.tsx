import { useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { OrderTicket } from "./OrderTicket";
import { Printer, Download, Loader2, MessageCircle } from "lucide-react";
// @ts-ignore
import html2pdf from "html2pdf.js";
import { toast } from "sonner";
import { toWhatsAppPhone } from "@/utils/order-utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface OrderTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
  requireInProcessTracking?: boolean;
  /** Hide ticket preview; keep ticket off-screen for print/PDF (livreur) */
  hidePreview?: boolean;
}

const pdfOptions = (orderId: number | string | undefined) => ({
  margin: 0,
  filename: `Ticket-Matelas-${orderId || "Order"}.pdf`,
  image: { type: "jpeg" as const, quality: 0.98 },
  html2canvas: { scale: 2, useCORS: true, scrollY: 0 },
  jsPDF: { unit: "mm" as const, format: "a4" as const, orientation: "portrait" as const },
  pagebreak: { mode: ["avoid-all", "css", "legacy"] },
});

export const OrderTicketDialog = ({
  open,
  onOpenChange,
  order,
  requireInProcessTracking = true,
  hidePreview = false,
}: OrderTicketDialogProps) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const componentRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const compactActions = hidePreview || isMobile;
  const canDownloadTicket = requireInProcessTracking
    ? order?.status === "IN_PROCESS" && !!order?.trackingCode
    : true;

  const handlePrint = useReactToPrint({
    contentRef: componentRef,
    documentTitle: `Ticket-Matelas-${order?.id || "Order"}`,
  });

  const generatePdfBlob = async (): Promise<Blob> => {
    if (!componentRef.current) {
      throw new Error("Ticket element not ready");
    }
    return html2pdf()
      .set(pdfOptions(order?.id))
      .from(componentRef.current)
      .outputPdf("blob");
  };

  const handleDownload = async () => {
    if (!componentRef.current) return;
    if (!canDownloadTicket) {
      toast.error("Ticket can be downloaded only when order is In Process and has a tracking code");
      return;
    }

    setIsGenerating(true);
    try {
      await html2pdf().set(pdfOptions(order?.id)).from(componentRef.current).save();
      toast.success(hidePreview ? "PDF téléchargé" : "PDF generated successfully");
    } catch (error) {
      console.error("PDF generation failed:", error);
      toast.error(hidePreview ? "Échec de la génération du PDF" : "Failed to generate PDF");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleShareWhatsApp = async () => {
    if (!canDownloadTicket) {
      toast.error("Le ticket n'est pas disponible");
      return;
    }

    const whatsappPhone = toWhatsAppPhone(order?.phone);
    if (!whatsappPhone) {
      toast.error("Numéro client manquant pour WhatsApp");
      return;
    }

    const filename = `Ticket-Matelas-${order?.id || "Order"}.pdf`;
    const message = `Bonjour, voici votre ticket Softsleep pour la commande N°${order?.id || ""}.`;
    const waUrl = `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(message)}`;

    // Open WhatsApp immediately (must stay in the click gesture or popups are blocked)
    const waWindow = window.open(waUrl, "_blank");

    setIsSharing(true);
    try {
      const blob = await generatePdfBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      if (!waWindow) {
        // Popup blocked — navigate this tab to WhatsApp
        window.location.href = waUrl;
        return;
      }

      toast.success("WhatsApp ouvert — joignez le PDF téléchargé dans la conversation");
    } catch (error) {
      console.error("WhatsApp share failed:", error);
      toast.error("Impossible de générer le PDF pour WhatsApp");
    } finally {
      setIsSharing(false);
    }
  };

  if (!order) return null;

  const busy = isGenerating || isSharing;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={
          compactActions
            ? "w-[96vw] max-w-md rounded-2xl"
            : "max-w-[230mm] max-h-[90vh] overflow-y-auto"
        }
      >
        <DialogHeader>
          <DialogTitle>
            {hidePreview ? `Ticket commande #${order.id}` : "Order Ticket Preview"}
          </DialogTitle>
        </DialogHeader>

        {compactActions ? (
          <div aria-hidden className="pointer-events-none fixed -left-[10000px] top-0">
            <OrderTicket ref={componentRef} order={order} />
          </div>
        ) : (
          <div className="flex justify-center overflow-auto rounded-md bg-gray-100 p-4">
            <div className="origin-top scale-90 transform shadow-lg">
              <OrderTicket ref={componentRef} order={order} />
            </div>
          </div>
        )}

        <DialogFooter className={compactActions ? "flex-col gap-2 sm:flex-col" : "gap-2"}>
          {compactActions ? (
            <>
              <Button
                onClick={handleShareWhatsApp}
                className="h-11 w-full gap-2 bg-[#25D366] hover:bg-[#1ebe57]"
                disabled={busy || !canDownloadTicket || !order.phone?.trim()}
              >
                {isSharing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MessageCircle className="h-4 w-4" />
                )}
                {isSharing ? "Préparation..." : "Partager sur WhatsApp"}
              </Button>
              <Button
                onClick={handleDownload}
                variant="secondary"
                className="h-11 w-full gap-2"
                disabled={busy || !canDownloadTicket}
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {isGenerating ? "Génération..." : "Télécharger"}
              </Button>
              <Button
                onClick={() => {
                  if (!canDownloadTicket) {
                    toast.error("Ticket non disponible à l'impression");
                    return;
                  }
                  handlePrint();
                }}
                disabled={busy || !canDownloadTicket}
                className="h-11 w-full gap-2 bg-matles-600 hover:bg-matles-700"
              >
                <Printer className="h-4 w-4" />
                Imprimer
              </Button>
              <Button
                variant="outline"
                className="h-11 w-full"
                disabled={busy}
                onClick={() => onOpenChange(false)}
              >
                Fermer
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button
                onClick={handleDownload}
                variant="secondary"
                className="gap-2"
                disabled={isGenerating || !canDownloadTicket}
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {isGenerating ? "Generating..." : "Download PDF"}
              </Button>
              <Button
                onClick={() => {
                  if (!canDownloadTicket) {
                    toast.error(
                      "Ticket can be printed only when order is In Process and has a tracking code"
                    );
                    return;
                  }
                  handlePrint();
                }}
                disabled={!canDownloadTicket}
                className="gap-2 bg-matles-600 hover:bg-matles-700"
              >
                <Printer className="h-4 w-4" />
                Print Ticket
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
