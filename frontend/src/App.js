import React, { Suspense, lazy } from 'react';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { AppConfigProvider } from './contexts/AppConfigContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SavedProvider } from './contexts/SavedContext';
import { ProtectedRoute, PublicOnlyRoute } from './components/ProtectedRoute';
import OnboardingPage from './pages/OnboardingPage';
import HomePage from './pages/HomePage';
import ChatPage from './pages/ChatPage';
import ChatSearchPage from './pages/ChatSearchPage';
import AuthPage from './pages/AuthPage';
import CanvasPage from './pages/CanvasPage';
import UserGuide from './components/UserGuide';
import { ToastProvider } from './components/Toast';
import RouteFocus, { SkipLink } from './components/RouteFocus';
import muiTheme from './theme/muiTheme';
import './styles/components.css';

const CourseDetailPage = lazy(() => import('./pages/CourseDetailPage'));
const CoursesPage = lazy(() => import('./pages/CoursesPage'));
const CourseComparePage = lazy(() => import('./pages/CourseComparePage'));

const pageFallback = (label) => <div className="auth-boot-screen" role="status">{label}</div>;

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
        <Route
          path="/courses"
          element={<Suspense fallback={pageFallback('Loading courses…')}><CoursesPage /></Suspense>}
        />
        {/* Before the detail route, so "compare" is never read as a course id. */}
        <Route
          path="/courses/compare"
          element={<Suspense fallback={pageFallback('Loading compare…')}><CourseComparePage /></Suspense>}
        />
        <Route
          path="/courses/:courseIdentifier"
          element={(
            <Suspense fallback={<div className="auth-boot-screen" role="status">Loading course…</div>}>
              <CourseDetailPage />
            </Suspense>
          )}
        />
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
              <SavedProvider>
                <ToastProvider>
                  <SkipLink />
                  <RouteFocus />
                  <div className="App">
                    <AppRoutes />
                    <UserGuide />
                  </div>
                </ToastProvider>
              </SavedProvider>
            </AuthProvider>
          </MuiThemeProvider>
        </ThemeProvider>
      </AppConfigProvider>
    </BrowserRouter>
  );
}

export default App;
