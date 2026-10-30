import React, { Suspense, lazy, useEffect } from 'react';
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
import EventsPage from './pages/EventsPage';
import SettingsPage from './pages/SettingsPage';
import CourseRedirect from './components/course/CourseRedirect';
import UserGuide from './components/UserGuide';
import BootScreen, { PageSkeleton } from './components/BootScreen';
import { ToastProvider } from './components/Toast';
import RouteFocus, { SkipLink } from './components/RouteFocus';
import { StartPlaceProvider } from './modules/campus';
import { clearCourseCache } from './modules/course';
import './styles/components.css';

const SavedPage = lazy(() => import('./pages/SavedPage'));
// Lazy: Leaflet stays out of the main bundle (and out of tests that never open the map).
const CampusMapPage = lazy(() => import('./pages/CampusMapPage'));
const CoursesPage = lazy(() => import('./pages/CoursesPage'));
const CourseComparePage = lazy(() => import('./pages/CourseComparePage'));
// One pop-up host for every signed-in page: ?course=, ?event= and ?place=
// (eng R8). Lazy so the shell doesn't wait for it; CoursePopup itself also
// reaches the main bundle through the chat course cards, so this doesn't
// split it out.
const PopupHost = lazy(() => import('./components/popup/PopupHost'));

const pageFallback = (label) => <PageSkeleton label={label} shape="page" />;

// Set REACT_APP_ENABLE_DEV_LOGIN=true to show the homepage "Developer mode"
// button (auto-login as the seeded developer user). Requires ENABLE_DEV_LOGIN=true
// on the backend. Leave unset/false in real deployments.
export const ENABLE_DEV_LOGIN = process.env.REACT_APP_ENABLE_DEV_LOGIN === 'true';

function CatchAllRedirect() {
  const { isAuthenticated, authReady } = useAuth();
  if (!authReady) {
    return <BootScreen />;
  }
  return <Navigate to={isAuthenticated ? '/home' : '/'} replace />;
}

/**
 * The app shell with the pop-up host, which reads `?course=`, `?event=` and
 * `?place=` on any page, and the student's start place, loaded once for
 * every page.
 */
export function ShellWithPopups() {
  // Signing out unmounts the shell; the next student starts with no cached courses.
  useEffect(() => () => clearCourseCache(), []);
  return (
    <StartPlaceProvider>
      <AppShell>
        <Outlet />
        <Suspense fallback={null}><PopupHost /></Suspense>
      </AppShell>
    </StartPlaceProvider>
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
          <Route path="/events" element={<EventsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route
            path="/saved"
            element={(
              <Suspense fallback={pageFallback('Loading saved items…')}>
                <SavedPage />
              </Suspense>
            )}
          />
          <Route
            path="/map"
            element={(
              <Suspense fallback={pageFallback('Loading map…')}>
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
