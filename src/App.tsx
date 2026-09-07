import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import Stock from "./pages/Stock";
import PillowStock from "./pages/PillowStock";
import PillowOrders from "./pages/PillowOrders";
import PillowStockAnalytics from "./pages/PillowStockAnalytics";
import Orders from "./pages/Orders";
import OrderManagement from "./pages/OrderManagement";
import LivreurOrders from "./pages/LivreurOrders";
import LivreurStats from "./pages/LivreurStats";
import Users from "./pages/Users";
import Delivery from "./pages/Delivery";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import SalesOverview from "@/pages/SalesOverview";
import Activities from "@/pages/Activities";
import Invoice from "@/pages/Invoice";
import InvoicesTracking from "@/pages/InvoicesTracking";
import Finance from "@/pages/Finance";
import ProductOverview from "@/pages/ProductOverview";
import ConfirmationTeam from "@/pages/ConfirmationTeam";
import ConfirmationTeamOverview from "@/pages/ConfirmationTeamOverview";
import TeamOverview2 from "@/pages/TeamOverview2";
import AdvancedEdit from "@/pages/AdvancedEdit";
import InventoryOverviewPage from "@/pages/inventory/InventoryOverviewPage";
import InventoryStockPage from "@/pages/inventory/InventoryStockPage";
import InventoryReconciliationPage from "@/pages/inventory/InventoryReconciliationPage";
import InventoryLocationsPage from "@/pages/inventory/InventoryLocationsPage";
import InventoryTransfersPage from "@/pages/inventory/InventoryTransfersPage";
import InventoryTransferDetailPage from "@/pages/inventory/InventoryTransferDetailPage";
import InventoryDocumentsPage from "@/pages/inventory/InventoryDocumentsPage";
import InventoryDocumentDetailPage from "@/pages/inventory/InventoryDocumentDetailPage";
import InventoryHistoryPage from "@/pages/inventory/InventoryHistoryPage";
import InventoryReservationsPage from "@/pages/inventory/InventoryReservationsPage";
import InventoryCutoverPage from "@/pages/inventory/InventoryCutoverPage";
import { LayoutDashboard, Package, ShoppingCart, LineChart, UsersIcon } from "lucide-react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } />
            <Route path="/products" element={
              <ProtectedRoute>
                <Products />
              </ProtectedRoute>
            } />
            <Route path="/stock" element={
              <ProtectedRoute adminOnly>
                <Stock />
              </ProtectedRoute>
            } />
            <Route path="/inventory" element={
              <ProtectedRoute adminOnly>
                <InventoryOverviewPage />
              </ProtectedRoute>
            } />
            <Route path="/inventory/stock" element={
              <ProtectedRoute adminOnly>
                <InventoryStockPage />
              </ProtectedRoute>
            } />
            <Route path="/inventory/locations" element={
              <ProtectedRoute adminOnly>
                <InventoryLocationsPage />
              </ProtectedRoute>
            } />
            <Route path="/inventory/transfers" element={
              <ProtectedRoute adminOnly>
                <InventoryTransfersPage />
              </ProtectedRoute>
            } />
            <Route path="/inventory/transfers/:id" element={
              <ProtectedRoute adminOnly>
                <InventoryTransferDetailPage />
              </ProtectedRoute>
            } />
            <Route path="/inventory/documents" element={
              <ProtectedRoute adminOnly>
                <InventoryDocumentsPage />
              </ProtectedRoute>
            } />
            <Route path="/inventory/documents/:id" element={
              <ProtectedRoute adminOnly>
                <InventoryDocumentDetailPage />
              </ProtectedRoute>
            } />
            <Route path="/inventory/reservations" element={
              <ProtectedRoute adminOnly>
                <InventoryReservationsPage />
              </ProtectedRoute>
            } />
            <Route path="/inventory/history" element={
              <ProtectedRoute adminOnly>
                <InventoryHistoryPage />
              </ProtectedRoute>
            } />
            <Route path="/inventory/reconciliation" element={
              <ProtectedRoute adminOnly>
                <InventoryReconciliationPage />
              </ProtectedRoute>
            } />
            <Route path="/inventory/cutover" element={
              <ProtectedRoute adminOnly>
                <InventoryCutoverPage />
              </ProtectedRoute>
            } />
            <Route path="/pillow-stock" element={
              <ProtectedRoute adminOnly>
                <PillowStock />
              </ProtectedRoute>
            } />
            <Route path="/pillow-orders" element={
              <ProtectedRoute>
                <PillowOrders />
              </ProtectedRoute>
            } />
            <Route path="/pillow-stock-analytics" element={
              <ProtectedRoute adminOnly>
                <PillowStockAnalytics />
              </ProtectedRoute>
            } />
            <Route path="/orders" element={
              <ProtectedRoute>
                <Orders />
              </ProtectedRoute>
            } />
            <Route path="/orders-management" element={
              <ProtectedRoute>
                <OrderManagement />
              </ProtectedRoute>
            } />
            <Route path="/livreur/orders" element={
              <ProtectedRoute livreurOnly>
                <LivreurOrders />
              </ProtectedRoute>
            } />
            <Route path="/livreur/stats" element={
              <ProtectedRoute livreurOnly>
                <LivreurStats />
              </ProtectedRoute>
            } />
            <Route path="/sales" element={
              <ProtectedRoute>
                <SalesOverview />
              </ProtectedRoute>
            } />
            <Route path="/product-overview" element={
              <ProtectedRoute>
                <ProductOverview />
              </ProtectedRoute>
            } />
            <Route path="/users" element={
              <ProtectedRoute adminOnly>
                <Users />
              </ProtectedRoute>
            } />
            <Route path="/delivery" element={
              <ProtectedRoute>
                <Delivery />
              </ProtectedRoute>
            } />
            <Route path="/activities" element={
              <ProtectedRoute adminOnly>
                <Activities />
              </ProtectedRoute>
            } />
            <Route path="/advanced-edit" element={
              <ProtectedRoute adminOnly>
                <AdvancedEdit />
              </ProtectedRoute>
            } />
            <Route path="/invoice" element={
              <ProtectedRoute adminOnly>
                <Invoice />
              </ProtectedRoute>
            } />
            <Route path="/invoices" element={
              <ProtectedRoute adminOnly>
                <InvoicesTracking />
              </ProtectedRoute>
            } />
            <Route path="/finance" element={
              <ProtectedRoute adminOnly>
                <Finance />
              </ProtectedRoute>
            } />
            <Route path="/settings" element={
              <ProtectedRoute adminOnly>
                <Settings />
              </ProtectedRoute>
            } />
            <Route path="/confirmation-team" element={
              <ProtectedRoute>
                <ConfirmationTeam />
              </ProtectedRoute>
            } />
            <Route path="/confirmation-team-overview" element={
              <ProtectedRoute>
                <ConfirmationTeamOverview />
              </ProtectedRoute>
            } />
            <Route path="/team-overview-2" element={
              <ProtectedRoute>
                <TeamOverview2 />
              </ProtectedRoute>
            } />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
