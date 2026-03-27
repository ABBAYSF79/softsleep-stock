import { useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { MainLayout } from "@/components/layout/MainLayout";
import { useInvoices } from "@/hooks/useApi";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Download, FileText, Search, Wallet } from "lucide-react";
import { InvoiceDocument } from "@/components/invoice/InvoiceDocument";
import { downloadInvoiceFromElement } from "@/utils/invoice-pdf";

const formatMoney = (value: unknown) => {
  const amount = Number(value || 0);
  return `MAD ${amount.toFixed(2)}`;
};

export default function InvoicesTracking() {
  const [searchTerm, setSearchTerm] = useState("");
  const [invoiceToDownload, setInvoiceToDownload] = useState<any>(null);
  const { data: invoices, isLoading } = useInvoices(searchTerm);
  const hiddenInvoiceRef = useRef<HTMLDivElement>(null);

  const metrics = useMemo(() => {
    const total = invoices?.length ?? 0;
    const totalAmount = (invoices ?? []).reduce(
      (sum: number, invoice: any) => sum + Number(invoice.totalTtc || 0),
      0
    );

    return { total, totalAmount };
  }, [invoices]);

  const handleDownload = async (invoice: any) => {
    setInvoiceToDownload(invoice);
    setTimeout(async () => {
      const element = hiddenInvoiceRef.current;
      if (!element) return;
      await downloadInvoiceFromElement(element, invoice.reference || invoice.invoiceNumber || invoice.id);
    }, 50);
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Invoices Tracking</h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Invoices</CardTitle>
              <FileText className="h-4 w-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Amount</CardTitle>
              <Wallet className="h-4 w-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatMoney(metrics.totalAmount)}</div>
            </CardContent>
          </Card>
        </div>

        <div className="max-w-md">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by reference, number or client..."
              className="pl-8"
            />
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Invoice Number</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Orders</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Total TTC</TableHead>
                <TableHead>Saved By</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-6">
                    Loading invoices...
                  </TableCell>
                </TableRow>
              ) : invoices?.length ? (
                invoices.map((invoice: any) => (
                  <TableRow key={invoice.id}>
                    <TableCell>
                      <Badge variant="secondary">{invoice.reference}</Badge>
                    </TableCell>
                    <TableCell>{invoice.invoiceNumber}</TableCell>
                    <TableCell>{invoice.clientName}</TableCell>
                    <TableCell>{(invoice.orderIds || []).map((id: number) => `#${id}`).join(", ")}</TableCell>
                    <TableCell>{format(new Date(invoice.createdAt), "dd/MM/yyyy HH:mm")}</TableCell>
                    <TableCell>{formatMoney(invoice.totalTtc)}</TableCell>
                    <TableCell>{invoice.createdBy?.name || "N/A"}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownload(invoice)}
                        className="gap-2"
                      >
                        <Download className="h-4 w-4" />
                        Download
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-6 text-gray-500">
                    No invoices found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="fixed -left-[9999px] top-0 pointer-events-none">
          <div ref={hiddenInvoiceRef}>
            {invoiceToDownload ? (
              <InvoiceDocument
                companyName={invoiceToDownload.companyName || "SOFTSLEEP SARL"}
                companyAddress={invoiceToDownload.companyAddress || ""}
                companyIce={invoiceToDownload.companyIce || ""}
                companyRib={invoiceToDownload.companyRib || ""}
                companyPhone={invoiceToDownload.companyPhone || ""}
                invoiceNumber={invoiceToDownload.invoiceNumber || invoiceToDownload.reference || "-"}
                invoiceDate={invoiceToDownload.invoiceDate || invoiceToDownload.createdAt}
                dueDate={invoiceToDownload.dueDate || invoiceToDownload.createdAt}
                clientName={invoiceToDownload.clientName || "Client"}
                clientPhone={invoiceToDownload.clientPhone || ""}
                clientAddress={invoiceToDownload.clientAddress || ""}
                clientCity={invoiceToDownload.clientCity || ""}
                items={(invoiceToDownload.items || []).map((item: any, index: number) => ({
                  key: `${invoiceToDownload.id}-${item.orderItemId || index}`,
                  productName: item.productName || "-",
                  variantDetails: item.variantDetails || "-",
                  quantity: Number(item.quantity || 0)
                }))}
                subtotalHt={Number(invoiceToDownload.subtotalHt || 0)}
                taxAmount={Number(invoiceToDownload.taxAmount || 0)}
                totalTtc={Number(invoiceToDownload.totalTtc || 0)}
                paymentMode={invoiceToDownload.paymentMode || "Espèce"}
              />
            ) : null}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
