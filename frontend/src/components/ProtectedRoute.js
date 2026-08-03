import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function ProtectedRoute() {
  const { isAuthenticated, authReady } = useAuth();

  if (!authReady) {
    return (
      <div className="auth-boot-screen" role="status" aria-live="polite">
        Checking session…
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  return <Outlet />;
}

export function PublicOnlyRoute() {
  const { isAuthenticated, authReady } = useAuth();

  if (!authReady) {
    return (
      <div className="auth-boot-screen" role="status" aria-live="polite">
        Checking session…
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/home" replace />;
  }

  return <Outlet />;
}
