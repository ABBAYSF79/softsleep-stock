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
import { Printer, Download, Loader2 } from "lucide-react";
// @ts-ignore
import html2pdf from 'html2pdf.js';
import { toast } from "sonner";

interface OrderTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
}

export const OrderTicketDialog = ({ open, onOpenChange, order }: OrderTicketDialogProps) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const componentRef = useRef<HTMLDivElement>(null);
  
  const handlePrint = useReactToPrint({
    contentRef: componentRef,
    documentTitle: `Ticket-Matelas-${order?.id || 'Order'}`,
  });

  const handleDownload = async () => {
    if (!componentRef.current) return;

    setIsGenerating(true);
    const element = componentRef.current;
    const opt = {
      margin: 0,
      filename: `Ticket-Matelas-${order?.id || 'Order'}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, scrollY: 0 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    try {
      await html2pdf().set(opt).from(element).save();
      toast.success("PDF generated successfully");
    } catch (error) {
      console.error("PDF generation failed:", error);
      toast.error("Failed to generate PDF");
    } finally {
      setIsGenerating(false);
    }
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[230mm] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Order Ticket Preview</DialogTitle>
        </DialogHeader>
        
        <div className="flex justify-center bg-gray-100 p-4 rounded-md overflow-auto">
          {/* This is the component that will be printed */}
          <div className="shadow-lg transform scale-90 origin-top">
            <OrderTicket ref={componentRef} order={order} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button 
            onClick={handleDownload} 
            variant="secondary" 
            className="gap-2"
            disabled={isGenerating}
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {isGenerating ? "Generating..." : "Download PDF"}
          </Button>
          <Button onClick={() => handlePrint()} className="gap-2 bg-matles-600 hover:bg-matles-700">
            <Printer className="h-4 w-4" />
            Print Ticket
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
