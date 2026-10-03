import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { BrandMark } from '../components/BrandMark';
import { useAuth } from './AuthContext';

/** Gate for authenticated routes: splash → 401 → redirect to /login. */
export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas">
        <BrandMark className="size-12 animate-pulse" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}