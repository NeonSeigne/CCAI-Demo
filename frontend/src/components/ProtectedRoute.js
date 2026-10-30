import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import BootScreen from './BootScreen';

export function ProtectedRoute() {
  const { isAuthenticated, authReady } = useAuth();

  if (!authReady) {
    return <BootScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  return <Outlet />;
}

export function PublicOnlyRoute() {
  const { isAuthenticated, authReady } = useAuth();

  if (!authReady) {
    return <BootScreen />;
  }

  if (isAuthenticated) {
    return <Navigate to="/home" replace />;
  }

  return <Outlet />;
}
