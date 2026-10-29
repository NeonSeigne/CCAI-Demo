import React, { Suspense, lazy } from 'react';
import {
  BrowserRouter, Navigate, Outlet, Route, Routes,
} from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { AppConfigProvider } from './contexts/AppConfigContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SavedProvider } from './contexts/SavedContext';
import { PlannerProvider } from './contexts/PlannerContext';
import { ChatProvider } from './contexts/ChatContext';
import { ProtectedRoute, PublicOnlyRoute } from './components/ProtectedRoute';
import AppShell from './components/shell/AppShell';
import OnboardingPage from './pages/OnboardingPage';
import HomePage from './pages/HomePage';
import ChatPage from './pages/ChatPage';
import ChatSearchPage from './pages/ChatSearchPage';
import AuthPage from './pages/AuthPage';
import CanvasPage from './pages/CanvasPage';
import EventsPage from './pages/EventsPage';
import CourseRedirect from './components/course/CourseRedirect';
import UserGuide from './components/UserGuide';
import { ToastProvider } from './components/Toast';
import RouteFocus, { SkipLink } from './components/RouteFocus';
import './styles/components.css';

const SavedPage = lazy(() => import('./pages/SavedPage'));
// Lazy: Leaflet stays out of the main bundle (and out of tests that never open the map).
const CampusMapPage = lazy(() => import('./pages/CampusMapPage'));
const CoursesPage = lazy(() => import('./pages/CoursesPage'));
const CourseComparePage = lazy(() => import('./pages/CourseComparePage'));
// One course pop-up host for every signed-in page (eng R8). Lazy so the shell
// doesn't wait for it; CoursePopup itself also reaches the main bundle through
// the chat course cards, so this doesn't split it out.
const CoursePopupHost = lazy(() => import('./components/course/CoursePopupHost'));

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

/** The app shell with the course pop-up host, which reads `?course=` on any page. */
export function ShellWithPopups() {
  return (
    <AppShell>
      <Outlet />
      <Suspense fallback={null}><CoursePopupHost /></Suspense>
    </AppShell>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/" element={<OnboardingPage />} />
        <Route path="/auth" element={<AuthPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<ShellWithPopups />}>
          <Route path="/home" element={<HomePage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/search" element={<ChatSearchPage />} />
          <Route path="/canvas" element={<CanvasPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route
            path="/saved"
            element={(
              <Suspense fallback={<div className="auth-boot-screen" role="status">Loading saved items…</div>}>
                <SavedPage />
              </Suspense>
            )}
          />
          <Route
            path="/map"
            element={(
              <Suspense fallback={<div className="auth-boot-screen" role="status">Loading map…</div>}>
                <CampusMapPage />
              </Suspense>
            )}
          />
          <Route
            path="/courses"
            element={<Suspense fallback={pageFallback('Loading courses…')}><CoursesPage /></Suspense>}
          />
          {/* Before the redirect, so "compare" is never read as a course id. */}
          <Route
            path="/courses/compare"
            element={<Suspense fallback={pageFallback('Loading compare…')}><CourseComparePage /></Suspense>}
          />
          <Route path="/courses/:courseIdentifier" element={<CourseRedirect />} />
        </Route>
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
            <AuthProvider>
              <SavedProvider>
                <PlannerProvider>
                  <ChatProvider>
                    <ToastProvider>
                      <SkipLink />
                      <RouteFocus />
                      <div className="App">
                        <AppRoutes />
                        <UserGuide />
                      </div>
                    </ToastProvider>
                  </ChatProvider>
                </PlannerProvider>
              </SavedProvider>
            </AuthProvider>
        </ThemeProvider>
      </AppConfigProvider>
    </BrowserRouter>
  );
}

export default App;
