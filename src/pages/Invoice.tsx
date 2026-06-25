import { useEffect, useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreateInvoice, useNextInvoiceReference, useOrders } from "@/hooks/useApi";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useReactToPrint } from "react-to-print";
import { useRef } from "react";
import { endOfDay, format, startOfMonth, subMonths } from "date-fns";
import { formatPrice, calculateOrderTotal, getProductName, formatVariantDetails } from "@/utils/order-utils";
import { ChevronDown, ChevronUp, Check, ChevronsUpDown, X } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { InvoiceDocument } from "@/components/invoice/InvoiceDocument";
import { downloadInvoiceFromElement } from "@/utils/invoice-pdf";

const Invoice = () => {
  const [selectedOrders, setSelectedOrders] = useState<any[]>([]);
  const [companyName, setCompanyName] = useState("SOFTSLEEP SARL");
  const [companyAddress, setCompanyAddress] = useState("15 RES NOUR 1 IMM P MAG 02 OULED HLAL I HSAINE SALA AL JADIDA, SALE");
  const [companyPhone, setCompanyPhone] = useState("+212 659 530 932");
  const [companyEmail, setCompanyEmail] = useState("");
  const [companyRib, setCompanyRib] = useState("13150927");
  const [companyIce, setCompanyIce] = useState("003335255000005");
  const [invoiceNumber, setInvoiceNumber] = useState("INV-" + Date.now());
  const [invoiceDate, setInvoiceDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [dueDate, setDueDate] = useState(format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"));
  const [notes, setNotes] = useState("Merci de votre confiance.");
  const [paymentMode, setPaymentMode] = useState("Espèce");
  const [isCompanyInfoOpen, setIsCompanyInfoOpen] = useState(false);
  const [openCombobox, setOpenCombobox] = useState(false);
  const [dateFilter, setDateFilter] = useState("last3months");
  
  // Client Info State
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientCity, setClientCity] = useState("");

  const invoiceOrderFilters = useMemo(() => {
    const now = new Date();
    const endDate = endOfDay(now);
    const startDate =
      dateFilter === "thisMonth"
        ? startOfMonth(now)
        : subMonths(now, 3);

    return {
      status: "DELIVERED",
      limit: 300,
      startDate,
      endDate,
    };
  }, [dateFilter]);

  const { data: orders = [], isLoading } = useOrders(invoiceOrderFilters);
  const createInvoice = useCreateInvoice();
  const { data: nextReference } = useNextInvoiceReference();
  const invoiceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (nextReference) {
      setInvoiceNumber(nextReference);
    }
  }, [nextReference]);

  const handlePrint = useReactToPrint({
    contentRef: invoiceRef,
    documentTitle: `Invoice-${invoiceNumber}`,
    pageStyle: `
      @page {
        size: A4;
        margin: 0;
      }
      @media print {
        body {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        @page {
          margin: 0;
        }
      }
    `,
    onAfterPrint: () => console.log('Print completed'),
    onBeforePrint: () => Promise.resolve(console.log('Starting print...')),
    onPrintError: (errorLocation, error) => console.error('Print error:', errorLocation, error)
  });

  const handleDownloadPdf = async () => {
    const element = invoiceRef.current;
    if (!element) return;

    try {
      await downloadInvoiceFromElement(element, invoiceNumber);
    } catch (error) {
      console.error('PDF generation failed:', error);
    }
  };

  const calculateTotal = () => {
    if (selectedOrders.length === 0) return 0;
    return selectedOrders.reduce((sum, order) => {
      return sum + calculateOrderTotal(order.orderItems, order.totalAmount);
    }, 0);
  };

  const calculateSubtotal = () => calculateTotal() / 1.2;
  const calculateTaxAmount = () => calculateTotal() - calculateSubtotal();
  const previewItems = selectedOrders.flatMap((order) =>
    order.orderItems.map((item: any) => ({
      key: `${order.id}-${item.id}`,
      productName: getProductName(item),
      variantDetails: formatVariantDetails(item),
      quantity: Number(item.quantity || 0)
    }))
  );

  const handleSaveInvoice = async () => {
    if (selectedOrders.length === 0) return;

    const items = selectedOrders.flatMap((order) =>
      order.orderItems.map((item: any) => ({
        orderId: order.id,
        orderItemId: item.id,
        productName: getProductName(item),
        variantDetails: formatVariantDetails(item),
        quantity: Number(item.quantity || 0)
      }))
    );

    await createInvoice.mutateAsync({
      invoiceNumber,
      invoiceDate,
      dueDate,
      paymentMode,
      notes,
      companyName,
      companyAddress,
      companyPhone,
      companyEmail,
      companyRib,
      companyIce,
      clientName: clientName || "Client",
      clientPhone,
      clientAddress,
      clientCity,
      orderIds: selectedOrders.map((order) => Number(order.id)),
      items,
      subtotalHt: Number(calculateSubtotal().toFixed(2)),
      taxRate: 20,
      taxAmount: Number(calculateTaxAmount().toFixed(2)),
      totalTtc: Number(calculateTotal().toFixed(2)),
      currency: "MAD"
    });
  };

  const handleOrderSelect = (order: any) => {
    setSelectedOrders(prev => {
      const isSelected = prev.some(o => o.id === order.id);
      let newSelection;
      
      if (isSelected) {
        newSelection = prev.filter(o => o.id !== order.id);
      } else {
        newSelection = [...prev, order];
      }

      // Update client info based on the first selected order if any
      if (newSelection.length > 0) {
        const primaryOrder = newSelection[0];
        // Only update if it's the first order being selected
        if (prev.length === 0) {
          setClientName(primaryOrder.customerName || "");
          setClientPhone(primaryOrder.phone || "");
          setClientAddress(primaryOrder.address || "");
          setClientCity(primaryOrder.city || "");
        }
      } else {
        // Reset if no orders
        setClientName("");
        setClientPhone("");
        setClientAddress("");
        setClientCity("");
      }

      return newSelection;
    });
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
              <Label>Select Orders</Label>
              <div className="mb-2">
                <Select value={dateFilter} onValueChange={setDateFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Orders period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="thisMonth">This month</SelectItem>
                    <SelectItem value="last3months">Last 3 months</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openCombobox}
                    className="w-full justify-between h-auto min-h-[40px]"
                  >
                    <div className="flex flex-wrap gap-1">
                      {selectedOrders.length > 0
                        ? selectedOrders.map(order => (
                            <Badge variant="secondary" key={order.id} className="mr-1">
                              #{order.id}
                            </Badge>
                          ))
                        : "Select orders..."}
                    </div>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[350px] p-0">
                  <Command>
                    <CommandInput placeholder="Search order, name, or phone..." />
                    <CommandList>
                      <CommandEmpty>No order found.</CommandEmpty>
                      <CommandGroup>
                        {orders.map((order: any) => {
                          const isSelected = selectedOrders.some(o => o.id === order.id);
                          return (
                            <CommandItem
                              key={order.id}
                              value={`${order.id} ${order.customerName} ${order.phone}`}
                              onSelect={() => handleOrderSelect(order)}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  isSelected ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <div className="flex flex-col">
                                <span>Order #{order.id} - {order.customerName}</span>
                                <span className="text-xs text-gray-500">{order.phone}</span>
                              </div>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {selectedOrders.length > 0 && (
                <div className="mt-2 text-sm text-gray-500">
                  {selectedOrders.length} order(s) selected
                </div>
              )}
            </div>

            <Collapsible
              open={isCompanyInfoOpen}
              onOpenChange={setIsCompanyInfoOpen}
              className="border rounded-md p-4 bg-gray-50"
            >
              <CollapsibleTrigger asChild>
                <div className="flex items-center justify-between cursor-pointer">
                  <h3 className="text-sm font-semibold">Company Information</h3>
                  {isCompanyInfoOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 mt-4">
                <div>
                  <Label>Company Name</Label>
                  <Input 
                    value={companyName} 
                    onChange={(e) => setCompanyName(e.target.value)}
                  />
                </div>

                <div>
                  <Label>Subtitle / Address</Label>
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
                  <Label>RIB</Label>
                  <Input 
                    value={companyRib} 
                    onChange={(e) => setCompanyRib(e.target.value)}
                  />
                </div>

                <div>
                  <Label>ICE</Label>
                  <Input 
                    value={companyIce} 
                    onChange={(e) => setCompanyIce(e.target.value)}
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>

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
              <Label>Mode de paiement</Label>
              <Select value={paymentMode} onValueChange={setPaymentMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Espèce">Espèce</SelectItem>
                  <SelectItem value="Virement">Virement</SelectItem>
                  <SelectItem value="Chèque">Chèque</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedOrders.length > 0 && (
              <>
                <div className="border-t pt-4 mt-4">
                  <h3 className="font-semibold mb-3 text-sm text-gray-900">Client Information</h3>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs">Client Name</Label>
                      <Input 
                        value={clientName} 
                        onChange={(e) => setClientName(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Phone</Label>
                      <Input 
                        value={clientPhone} 
                        onChange={(e) => setClientPhone(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Address</Label>
                      <Input 
                        value={clientAddress} 
                        onChange={(e) => setClientAddress(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">City</Label>
                      <Input 
                        value={clientCity} 
                        onChange={(e) => setClientCity(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            <div className="grid grid-cols-3 gap-4">
              <Button
                onClick={handleSaveInvoice}
                variant="secondary"
                className="w-full"
                disabled={selectedOrders.length === 0 || createInvoice.isPending}
              >
                {createInvoice.isPending ? "Saving..." : "Save Invoice"}
              </Button>
              <Button 
                onClick={handlePrint} 
                variant="outline" 
                className="w-full"
                disabled={selectedOrders.length === 0}
              >
                Print Invoice
              </Button>
              <Button 
                onClick={handleDownloadPdf} 
                className="w-full"
                disabled={selectedOrders.length === 0}
              >
                Download PDF
              </Button>
            </div>
          </div>
        </div>

        {/* Invoice Preview */}
        <div className="w-2/3">
          <div ref={invoiceRef}>
            <InvoiceDocument
              companyName={companyName}
              companyAddress={companyAddress}
              companyIce={companyIce}
              companyRib={companyRib}
              companyPhone={companyPhone}
              invoiceNumber={invoiceNumber}
              invoiceDate={invoiceDate}
              dueDate={dueDate}
              clientName={clientName}
              clientPhone={clientPhone}
              clientAddress={clientAddress}
              clientCity={clientCity}
              items={previewItems}
              subtotalHt={calculateSubtotal()}
              taxAmount={calculateTaxAmount()}
              totalTtc={calculateTotal()}
              paymentMode={paymentMode}
            />
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default Invoice; 
