import React from 'react';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { AppConfigProvider } from './contexts/AppConfigContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ProtectedRoute, PublicOnlyRoute } from './components/ProtectedRoute';
import OnboardingPage from './pages/OnboardingPage';
import HomePage from './pages/HomePage';
import ChatPage from './pages/ChatPage';
import ChatSearchPage from './pages/ChatSearchPage';
import AuthPage from './pages/AuthPage';
import CanvasPage from './pages/CanvasPage';
import UserGuide from './components/UserGuide';
import muiTheme from './theme/muiTheme';
import './styles/components.css';

// Set REACT_APP_TESTING_ONBOARDING=true in your .env to force the onboarding
// tour to run on every page load. Leave unset in production — tour will only
// show once per user (localStorage).
export const TESTING_ONBOARDING = process.env.REACT_APP_TESTING_ONBOARDING === 'true';

// Set REACT_APP_ENABLE_DEV_LOGIN=true to show the homepage "Developer mode"
// button (auto-login as the seeded developer user). Requires ENABLE_DEV_LOGIN=true
// on the backend. Leave unset/false in real deployments.
export const ENABLE_DEV_LOGIN = process.env.REACT_APP_ENABLE_DEV_LOGIN === 'true';

function CatchAllRedirect() {
  const { isAuthenticated, authReady } = useAuth();
  if (!authReady) {
    return (
      <div className="auth-boot-screen" role="status" aria-live="polite">
        Checking session…
      </div>
    );
  }
  return <Navigate to={isAuthenticated ? '/home' : '/'} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/" element={<OnboardingPage />} />
        <Route path="/auth" element={<AuthPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route path="/home" element={<HomePage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/search" element={<ChatSearchPage />} />
        <Route path="/canvas" element={<CanvasPage />} />
      </Route>

      <Route path="*" element={<CatchAllRedirect />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppConfigProvider>
        <ThemeProvider>
          <MuiThemeProvider theme={muiTheme}>
            <AuthProvider>
              <div className="App">
                <AppRoutes />
                <UserGuide />
              </div>
            </AuthProvider>
          </MuiThemeProvider>
        </ThemeProvider>
      </AppConfigProvider>
    </BrowserRouter>
  );
}

export default App;
