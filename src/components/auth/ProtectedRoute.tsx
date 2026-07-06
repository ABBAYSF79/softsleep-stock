import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const LIVREUR_ALLOWED_PATHS = ['/livreur/orders', '/livreur/stats'];
const SUIVI_ALLOWED_PATHS = ['/orders-management', '/products', '/delivery'];

interface ProtectedRouteProps {
  children: React.ReactNode;
  adminOnly?: boolean;
  livreurOnly?: boolean;
}

export const ProtectedRoute = ({ children, adminOnly = false, livreurOnly = false }: ProtectedRouteProps) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (livreurOnly && user.role !== 'LIVREUR') {
    return <Navigate to="/" replace />;
  }

  if (user.role === 'LIVREUR' && !LIVREUR_ALLOWED_PATHS.includes(location.pathname)) {
    return <Navigate to="/livreur/orders" replace />;
  }

  if (user.role === 'SUIVI' && !SUIVI_ALLOWED_PATHS.includes(location.pathname)) {
    return <Navigate to="/orders-management" replace />;
  }

  if (adminOnly && user.role !== 'ADMIN') {
    if (user.role === 'LIVREUR') {
      return <Navigate to="/livreur/orders" replace />;
    }
    if (user.role === 'SUIVI') {
      return <Navigate to="/orders-management" replace />;
    }
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
