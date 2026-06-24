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
import { Download, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { OrderGuarantee } from "./OrderGuarantee";
// @ts-ignore
import html2pdf from "html2pdf.js";

interface OrderGuaranteeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
}

export const OrderGuaranteeDialog = ({
  open,
  onOpenChange,
  order,
}: OrderGuaranteeDialogProps) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const componentRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: componentRef,
    documentTitle: `Garantie-Softsleep-${order?.id || "Order"}`,
  });

  const handleDownload = async () => {
    if (!componentRef.current) return;

    setIsGenerating(true);
    const opt = {
      margin: 0,
      filename: `Garantie-Softsleep-${order?.id || "Order"}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, scrollY: 0, windowWidth: 794, windowHeight: 1122 },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css"] },
    };

    try {
      await html2pdf().set(opt).from(componentRef.current).save();
      toast.success("Guarantee PDF generated successfully");
    } catch (error) {
      console.error("Guarantee PDF generation failed:", error);
      toast.error("Failed to generate guarantee PDF");
    } finally {
      setIsGenerating(false);
    }
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[230mm] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Guarantee Document Preview</DialogTitle>
        </DialogHeader>

        <div className="flex justify-center bg-gray-100 p-4 rounded-md overflow-auto">
          <div className="shadow-lg transform scale-[0.72] origin-top">
            <OrderGuarantee ref={componentRef} order={order} />
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
            Print Guarantee
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
