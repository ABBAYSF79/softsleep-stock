import { useStockHistory } from "@/hooks/useApi";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
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
import { format } from "date-fns";

interface StockHistorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant: {
    id: number;
    product: string;
    variant: string;
    sku: string;
  } | null;
}

export const StockHistorySheet = ({
  open,
  onOpenChange,
  variant,
}: StockHistorySheetProps) => {
  const {
    data: historyData,
    isLoading,
    isError,
    error,
  } = useStockHistory(variant?.id, {
    enabled: open && Boolean(variant?.id),
  });

  if (!variant) return null;

  const variantHistory = historyData ?? [];

  const getChangeTypeColor = (type: string, quantity: number) => {
    switch (type) {
      case "SUPPLY":
        return "bg-green-100 text-green-800";
      case "ORDER":
        return "bg-blue-100 text-blue-800";
      case "RETURN":
        return "bg-yellow-100 text-yellow-800";
      case "ADJUSTMENT":
        return quantity > 0
          ? "bg-indigo-100 text-indigo-800"
          : "bg-red-100 text-red-800";
      case "INITIAL":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getChangeTypeLabel = (type: string) => {
    switch (type) {
      case "SUPPLY":
        return "Supply";
      case "ORDER":
        return "Order";
      case "RETURN":
        return "Return";
      case "ADJUSTMENT":
        return "Correction";
      case "INITIAL":
        return "Initial";
      default:
        return type;
    }
  };

  const errorMessage =
    (error as any)?.response?.data?.error ||
    (error as any)?.message ||
    "Failed to load history";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[600px] w-[90vw] overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle>Variant History</SheetTitle>
          <SheetDescription>
            Timeline for {variant.product} — {variant.variant} (SKU: {variant.sku})
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex justify-center p-4">Loading history...</div>
        ) : isError ? (
          <div className="text-center text-red-600 p-4">{errorMessage}</div>
        ) : variantHistory.length === 0 ? (
          <div className="text-center text-gray-500 p-4">
            No history found for this variant.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Change</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {variantHistory.map((item: any) => (
                <TableRow key={item.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {format(new Date(item.createdAt), "dd/MM/yy HH:mm")}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={getChangeTypeColor(item.type, item.quantity)}
                      variant="outline"
                    >
                      {getChangeTypeLabel(item.type)}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className={`text-right font-medium ${
                      item.quantity > 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {item.quantity > 0 ? "+" : ""}
                    {item.quantity}
                  </TableCell>
                  <TableCell className="text-right font-bold">
                    {item.newStock}
                  </TableCell>
                  <TableCell
                    className="text-xs text-gray-500 max-w-[150px] truncate"
                    title={item.reason || undefined}
                  >
                    {item.reason || "—"}
                  </TableCell>
                  <TableCell className="text-xs text-gray-500 whitespace-nowrap">
                    {item.user?.name || "—"}
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
