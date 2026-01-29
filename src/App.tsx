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
import Users from "./pages/Users";
import Delivery from "./pages/Delivery";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import SalesOverview from "@/pages/SalesOverview";
import Activities from "@/pages/Activities";
import Invoice from "@/pages/Invoice";
import Finance from "@/pages/Finance";
import Leaderboard from "@/pages/Leaderboard";
import ConfirmationTeam from "@/pages/ConfirmationTeam";
import ConfirmationTeamOverview from "@/pages/ConfirmationTeamOverview";
import AdvancedEdit from "@/pages/AdvancedEdit";
import { LayoutDashboard, Package, ShoppingCart, LineChart, UsersIcon } from "lucide-react";

const queryClient = new QueryClient();

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
            <Route path="/orders" element={
              <ProtectedRoute>
                <Orders />
              </ProtectedRoute>
            } />
            <Route path="/sales" element={
              <ProtectedRoute>
                <SalesOverview />
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
            <Route path="/finance" element={
              <ProtectedRoute adminOnly>
                <Finance />
              </ProtectedRoute>
            } />
            <Route path="/leaderboard" element={
              <ProtectedRoute>
                <Leaderboard />
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
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;