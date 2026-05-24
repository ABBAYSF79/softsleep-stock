import { useState } from "react";
import { format } from "date-fns";
import { MainLayout } from "@/components/layout/MainLayout";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { usePagination } from "@/hooks/usePagination";
import { usePillowStock } from "@/hooks/useApi";
import { PillowDialog } from "@/components/pillow-stock/PillowDialog";
import { PillowOperationDialog } from "@/components/pillow-stock/PillowOperationDialog";
import { PillowHistorySheet } from "@/components/pillow-stock/PillowHistorySheet";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { History, Lock, Plus, RefreshCw, Search } from "lucide-react";

const PillowStock = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPillow, setSelectedPillow] = useState<any>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isOperationOpen, setIsOperationOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem("pillow-stock-unlocked") === "1";
  });
  const [password, setPassword] = useState("");

  const { data: pillows, isLoading, error, refetch, isRefetching } = usePillowStock();

  const filtered = (pillows || []).filter((p: any) => {
    if (!searchQuery) return true;
    return String(p.name || "").toLowerCase().includes(searchQuery.toLowerCase());
  });

  const totalUnits = filtered.reduce((sum: number, p: any) => sum + (p.stock || 0), 0);
  const outOfStock = filtered.filter((p: any) => (p.stock || 0) === 0).length;

  const {
    currentPage,
    itemsPerPage,
    totalPages,
    startIndex,
    endIndex,
    handlePageChange,
    handleItemsPerPageChange,
  } = usePagination({
    totalItems: filtered.length,
    initialItemsPerPage: 10,
    storageKey: "pillow-stock-pagination-limit",
  });

  const paginated = filtered.slice(startIndex, endIndex);

  const getStockBadge = (stock: number) => {
    if (stock === 0) return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Out</Badge>;
    if (stock <= 10) return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Low</Badge>;
    return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">In</Badge>;
  };
  
  const errorMessage =
    (error as any)?.response?.data?.error ||
    (error as any)?.message ||
    "Error loading accessoires stock";

  if (!isUnlocked) {
    return (
      <MainLayout>
        <div className="max-w-[520px] mx-auto mt-10">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Accessoires Stock Locked
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-muted-foreground">
                Enter security code to access accessoires stock management.
              </div>
              <div className="grid gap-2">
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Security code"
                  autoFocus
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <Button type="button" variant="outline" onClick={() => navigate("/pillow-orders")}>
                  Back
                </Button>
                <Button
                  type="button"
                  className="bg-matles-600 hover:bg-matles-700"
                  onClick={() => {
                    if (password.trim() !== "admin123456") {
                      toast.error("Invalid code");
                      return;
                    }
                    sessionStorage.setItem("pillow-stock-unlocked", "1");
                    setIsUnlocked(true);
                    setPassword("");
                  }}
                >
                  Unlock
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Accessoires Stock</h1>
          <div className="text-sm text-gray-500">Independent stock control for accessoires</div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button onClick={() => setIsCreateOpen(true)} className="gap-2 bg-matles-600 hover:bg-matles-700">
            <Plus className="h-4 w-4" />
            Create Accessoire
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Accessoires</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filtered.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Units</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalUnits}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Out of Stock</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{outOfStock}</div>
          </CardContent>
        </Card>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search accessoire..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Accessoire</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {error ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="flex items-center justify-between gap-4 py-4">
                    <div className="text-sm text-red-600">{errorMessage}</div>
                    <Button variant="outline" onClick={() => refetch()} disabled={isRefetching}>
                      Retry
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : isLoading ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="py-6 text-sm text-gray-500">Loading...</div>
                </TableCell>
              </TableRow>
            ) : paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="py-8 text-center text-sm text-gray-500">No accessoires found.</div>
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-right">{Number(p.price).toFixed(2)}</TableCell>
                  <TableCell className="text-right font-bold">{p.stock}</TableCell>
                  <TableCell className="text-xs text-gray-500 whitespace-nowrap">
                    {p.createdAt ? format(new Date(p.createdAt), "dd/MM/yy HH:mm") : "-"}
                  </TableCell>
                  <TableCell>{getStockBadge(p.stock || 0)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedPillow(p);
                          setIsHistoryOpen(true);
                        }}
                        title="View History"
                      >
                        <History className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => {
                          setSelectedPillow(p);
                          setIsOperationOpen(true);
                        }}
                        className="bg-matles-600 hover:bg-matles-700"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Operations
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          itemsPerPage={itemsPerPage}
          onItemsPerPageChange={handleItemsPerPageChange}
          totalItems={filtered.length}
          startIndex={startIndex}
          endIndex={endIndex}
        />
      </div>

      <PillowDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />

      <PillowOperationDialog
        open={isOperationOpen}
        onOpenChange={setIsOperationOpen}
        pillow={selectedPillow}
      />

      <PillowHistorySheet open={isHistoryOpen} onOpenChange={setIsHistoryOpen} pillow={selectedPillow} />
    </MainLayout>
  );
};

export default PillowStock;
