import { format } from "date-fns";
import { usePillowStockHistory } from "@/hooks/useApi";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface PillowHistorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pillow: {
    id: number;
    name: string;
  } | null;
}

export const PillowHistorySheet = ({ open, onOpenChange, pillow }: PillowHistorySheetProps) => {
  const { data: historyData, isLoading } = usePillowStockHistory(pillow?.id);

  if (!pillow) return null;

  const getTypeColor = (type: string, quantity: number) => {
    if (type === "SUPPLY") return "bg-green-100 text-green-800";
    if (type === "OUTGOING") return "bg-red-100 text-red-800";
    if (type === "ADJUSTMENT") {
      return quantity >= 0 ? "bg-indigo-100 text-indigo-800" : "bg-red-100 text-red-800";
    }
    return "bg-gray-100 text-gray-800";
  };

  const getTypeLabel = (type: string) => {
    if (type === "SUPPLY") return "Entrée";
    if (type === "OUTGOING") return "Sortie";
    if (type === "ADJUSTMENT") return "Adjustment";
    if (type === "INITIAL") return "Initial";
    return type;
  };

  const list = historyData || [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[700px] w-[90vw] overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle>History</SheetTitle>
          <SheetDescription>Timeline for {pillow.name}</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex justify-center p-4">Loading history...</div>
        ) : list.length === 0 ? (
          <div className="text-center text-gray-500 p-4">No history found for this item.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Change</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((item: any) => (
                <TableRow key={item.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {format(new Date(item.createdAt), "dd/MM/yy HH:mm")}
                  </TableCell>
                  <TableCell>
                    <Badge className={getTypeColor(item.type, item.quantity)} variant="outline">
                      {getTypeLabel(item.type)}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className={`text-right font-medium ${item.quantity > 0 ? "text-green-600" : "text-red-600"}`}
                  >
                    {item.quantity > 0 ? "+" : ""}
                    {item.quantity}
                  </TableCell>
                  <TableCell className="text-right font-bold">{item.newStock}</TableCell>
                  <TableCell className="text-xs text-gray-500 max-w-[220px] truncate" title={item.reason}>
                    {item.reason}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SheetContent>
    </Sheet>
  );
};

