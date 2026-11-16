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
import Orders from "./pages/Orders";
import OrderManagement from "./pages/OrderManagement";
import AmanaManagement from "./pages/AmanaManagement";
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
import QuickEdit from "@/pages/QuickEdit";
import ClientExport from "@/pages/ClientExport";
import ConfirmationPortal from "@/pages/ConfirmationPortal";
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
            <Route path="/mes-commandes" element={<ConfirmationPortal />} />
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
              <ProtectedRoute>
                <Stock />
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
            <Route path="/amana-management" element={
              <ProtectedRoute>
                <AmanaManagement />
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
            <Route path="/quick-edit" element={
              <ProtectedRoute>
                <QuickEdit />
              </ProtectedRoute>
            } />
            <Route path="/export-clients" element={
              <ProtectedRoute adminOnly>
                <ClientExport />
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
