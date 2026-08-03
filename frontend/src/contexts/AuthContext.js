import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authToken, setAuthToken] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authReady, setAuthReady] = useState(false);

  const clearAuth = useCallback(() => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    setUser(null);
    setAuthToken(null);
    setIsAuthenticated(false);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    const userData = localStorage.getItem('user');

    if (!token || !userData) {
      setAuthReady(true);
      return;
    }

    try {
      JSON.parse(userData);
    } catch {
      clearAuth();
      setAuthReady(true);
      return;
    }

    const validateSession = async () => {
      try {
        const response = await fetch(`${process.env.REACT_APP_API_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          clearAuth();
          setAuthReady(true);
          return;
        }

        const freshUser = await response.json();
        setAuthToken(token);
        setUser(freshUser);
        setIsAuthenticated(true);
      } catch {
        clearAuth();
      } finally {
        setAuthReady(true);
      }
    };

    validateSession();
  }, [clearAuth]);

  const handleAuthSuccess = useCallback((userData, token) => {
    setUser(userData);
    setAuthToken(token);
    setIsAuthenticated(true);
  }, []);

  const handleUserUpdate = useCallback((updatedUser) => {
    setUser(updatedUser);
    localStorage.setItem('user', JSON.stringify(updatedUser));
  }, []);

  const handleSignOut = useCallback(() => {
    clearAuth();
  }, [clearAuth]);

  const value = useMemo(
    () => ({
      user,
      authToken,
      isAuthenticated,
      authReady,
      handleAuthSuccess,
      handleUserUpdate,
      handleSignOut,
      clearAuth,
    }),
    [
      user,
      authToken,
      isAuthenticated,
      authReady,
      handleAuthSuccess,
      handleUserUpdate,
      handleSignOut,
      clearAuth,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
