import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Barcode from 'react-barcode';

interface BarcodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trackingCode: string;
}

export const BarcodeDialog = ({ open, onOpenChange, trackingCode }: BarcodeDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md flex flex-col items-center">
        <DialogHeader>
          <DialogTitle>Tracking Barcode</DialogTitle>
        </DialogHeader>
        <div className="p-6 bg-white rounded-lg flex justify-center items-center w-full">
          {trackingCode ? (
            <Barcode 
              value={trackingCode} 
              width={2}
              height={100}
              fontSize={18}
            />
          ) : (
            <p className="text-gray-500">No tracking code available</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};