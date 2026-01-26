import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useOrders } from "@/hooks/useApi";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useReactToPrint } from "react-to-print";
import { useRef } from "react";
import { format } from "date-fns";

const Invoice = () => {
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [companyName, setCompanyName] = useState("Matles Commerce");
  const [companyAddress, setCompanyAddress] = useState("123 Business Street, City, Country");
  const [companyPhone, setCompanyPhone] = useState("+1234567890");
  const [companyEmail, setCompanyEmail] = useState("info@matles.com");
  const [invoiceNumber, setInvoiceNumber] = useState("INV-" + Date.now());
  const [invoiceDate, setInvoiceDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [dueDate, setDueDate] = useState(format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"));
  const [notes, setNotes] = useState("Thank you for your business!");

  const { data: orders, isLoading } = useOrders();
  const invoiceRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: invoiceRef,
    documentTitle: `Invoice-${invoiceNumber}`,
    pageStyle: `
      @page {
        size: A4;
        margin: 20mm;
      }
      @media print {
        body {
          -webkit-print-color-adjust: exact;
        }
      }
    `,
    onAfterPrint: () => console.log('Print completed'),
    onBeforePrint: () => Promise.resolve(console.log('Starting print...')),
    onPrintError: (errorLocation, error) => console.error('Print error:', errorLocation, error)
  });

  const formatPrice = (price: any) => {
    if (typeof price === 'string') {
      return parseFloat(price).toFixed(2);
    }
    if (typeof price === 'number') {
      return price.toFixed(2);
    }
    return '0.00';
  };

  const calculateTotal = () => {
    if (!selectedOrder) return 0;
    return selectedOrder.orderItems.reduce((sum: number, item: any) => {
      const price = typeof item.price === 'string' ? parseFloat(item.price) : item.price;
      return sum + (price * item.quantity);
    }, 0);
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-lg">Loading orders...</div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="flex gap-8">
        {/* Invoice Settings */}
        <div className="w-1/3 space-y-6">
          <h1 className="text-2xl font-bold mb-6">Invoice Settings</h1>
          
          <div className="space-y-4">
            <div>
              <Label>Select Order</Label>
              <Select onValueChange={(value) => {
                const order = orders?.find((o: any) => o.id === parseInt(value));
                setSelectedOrder(order);
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an order" />
                </SelectTrigger>
                <SelectContent>
                  {orders?.map((order: any) => (
                    <SelectItem key={order.id} value={order.id.toString()}>
                      Order #{order.id} - {order.customerName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Company Name</Label>
              <Input 
                value={companyName} 
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </div>

            <div>
              <Label>Company Address</Label>
              <Textarea 
                value={companyAddress} 
                onChange={(e) => setCompanyAddress(e.target.value)}
              />
            </div>

            <div>
              <Label>Company Phone</Label>
              <Input 
                value={companyPhone} 
                onChange={(e) => setCompanyPhone(e.target.value)}
              />
            </div>

            <div>
              <Label>Company Email</Label>
              <Input 
                value={companyEmail} 
                onChange={(e) => setCompanyEmail(e.target.value)}
              />
            </div>

            <div>
              <Label>Invoice Number</Label>
              <Input 
                value={invoiceNumber} 
                onChange={(e) => setInvoiceNumber(e.target.value)}
              />
            </div>

            <div>
              <Label>Invoice Date</Label>
              <Input 
                type="date" 
                value={invoiceDate} 
                onChange={(e) => setInvoiceDate(e.target.value)}
              />
            </div>

            <div>
              <Label>Due Date</Label>
              <Input 
                type="date" 
                value={dueDate} 
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea 
                value={notes} 
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <Button onClick={handlePrint} className="w-full">
              Download PDF
            </Button>
          </div>
        </div>

        {/* Invoice Preview */}
        <div className="w-2/3">
          <div ref={invoiceRef} className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
            <div className="flex justify-between mb-8">
              <div>
                <h2 className="text-2xl font-bold">{companyName}</h2>
                <p className="text-gray-600">{companyAddress}</p>
                <p className="text-gray-600">{companyPhone}</p>
                <p className="text-gray-600">{companyEmail}</p>
              </div>
              <div className="text-right">
                <h1 className="text-3xl font-bold mb-2">INVOICE</h1>
                <p className="text-gray-600">Invoice #: {invoiceNumber}</p>
                <p className="text-gray-600">Date: {format(new Date(invoiceDate), "MMM dd, yyyy")}</p>
                <p className="text-gray-600">Due Date: {format(new Date(dueDate), "MMM dd, yyyy")}</p>
              </div>
            </div>

            {selectedOrder && (
              <>
                <div className="mb-8">
                  <h3 className="text-lg font-semibold mb-2">Bill To:</h3>
                  <p className="text-gray-600">{selectedOrder.customerName}</p>
                  {selectedOrder.address && <p className="text-gray-600">{selectedOrder.address}</p>}
                  {selectedOrder.phone && <p className="text-gray-600">{selectedOrder.phone}</p>}
                  {selectedOrder.city && <p className="text-gray-600">{selectedOrder.city}</p>}
                </div>

                <table className="w-full mb-8">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Item</th>
                      <th className="text-right py-2">Quantity</th>
                      <th className="text-right py-2">Price</th>
                      <th className="text-right py-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.orderItems.map((item: any) => {
                      const price = typeof item.price === 'string' ? parseFloat(item.price) : item.price;
                      const total = price * item.quantity;
                      return (
                        <tr key={item.id} className="border-b">
                          <td className="py-2">{item.variant.name}</td>
                          <td className="text-right py-2">{item.quantity}</td>
                          <td className="text-right py-2">MAD {formatPrice(price)}</td>
                          <td className="text-right py-2">MAD {formatPrice(total)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t">
                      <td colSpan={3} className="text-right py-2 font-semibold">Total:</td>
                      <td className="text-right py-2 font-semibold">MAD {formatPrice(calculateTotal())}</td>
                    </tr>
                  </tfoot>
                </table>

                <div className="mt-8">
                  <h3 className="text-lg font-semibold mb-2">Notes:</h3>
                  <p className="text-gray-600">{notes}</p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default Invoice; 